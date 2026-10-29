import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import type { ContextPack, GraphFact, GraphPathsRequest, GraphSnapshot } from '@weftlet/core';
import { SnapshotGraphPathService } from '../graph/paths.js';
import { renderContextPackHtml } from './visualization.js';

class Element {
  value = ''; textContent = ''; checked = true; disabled = false;
  classes = new Set<string>();
  events = new Map<string, () => void>();
  classList = { toggle: (name: string, on: boolean) => on ? this.classes.add(name) : this.classes.delete(name),
    contains: (name: string) => this.classes.has(name) };
  constructor(readonly dataset: Record<string, string> = {}) {}
  addEventListener(name: string, callback: () => void) { this.events.set(name, callback); }
  append(..._values: unknown[]) {}
  replaceChildren() {}
  click() { this.events.get('click')!(); }
}

function fixture() {
  const facts: GraphFact[] = [['1','a','b'], ['2','a','b'], ['3','b','t'], ['4','a','t'], ['5','b','a']].map(([id, from, to]) => ({
    id: id!, subject: { id: from!, kind: 'Component', label: 'Duplicate label' },
    object: { id: to!, kind: 'Component', label: 'Duplicate label' }, predicate: id === '3' ? 'routesThrough' : 'references',
    snapshotId: 's', confidence: 1, authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed',
    extractor: { id: 'fixture', version: '1' }, provenance: { path: 'docs/public.md', startLine: 1, endLine: 2, digest: id!, commitSha: 'a'.repeat(40) },
  }));
  const snapshot: GraphSnapshot = { manifest: { schemaVersion: 1, repositoryId: 'public/viewer', ref: 'HEAD', snapshotId: 's',
    commitSha: 'a'.repeat(40), contentDigest: 's', ontologyVersion: '1', extractorVersions: {}, semanticModel: 'none',
    semanticPromptVersion: '1', generatedAt: '', semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
    facts, invariants: [], runtimeEvidence: [], unresolved: [] };
  return { snapshot, service: new SnapshotGraphPathService({ read: async () => snapshot }) };
}

it('executes rendered viewer controls with exact path/continuation parity against the RDF service', async () => {
  const { snapshot, service } = fixture();
  const initial = await service.paths({ snapshotId: 's', fromNodeId: 'a', toNodeId: 't' });
  const pack: ContextPack = { snapshot: initial.snapshot, facts: snapshot.facts, capabilities: [], invariants: [], runtimeEvidence: [],
    suggestedFiles: [], coverage: initial.coverage, diagnostics: initial.diagnostics, markdown: '' };
  const html = renderContextPackHtml(pack);
  const model = JSON.parse(html.match(/<script id="visual-model" type="application\/json">([\s\S]*?)<\/script>/)![1]!);
  const ids = new Map<string, Element>();
  const get = (id: string) => { if (!ids.has(id)) ids.set(id, new Element()); return ids.get(id)!; };
  get('visual-model').textContent = JSON.stringify(model);
  get('neighbors-only').checked = false;
  const layers = ['inferred', 'implemented', 'declared', 'draft', 'observed', 'validated'].map(layer => new Element({ layer }));
  const edges = snapshot.facts.map(fact => new Element({ edgeId: fact.id, from: fact.subject.id, to: fact.object.id, search: '' }));
  const nodes = ['a', 'b', 't'].map(nodeId => new Element({ nodeId }));
  const rows = edges.map(edge => new Element({ edgeId: edge.dataset.edgeId! }));
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)![1]!, { document: {
    getElementById: get, createElement: () => new Element(),
    querySelectorAll: (selector: string) => ({ '[data-layer]': layers, '[data-visual-edge]': edges,
      '[data-visual-node]': nodes, '[data-relationship-row]': rows })[selector],
  } });
  const cases: GraphPathsRequest[] = [
    { snapshotId: 's', fromNodeId: 'a', toNodeId: 't' },
    { snapshotId: 's', fromNodeId: 't', toNodeId: 'a', direction: 'incoming' },
    { snapshotId: 's', fromNodeId: 'b', toNodeId: 't', direction: 'both' },
    { snapshotId: 's', fromNodeId: 'a', toNodeId: 't', predicates: ['references'] },
    { snapshotId: 's', fromNodeId: 'a', toNodeId: 't', maxDepth: 1 },
    { snapshotId: 's', fromNodeId: 'a', toNodeId: 'a', predicates: ['verifiedBy'] },
  ];
  for (const input of cases) {
    const request = { ...input, maxPaths: 1, maxSteps: 1000 };
    nodes.find(node => node.dataset.nodeId === input.fromNodeId)!.click();
    get('path-target').value = input.toNodeId;
    get('path-depth').value = String(input.maxDepth ?? 8);
    get('path-direction').value = input.direction ?? 'outgoing';
    get('path-predicate').value = input.predicates?.[0] ?? '';
    get('highlight-path').click();
    let expected = await service.paths(request);
    for (let page = 0; ; page++) {
      expect(page).toBeLessThan(20);
      expect(edges.filter(edge => edge.classes.has('is-highlighted')).map(edge => edge.dataset.edgeId).sort())
        .toEqual([...(expected.paths[0]?.factIds ?? [])].sort());
      expect(get('path-status').textContent).toContain(expected.search.stopReason);
      expect(get('next-path').disabled).toBe(!expected.search.continuation);
      if (!expected.search.continuation) break;
      expected = await service.paths({ ...request, continuation: expected.search.continuation });
      get('next-path').click();
    }
  }
  layers[0]!.checked = false; layers[0]!.events.get('change')!();
  expect(edges.some(edge => edge.classes.has('is-highlighted'))).toBe(false);
  expect(get('next-path').disabled).toBe(true);
  get('path-target').value = 't';
  get('highlight-path').click();
  expect(get('path-status').textContent).toContain('No path returned');
  expect(get('path-status').textContent).toContain('Displayed facts');
});
