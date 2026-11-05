import type { ExplorerMetadata } from '../explorer-contract.js';
import type { Scope } from './scope.js';
import { byId } from './dom.js';
import { showGaps } from './inspector.js';

export function showScopeDetails(value: Scope, nodes: number, facts: number, focused: boolean,
  metadata: ExplorerMetadata, status: (text: string) => void) {
  if (value.kind === 'catalog') {
    byId<HTMLSelectElement>('view').value = value.result.selection.view;
    byId<HTMLInputElement>('search').value = value.request.search ?? '';
    const selection = value.result.selection;
    byId('coverage-label').textContent = `${value.result.overview.views.intent.nodes} intent navigation items · ${value.result.overview.facts.toLocaleString()} saved facts`;
    status(`${nodes} nodes visible · ${selection.returnedNodes}/${selection.matchingNodes} catalog matches on this page · ${selection.remainingNodes} remain · ${facts} connections loaded for this view`);
    byId('empty').hidden = nodes > 0;
    byId('empty').textContent = value.result.overview.views.intent.nodes === 0 && selection.view === 'intent'
      ? 'No qualifying intent concepts were found in this saved snapshot. Inspect selected documents and source classification; code is available under Implementation.'
      : 'No nodes match this page and its filters. Broaden the search or change the evidence view.';
    showGaps(byId('gaps'), metadata.diagnostics);
  } else if (value.kind === 'node') {
    const selection = value.result.selection;
    status(`${facts}/${selection.returnedFacts} returned assertions visible · ${selection.matchingFacts} matching relationships · ${selection.remainingFacts} remain · ${selection.filteredFacts} excluded by query filters`);
    byId('empty').hidden = facts > 0;
    byId('empty').textContent = value.result.focus.status === 'absent-from-snapshot' ? 'This exact node is absent from the saved snapshot.' : 'No relationships match the selected filters.';
    showGaps(byId('gaps'), value.result.diagnostics);
  } else {
    status(`${value.result.paths.length} paths on this page · ${value.result.search.examinedSteps} steps examined · ${value.result.search.truncated ? 'search incomplete; inspect limits and continue' : 'search exhausted within selected depth'} · static paths do not prove causality`);
    showGaps(byId('gaps'), value.result.diagnostics);
    byId('empty').hidden = facts > 0;
    byId('empty').textContent = 'No path returned on this bounded page. Inspect the search frontier before concluding there is no connection.';
  }
}
