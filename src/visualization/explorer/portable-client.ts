import type { DiagnosticReport, GraphCatalog, GraphCatalogRequest, GraphFact, GraphFactDetail, GraphFactRequest,
  GraphNeighborhood, GraphNeighborsRequest, GraphPaths, GraphPathsRequest } from '@weftlet/core';
import type { ExplorerDataSource, ExplorerMetadata } from '../explorer-contract.js';
import type { PortableEvidenceIndex } from '../portable-contract.js';
import { parseGraphCatalogRequest, parseGraphFactRequest } from '../../graph/discovery-request.js';
import { parseGraphNeighborsRequest } from '../../graph/neighborhood-request.js';
import { selectNeighborhoodFacts, neighborhoodFrontier } from '../../graph/neighborhood-projection.js';
import { pageCoverageForFacts } from '../../graph/coverage-facts.js';
import { diagnosticKinds, selectDiagnostics } from '../../graph/diagnostics.js';
import { fetchReportJson, portablePage } from './portable-pages.js';

function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value); for (const child of Object.values(value)) freeze(child);
}

/** Answers supported reads for complete included neighborhoods, never from a fake subset snapshot. */
export class PortableEvidenceSource implements ExplorerDataSource {
  private readonly expanded: Map<string, readonly string[]>;
  private readonly degrees: Map<string, number>;
  private readonly factFiles: Map<string, string>;
  private readonly chunks = new Map<string, Promise<ReadonlyMap<string, GraphFact>>>();
  private constructor(readonly metadata: ExplorerMetadata, private readonly index: PortableEvidenceIndex,
    private readonly read: (path: string) => Promise<unknown>) {
    freeze(index); freeze(metadata);
    this.expanded = new Map(index.expanded.map(item => [item.nodeId, item.factIds]));
    this.degrees = new Map(index.degrees.map(item => [item.nodeId, item.count]));
    this.factFiles = new Map(index.facts.map(item => [item.factId, item.chunk]));
    if (this.expanded.size !== index.expanded.length || this.factFiles.size !== index.facts.length) throw new Error('Duplicate portable read-table identities');
  }
  static async open(metadata: ExplorerMetadata, read = fetchReportJson) {
    if (metadata.mode !== 'portable' || metadata.report?.scope !== 'focused-report') throw new Error('Expected a focused portable report');
    const index = await read(metadata.report.indexFile) as PortableEvidenceIndex;
    if (index.version !== 1 || index.evidenceDigest !== metadata.evidenceDigest) throw new Error('Portable report does not match the pinned evidence');
    return new PortableEvidenceSource(metadata, index, read);
  }
  canExplore(nodeId: string) { return this.expanded.has(nodeId); }
  private pinned(snapshotId: string) {
    if (snapshotId !== this.metadata.snapshot.snapshotId) throw new Error('Query must use the portable report snapshot');
  }
  private async readFact(id: string): Promise<GraphFact> {
    const path = this.factFiles.get(id);
    if (!path) throw new Error('Assertion is outside this focused report; query the full saved snapshot');
    let chunk = this.chunks.get(path);
    if (!chunk) {
      chunk = this.read(path).then(value => {
        if (!Array.isArray(value)) throw new Error('Invalid portable fact shard');
        freeze(value);
        const facts = new Map((value as GraphFact[]).map(fact => [fact.id, fact]));
        if (facts.size !== value.length) throw new Error('Duplicate portable fact identities');
        return facts;
      });
      this.chunks.set(path, chunk); void chunk.catch(() => this.chunks.delete(path));
    }
    const fact = (await chunk).get(id);
    if (!fact) throw new Error('Portable read table references a missing assertion');
    return fact;
  }
  private diagnostics(facts: readonly GraphFact[], nodes: ReadonlySet<string>): DiagnosticReport {
    const report = selectDiagnostics({ diagnostics: this.index.diagnostics, unresolved: [] }, {}, facts, [], [], nodes);
    return { ...report, unclassifiedLegacyCount: this.metadata.diagnostics.unclassifiedLegacyCount,
      ...Object.fromEntries(diagnosticKinds.map(kind => [kind, { ...report[kind],
        omittedUnrelated: this.index.overview.diagnosticCounts[kind] - report[kind].items.length - report[kind].omittedRelevant }])) };
  }
  async catalog(input: GraphCatalogRequest): Promise<GraphCatalog> {
    const request = parseGraphCatalogRequest(input); this.pinned(request.snapshotId);
    const entries = this.index.catalogs[request.view];
    const matching = request.search ? entries.filter(entry => entry.search.some(value => value.includes(request.search))) : entries;
    const page = portablePage(request.continuation, { report: this.metadata.report!.indexFile, method: 'catalog', view: request.view,
      search: request.search, maxNodes: request.maxNodes }, matching.length, request.maxNodes);
    const nodes = matching.slice(page.offset, page.end).map(entry => entry.summary);
    return { snapshot: this.metadata.snapshot, nodes: structuredClone(nodes), overview: structuredClone(this.index.overview),
      selection: { version: 'focused-report-catalog-v1', view: request.view, search: request.search, maxNodes: request.maxNodes,
        matchingNodes: matching.length, offset: page.offset, returnedNodes: nodes.length, remainingNodes: matching.length - page.end,
        truncated: Boolean(page.continuation), ...(page.continuation ? { continuation: page.continuation } : {}) },
      markdown: `Focused portable catalog: ${nodes.length}/${matching.length} included nodes. Overview totals describe the source snapshot. Nodes outside the report require the full saved snapshot.` };
  }
  async neighbors(input: GraphNeighborsRequest): Promise<GraphNeighborhood> {
    const request = parseGraphNeighborsRequest(input); this.pinned(request.snapshotId);
    const ids = this.expanded.get(request.nodeId);
    if (!ids) throw new Error('This neighborhood is outside the focused report. Open the full saved snapshot in the local explorer; absence from this report is not absence from the graph.');
    const incident = await Promise.all(ids.map(id => this.readFact(id)));
    const selected = selectNeighborhoodFacts(incident, request);
    const page = portablePage(request.continuation, { report: this.metadata.report!.indexFile, method: 'neighbors',
      node: this.index.expanded.findIndex(item => item.nodeId === request.nodeId), direction: request.direction,
      predicates: request.predicates, maxFacts: request.maxFacts }, selected.length, request.maxFacts);
    const facts = selected.slice(page.offset, page.end);
    return { snapshot: this.metadata.snapshot, focus: { nodeId: request.nodeId, status: 'present' }, facts,
      coverage: pageCoverageForFacts(facts, this.index.overview.code),
      diagnostics: this.diagnostics(facts, new Set([request.nodeId, ...facts.flatMap(fact => [fact.subject.id, fact.object.id])])),
      selection: { version: 'focused-report-neighborhood-v1', direction: request.direction, predicates: request.predicates,
        maxFacts: request.maxFacts, incidentFacts: incident.length, matchingFacts: selected.length, filteredFacts: incident.length - selected.length,
        offset: page.offset, returnedFacts: facts.length, remainingFacts: selected.length - page.end,
        truncated: Boolean(page.continuation), ...(page.continuation ? { continuation: page.continuation } : {}) },
      frontier: neighborhoodFrontier(request.nodeId, incident, selected, facts, page.end, id => this.degrees.get(id) ?? 0),
      markdown: 'Focused portable report: this included node has its complete saved neighborhood. Endpoint neighborhoods may lie outside the report; query the full saved snapshot for further exploration.' };
  }
  async fact(input: GraphFactRequest): Promise<GraphFactDetail> {
    const request = parseGraphFactRequest(input); this.pinned(request.snapshotId);
    const fact = await this.readFact(request.factId);
    return { snapshot: this.metadata.snapshot, factId: request.factId, status: 'present', fact,
      diagnostics: this.diagnostics([fact], new Set([fact.subject.id, fact.object.id])), markdown: `Exact saved assertion ${fact.id} in focused portable report.` };
  }
  async paths(_request: GraphPathsRequest): Promise<GraphPaths> {
    throw new Error('Full-snapshot path search is unavailable in focused reports; use the local explorer over the full saved snapshot');
  }
}
