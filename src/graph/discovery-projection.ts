import type { GraphCatalog, GraphCatalogNode, GraphCatalogView, GraphFact, GraphNode } from '@weftlet/core';
import { contextPackLaneForFact } from './coverage-facts.js';
import { contextPackEvidenceAuthority } from './authority.js';
import { diagnosticKinds } from './diagnostics.js';
import { catalogViews } from './discovery-request.js';
import type { SnapshotEvidenceIndex } from './snapshot-index.js';

const intentKinds = new Set(['Capability', 'Workflow', 'Invariant', 'Contract', 'Document', 'Scope', 'Project']);
const kindOrder = ['Capability', 'Workflow', 'Invariant', 'Contract', 'Document', 'Scope', 'Project'];
const laneViews = { productIntent: 'intent', contractsAndInvariants: 'contracts',
  implementationAndConsumers: 'implementation', validationEvidence: 'evidence' } as const;

/** Facets may overlap. Intent sources include unreviewed assertions, explicitly labelled as such. */
export function catalogViewsForFact(fact: GraphFact): readonly GraphCatalogView[] {
  const lane = contextPackLaneForFact(fact);
  return [...new Set<GraphCatalogView>(['all', ...(lane ? [laneViews[lane]] : ['evidence' as const]),
    ...(fact.sourceRole === 'intent' ? ['intent' as const] : [])])];
}
function eligible(node: GraphNode, view: GraphCatalogView): boolean {
  return view !== 'intent' || intentKinds.has(node.kind) ||
    (node.kind === 'Component' && !node.id.startsWith('component:file:'));
}
export function catalogOverview(index: SnapshotEvidenceIndex): GraphCatalog['overview'] {
  const sets = Object.fromEntries(catalogViews.map(view => [view, new Set<string>()])) as Record<GraphCatalogView, Set<string>>;
  const views = Object.fromEntries(catalogViews.map(view => [view, { facts: 0, nodes: 0 }])) as Record<GraphCatalogView, { facts: number; nodes: number }>;
  for (const fact of index.snapshot.facts) for (const view of catalogViewsForFact(fact)) {
    views[view].facts++;
    for (const node of [fact.subject, fact.object]) if (eligible(node, view)) sets[view].add(node.id);
  }
  for (const view of catalogViews) views[view].nodes = sets[view].size;
  const diagnostics = [...new Map(index.snapshot.diagnostics?.map(item => [item.id, item])).values()];
  return { scope: 'saved-snapshot', facts: index.snapshot.facts.length, nodes: index.adjacency.size, views,
    diagnosticCounts: Object.fromEntries(diagnosticKinds.map(kind => [kind, diagnostics.filter(item => item.kind === kind).length])) as GraphCatalog['overview']['diagnosticCounts'],
    unclassifiedLegacyDiagnostics: index.snapshot.unresolved.length, code: index.code,
    limitations: [
      'Counts cover this saved snapshot, not all repository intent or dependencies. Navigation facets overlap.',
      'Intent lists saved intent-source/concept evidence; it does not grant approval. Source authority, assertion authority and extraction review remain separate.',
      'Intent starts with saved concept/document nodes; follow their relationships to code. Missing intent is a coverage gap, not permission to infer approved rules.',
      'Node descriptions are representatives of cited assertions, not a canonical statement of intent. Inspect exact facts for differing labels, attributes and authority.',
      'Static relationships and paths do not prove runtime causality. Historical snapshots do not validate current changes.',
    ] };
}
export interface CatalogEntry { readonly summary: GraphCatalogNode; readonly search: readonly string[] }
export function catalogEntries(index: SnapshotEvidenceIndex, view: GraphCatalogView, includedNodeIds?: ReadonlySet<string>): readonly CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  const adjacency = includedNodeIds ? [...includedNodeIds].map(id => [id, index.adjacency.get(id) ?? []] as const) : index.adjacency;
  for (const [id, incident] of adjacency) {
    const matching = incident.filter(fact => catalogViewsForFact(fact).includes(view) &&
      [fact.subject, fact.object].some(node => node.id === id && eligible(node, view)));
    if (!matching.length) continue;
    const representative = matching.reduce((a, b) => a.id < b.id ? a : b);
    const node = representative.subject.id === id ? representative.subject : representative.object;
    const authorities: Record<string, number> = {}, sourceAuthorities: Record<string, number> = {}, extractionReviews: Record<string, number> = {};
    const search = new Set([id.toLowerCase()]);
    for (const fact of matching) {
      for (const [counts, value] of [[authorities, contextPackEvidenceAuthority(fact)],
        [sourceAuthorities, fact.sourceAuthority ?? 'unspecified'], [extractionReviews, fact.extractionReview ?? 'unspecified']] as const) {
        counts[value] = (counts[value] ?? 0) + 1;
      }
      for (const endpoint of [fact.subject, fact.object]) if (endpoint.id === id) search.add(endpoint.label.toLowerCase());
      search.add(fact.provenance.path.toLowerCase());
    }
    entries.push({ summary: { node, representativeFactId: representative.id, citation: representative.provenance,
      incidentFacts: incident.length, matchingFacts: matching.length, authorities, sourceAuthorities, extractionReviews }, search: [...search] });
  }
  const order = (entry: CatalogEntry) => { const position = kindOrder.indexOf(entry.summary.node.kind); return position < 0 ? kindOrder.length : position; };
  return entries.sort((a, b) => order(a) - order(b) || (a.summary.node.id < b.summary.node.id ? -1 : 1));
}
