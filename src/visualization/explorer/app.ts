import type { GraphCatalogRequest, GraphCatalogView, GraphFact, GraphNeighborsRequest, GraphNode, GraphPathsRequest } from '@weftlet/core';
import type { ExplorerDataSource, ExplorerMetadata } from '../explorer-contract.js';
import { LiveEvidenceSource } from './client.js';
import { PortableEvidenceSource } from './portable-client.js';
import { EvidenceCanvas, type ViewportState } from './graph.js';
import { byId, element, navigationButton } from './dom.js';
import { showAssertions, showFocus, showGaps } from './inspector.js';

import { visibleScopeGraph, type Scope } from './scope.js';
import { showScopeDetails } from './scope-details.js';
type SavedScope = { scope: Scope; viewport: ViewportState; authority: string };

async function main() {
  const response = await fetch('./explorer.json');
  if (!response.ok) throw new Error('Unable to open the saved-evidence explorer');
  const metadata: ExplorerMetadata = await response.json();
  if (metadata.version !== 1) throw new Error('Unsupported explorer data version');
  const source: ExplorerDataSource = metadata.mode === 'portable' ? await PortableEvidenceSource.open(metadata) : new LiveEvidenceSource(metadata);
  const snapshotId = metadata.snapshot.snapshotId;
  let scope: Scope | undefined, generation = 0;
  const history: SavedScope[] = [];
  const knownNodes = new Map<string, GraphNode>();
  const authority = byId<HTMLSelectElement>('authority');
  const canvas = new EvidenceCanvas(byId('graph'), id => void enter(id), facts => showAssertions(facts, id => void enter(id), metadata.sourceUrlTemplate));
  const status = (text: string) => { byId('status').textContent = text; };
  const run = async (work: (ticket: number) => Promise<void>) => {
    const ticket = ++generation;
    byId('error').hidden = true;
    try { await work(ticket); }
    catch (error) {
      if (ticket !== generation) return;
      byId('error').textContent = error instanceof Error ? error.message : 'Query failed'; byId('error').hidden = false; status('Query failed. The previous view is retained.');
    }
  };
  const save = () => {
    if (scope) history.push({ scope, viewport: canvas.capture(), authority: authority.value });
    if (history.length > 30) history.shift();
  };
  function render(value: Scope, viewport?: ViewportState) {
    scope = value;
    const { facts, nodes, focus } = visibleScopeGraph(value, authority.value, knownNodes);
    if (value.kind === 'node') {
      byId<HTMLSelectElement>('direction').value = value.request.direction ?? 'both';
      byId<HTMLSelectElement>('predicate').value = value.request.predicates?.[0] ?? '';
    }
    canvas.render([...nodes.values()], facts, focus?.id, viewport, new Set([...nodes.keys()].filter(id => source.canExplore?.(id) === false)));
    if (value.kind === 'path') canvas.highlight(new Set(value.result.paths.flatMap(path => path.factIds)));
    showFocus(focus, facts, id => void enter(id), metadata.sourceUrlTemplate, metadata.capabilities.paths);
    byId('scope').textContent = value.kind === 'catalog' ? `${value.result.selection.view} overview` : focus?.label ?? 'Evidence paths';
    byId('related').replaceChildren();
    for (const node of nodes.values()) if (node.id !== focus?.id) navigationButton(byId('related'), node.label,
      node.kind + (source.canExplore?.(node.id) === false ? ' · outside report' : ''), () => void enter(node.id));
    byId<HTMLButtonElement>('back').disabled = !history.length;
    const next = byId<HTMLButtonElement>('next'); next.hidden = value.kind === 'path' ? !value.result.search.continuation : !value.result.selection.continuation;
    byId('node-filters').hidden = value.kind !== 'node';
    byId('connections').hidden = value.kind !== 'catalog';
    showScopeDetails(value, nodes.size, facts.length, metadata, status);
    const selectionDetail = value.kind === 'path' ? { search: value.result.search, frontier: value.result.frontier } : value.result.selection;
    byId('selection-details').textContent = JSON.stringify(selectionDetail, null, 2);
    showHistory();
  }
  function showHistory() {
    byId('breadcrumbs').replaceChildren();
    for (const [index, prior] of history.entries()) {
      if (index < history.length - 5) continue;
      const label = prior.scope.kind === 'catalog' ? prior.scope.result.selection.view : prior.scope.kind === 'node' ? prior.scope.request.nodeId : 'Paths';
      const button = element('button', label.length > 45 ? label.slice(0, 42) + '…' : label);
      button.title = label; button.onclick = () => backTo(index); byId('breadcrumbs').append(button);
    }
  }
  function backTo(index: number) {
    const prior = history[index]; if (!prior) return;
    generation++; history.splice(index); authority.value = prior.authority; render(prior.scope, prior.viewport);
  }
  async function catalog(request: GraphCatalogRequest) {
    await run(async ticket => {
      status('Loading the saved catalog…');
      const result = await source.catalog(request); if (ticket !== generation) return;
      save(); render({ kind: 'catalog', request, result, facts: [] });
      if (result.selection.view === 'intent' && result.nodes.length) await overviewConnections(false);
    });
  }
  async function enter(nodeId: string, continuation?: string, force = false) {
    if (scope?.kind === 'node' && scope.request.nodeId === nodeId && !continuation && !force) return;
    await run(async ticket => {
      status('Loading cited relationships…');
      const request: GraphNeighborsRequest = { snapshotId, nodeId, maxFacts: 30,
        direction: byId<HTMLSelectElement>('direction').value as 'both' | 'incoming' | 'outgoing',
        predicates: metadata.predicates.filter(predicate => predicate === byId<HTMLSelectElement>('predicate').value),
        ...(continuation ? { continuation } : {}) };
      const result = await source.neighbors(request); if (ticket !== generation) return;
      save(); render({ kind: 'node', request, result });
    });
  }
  async function overviewConnections(remember = true) {
    if (scope?.kind !== 'catalog') return;
    const current = scope;
    await run(async ticket => {
      const ids = new Set(current.result.nodes.map(item => item.node.id)), facts = new Map<string, GraphFact>();
      let incomplete = 0;
      for (const id of ids) {
        status(`Loading connections within this ${ids.size}-node overview…`);
        const result = await source.neighbors({ snapshotId, nodeId: id, maxFacts: 60 });
        if (ticket !== generation) return;
        if (result.selection.truncated) incomplete++;
        for (const fact of result.facts) if (ids.has(fact.subject.id) && ids.has(fact.object.id)) facts.set(fact.id, fact);
      }
      if (remember) save(); render({ ...current, facts: [...facts.values()] });
      status(`${facts.size} saved assertions connect these overview nodes · ${incomplete} node queries have additional pages · enter a node to inspect all of its relationships`);
    });
  }
  byId('repository').textContent = metadata.repositoryId;
  byId('mode').textContent = metadata.mode === 'local' ? 'Local · saved evidence' : 'Portable · saved evidence';
  if (metadata.report) {
    const report = metadata.report, banner = byId('report-scope'); banner.hidden = false;
    banner.append(element('p', `Focused report: ${report.includedFacts.toLocaleString()} of ${report.sourceFacts.toLocaleString()} source facts · ${report.expandedNodes} complete neighborhoods · ${report.frontierNodes} frontier nodes. Search covers this report. Dashed nodes require the full snapshot for further exploration. Full-snapshot path search is available in the local explorer.`));
    for (const root of report.roots) { const button = element('button', root); button.onclick = () => void enter(root); banner.append(button); }
  }
  byId('snapshot-label').textContent = `Commit ${metadata.snapshot.commitSha.slice(0, 12)} · ${metadata.snapshot.overlayDigest ? 'draft overlay' : 'committed snapshot'}`;
  const displayState = (current: ExplorerMetadata) => {
    byId('snapshot-details').textContent = JSON.stringify({ snapshot: current.snapshot, checkout: current.checkout, report: current.report }, null, 2);
    const state = current.checkout?.state;
    byId('snapshot-state').textContent = [state?.stale ? 'Historical or stale evidence' : 'Pinned saved evidence',
      state?.configurationMatches === false ? 'configuration differs' : '', state?.extractionCompatible === false ? 'extraction versions differ' : '',
      state?.excludedWorkingChanges.length ? `${state.excludedWorkingChanges.length} working changes excluded` : '',
      current.snapshot.documentSelection?.complete === false ? 'document coverage incomplete' : '',
      current.checkout ? `${current.mode === 'portable' ? 'captured at export' : 'checked'} ${new Date(current.checkout.checkedAt).toLocaleString()}` : 'checkout state unavailable'].filter(Boolean).join(' · ');
  };
  displayState(metadata);
  byId('refresh-state').hidden = metadata.mode === 'portable';
  byId('refresh-state').onclick = () => {
    void fetch('./explorer.json').then(async response => {
      if (!response.ok) throw new Error('Unable to refresh checkout state');
      displayState(await response.json());
    }).catch(error => { byId('error').textContent = error.message; byId('error').hidden = false; });
  };
  const count = Object.values(metadata.diagnostics).reduce<number>((sum, value) => typeof value === 'number' ? sum + value : sum + value.items.length + value.omittedRelevant, 0);
  byId('gap-count').textContent = `${count} saved diagnostic records`;
  byId('gap-count').onclick = () => { showGaps(byId('gaps'), metadata.diagnostics); byId<HTMLDetailsElement>('gap-panel').open = true; };
  byId('home').onclick = () => void catalog({ snapshotId });
  byId('back').onclick = () => backTo(history.length - 1);
  byId('fit').onclick = () => canvas.fit();
  byId('zoom-in').onclick = () => canvas.zoom(1.2);
  byId('zoom-out').onclick = () => canvas.zoom(1 / 1.2);
  authority.onchange = () => { if (scope) render(scope, canvas.capture()); };
  byId<HTMLFormElement>('search-form').onsubmit = event => { event.preventDefault(); void catalog({ snapshotId,
    view: byId<HTMLSelectElement>('view').value as GraphCatalogView, search: byId<HTMLInputElement>('search').value }); };
  byId<HTMLSelectElement>('view').onchange = () => byId<HTMLFormElement>('search-form').requestSubmit();
  byId<HTMLSelectElement>('direction').onchange = () => {
    if (scope?.kind === 'node') void enter(scope.request.nodeId, undefined, true);
  };
  for (const predicate of metadata.predicates) { const option = element('option', predicate); option.value = predicate; byId('predicate').append(option); }
  byId<HTMLSelectElement>('predicate').onchange = byId<HTMLSelectElement>('direction').onchange;
  byId('connections').onclick = () => void overviewConnections();
  byId('next').onclick = () => {
    if (scope?.kind === 'catalog') void catalog({ ...scope.request, continuation: scope.result.selection.continuation });
    else if (scope?.kind === 'node') void enter(scope.request.nodeId, scope.result.selection.continuation);
    else if (scope?.kind === 'path') void findPaths({ ...scope.request, continuation: scope.result.search.continuation });
  };
  byId('path-form').parentElement!.hidden = !metadata.capabilities.paths;
  async function findPaths(request: GraphPathsRequest) {
    await run(async ticket => {
      status('Searching bounded saved paths…');
      const result = await source.paths(request);
      if (ticket !== generation) return; save(); render({ kind: 'path', result, request });
    });
  }
  byId<HTMLFormElement>('path-form').onsubmit = event => {
    event.preventDefault(); void findPaths({ snapshotId, fromNodeId: byId<HTMLInputElement>('from-node').value,
      toNodeId: byId<HTMLInputElement>('to-node').value, maxDepth: Number(byId<HTMLInputElement>('path-depth').value),
      maxPaths: Number(byId<HTMLInputElement>('path-count').value), maxSteps: Number(byId<HTMLInputElement>('path-steps').value),
      direction: byId<HTMLSelectElement>('path-direction').value as 'both' | 'incoming' | 'outgoing' });
  };
  await catalog({ snapshotId });
}
void main().catch(error => { byId('error').hidden = false; byId('error').textContent = error instanceof Error ? error.message : 'Explorer startup failed'; });
