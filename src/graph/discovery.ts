import type { GraphCatalog, GraphCatalogRequest, GraphCatalogView, GraphDiscoveryService, GraphFactDetail, GraphFactRequest } from '@weftlet/core';
import { selectDiagnostics } from './diagnostics.js';
import { parseGraphCatalogRequest, parseGraphFactRequest } from './discovery-request.js';
import { catalogEntries, catalogOverview, type CatalogEntry } from './discovery-projection.js';
import { SnapshotIndexReader, type RevisionedSnapshotReader, type SnapshotEvidenceIndex } from './snapshot-index.js';
import { snapshotContext } from './snapshot-context.js';

export const GRAPH_CATALOG_VERSION = 'snapshot-catalog-v1';
function offsetFor(token: string | undefined, binding: string, length: number, pageSize: number): number {
  if (token === undefined) return 0;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
    const value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!value || Object.keys(value).sort().join(',') !== 'binding,offset,version' ||
      value.version !== GRAPH_CATALOG_VERSION || value.binding !== binding || !Number.isSafeInteger(value.offset) ||
      value.offset < 1 || value.offset >= length || value.offset % pageSize !== 0) throw new Error();
    return value.offset;
  } catch { throw new Error('Invalid graph.catalog continuation or query/snapshot mismatch; restart graph.catalog'); }
}
export function renderGraphCatalog(result: Omit<GraphCatalog, 'markdown'>): string {
  return [`Graph catalog: ${result.snapshot.snapshotId} (${result.snapshot.commitSha})`,
    `Saved evidence: ${result.overview.facts} facts / ${result.overview.nodes} nodes; ${result.overview.views.intent.nodes} intent navigation nodes.`,
    `${result.selection.view}: ${result.selection.returnedNodes}/${result.selection.matchingNodes} matching nodes; ${result.selection.remainingNodes} remain.`,
    ...result.nodes.map(item => `${item.node.kind}: ${item.node.label} [${item.node.id}] — ${item.matchingFacts} matching assertions; ` +
      `authority ${JSON.stringify(item.authorities)}; source ${JSON.stringify(item.sourceAuthorities)}; review ${JSON.stringify(item.extractionReviews)}; ` +
      `${item.citation.path}:${item.citation.startLine} (representative ${item.representativeFactId})`),
    ...(result.evidenceState ? [`Saved evidence state: ${JSON.stringify(result.evidenceState)}`] : []),
    ...result.overview.limitations,
    ...(result.selection.continuation ? [`Continue: ${result.selection.continuation}`] : [])].join('\n');
}
export function renderGraphFact(result: Omit<GraphFactDetail, 'markdown'>): string {
  const fact = result.fact;
  return [`Assertion ${result.factId}: ${result.status}; snapshot ${result.snapshot.snapshotId} (${result.snapshot.commitSha}).`,
    ...(fact ? [`${fact.subject.id} — ${fact.predicate} → ${fact.object.id}`,
      `${fact.provenance.path}:${fact.provenance.startLine}–${fact.provenance.endLine}; ${fact.extractor.id}@${fact.extractor.version}`,
      `Authority: ${fact.authority ?? 'unspecified'}; source: ${fact.sourceAuthority ?? 'unspecified'}; review: ${fact.extractionReview ?? 'unspecified'}.`] : []),
    ...(result.evidenceState ? [`Saved evidence state: ${JSON.stringify(result.evidenceState)}`] : [])].join('\n');
}
export class SnapshotGraphDiscoveryService implements GraphDiscoveryService {
  private readonly indexes: SnapshotIndexReader;
  private readonly catalogs = new WeakMap<SnapshotEvidenceIndex, { overview: GraphCatalog['overview']; views: Map<GraphCatalogView, readonly CatalogEntry[]> }>();
  constructor(store: RevisionedSnapshotReader, indexes?: SnapshotIndexReader) { this.indexes = indexes ?? new SnapshotIndexReader(store); }
  async catalog(input: GraphCatalogRequest): Promise<GraphCatalog> {
    const request = parseGraphCatalogRequest(input);
    const index = await this.indexes.read(request.snapshotId);
    let catalog = this.catalogs.get(index);
    if (!catalog) { catalog = { overview: catalogOverview(index), views: new Map() }; this.catalogs.set(index, catalog); }
    let entries = catalog.views.get(request.view);
    if (!entries) { entries = catalogEntries(index, request.view); catalog.views.set(request.view, entries); }
    const matching = request.search ? entries.filter(entry => entry.search.some(value => value.includes(request.search))) : entries;
    const { continuation, ...query } = request;
    const binding = index.binding(GRAPH_CATALOG_VERSION, query);
    const offset = offsetFor(continuation, binding, matching.length, request.maxNodes);
    const nodes = matching.slice(offset, offset + request.maxNodes).map(entry => entry.summary);
    const end = offset + nodes.length;
    const next = end < matching.length ? Buffer.from(JSON.stringify({ version: GRAPH_CATALOG_VERSION, binding, offset: end })).toString('base64url') : undefined;
    const result: Omit<GraphCatalog, 'markdown'> = { snapshot: snapshotContext(index.snapshot.manifest),
      nodes: structuredClone(nodes), overview: structuredClone(catalog.overview),
      selection: { version: GRAPH_CATALOG_VERSION, view: request.view, search: request.search, maxNodes: request.maxNodes,
        matchingNodes: matching.length, offset, returnedNodes: nodes.length, remainingNodes: matching.length - end,
        truncated: Boolean(next), ...(next ? { continuation: next } : {}) } };
    return { ...result, markdown: renderGraphCatalog(result) };
  }
  async fact(input: GraphFactRequest): Promise<GraphFactDetail> {
    const request = parseGraphFactRequest(input), index = await this.indexes.read(request.snapshotId);
    const fact = index.byFact.get(request.factId);
    const result: Omit<GraphFactDetail, 'markdown'> = { snapshot: snapshotContext(index.snapshot.manifest), factId: request.factId,
      status: fact ? 'present' : 'absent-from-snapshot', ...(fact ? { fact } : {}),
      diagnostics: selectDiagnostics(index.snapshot, {}, fact ? [fact] : [], [], [],
        new Set(fact ? [fact.subject.id, fact.object.id] : [])) };
    return { ...result, markdown: renderGraphFact(result) };
  }
}
