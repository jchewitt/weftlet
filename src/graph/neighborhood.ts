import { snapshotContext } from './snapshot-context.js';
import type { GraphExplorationService, GraphFact, GraphNeighborhood, GraphNeighborsRequest, SnapshotStore } from '@weftlet/core';
import { SnapshotIndexReader } from './snapshot-index.js';
import { coverageForFacts } from './coverage.js';
import { parseGraphNeighborsRequest } from './neighborhood-request.js';
import { renderGraphNeighborhood } from './neighborhood-renderer.js';
import { selectDiagnostics } from './diagnostics.js';
import { selectNeighborhoodFacts, neighborhoodFrontier } from './neighborhood-projection.js';

export const GRAPH_NEIGHBORHOOD_VERSION = 'exact-neighborhood-v2';

function pageOffset(token: string | undefined, binding: string, length: number, pageSize: number): number {
  if (token === undefined) return 0;
  let value: { version?: unknown; binding?: unknown; offset?: unknown };
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
    value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== 'binding,offset,version') throw new Error();
  } catch { throw new Error('Invalid graph.neighbors continuation'); }
  if (value.version !== GRAPH_NEIGHBORHOOD_VERSION || value.binding !== binding) {
    throw new Error('Continuation does not match this snapshot, node, filters or page size; restart graph.neighbors');
  }
  if (!Number.isSafeInteger(value.offset) || Number(value.offset) < 1 || Number(value.offset) >= length ||
      Number(value.offset) % pageSize !== 0) throw new Error('Invalid graph.neighbors continuation offset');
  return Number(value.offset);
}

/** One-hop, exact-ID exploration over the same lossless RDF projection as impact.scan. */
export class SnapshotGraphExplorationService implements GraphExplorationService {
  private readonly indexes: SnapshotIndexReader;
  constructor(store: Pick<SnapshotStore, 'read'>, indexes?: SnapshotIndexReader) { this.indexes = indexes ?? new SnapshotIndexReader(store); }

  async neighbors(input: GraphNeighborsRequest): Promise<GraphNeighborhood> {
    const request = parseGraphNeighborsRequest(input);
    const index = await this.indexes.read(request.snapshotId);
    const saved = index.snapshot, adjacency = index.adjacency;
    const incident = adjacency.get(request.nodeId) ?? [];
    const selected = selectNeighborhoodFacts(incident, request);
    const { continuation: _continuation, ...query } = request;
    // Bind to actual projected facts too: even a corrupt store reusing a manifest digest
    // must not silently turn a saved continuation into a different neighborhood/frontier.
    const binding = index.binding(GRAPH_NEIGHBORHOOD_VERSION, query);
    const offset = pageOffset(request.continuation, binding, selected.length, request.maxFacts);
    const facts = selected.slice(offset, offset + request.maxFacts);
    const end = offset + facts.length;
    const next = end < selected.length ? Buffer.from(JSON.stringify({
      version: GRAPH_NEIGHBORHOOD_VERSION, binding, offset: end,
    })).toString('base64url') : undefined;
    const manifest = saved.manifest;
    const plain: Omit<GraphNeighborhood, 'markdown'> = {
      snapshot: snapshotContext(manifest),
      focus: { nodeId: request.nodeId, status: incident.length ? 'present' : 'absent-from-snapshot' },
      facts,
      coverage: coverageForFacts(facts, saved, index.code),
      diagnostics: selectDiagnostics(saved, {}, facts, [], [],
        new Set([request.nodeId, ...facts.flatMap(fact => [fact.subject.id, fact.object.id])])),
      selection: { version: GRAPH_NEIGHBORHOOD_VERSION, direction: request.direction, predicates: request.predicates,
        maxFacts: request.maxFacts, incidentFacts: incident.length, matchingFacts: selected.length,
        filteredFacts: incident.length - selected.length, offset, returnedFacts: facts.length,
        remainingFacts: selected.length - end, truncated: Boolean(next), ...(next ? { continuation: next } : {}) },
      frontier: neighborhoodFrontier(request.nodeId, incident, selected, facts, end, id => adjacency.get(id)?.length ?? 0),
    };
    return { ...plain, markdown: renderGraphNeighborhood(plain) };
  }
}
