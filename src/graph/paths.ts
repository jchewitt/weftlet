import { snapshotContext } from './snapshot-context.js';
import type { GraphPathQueryService, GraphPaths, GraphPathsRequest, SnapshotStore } from '@weftlet/core';
import { SnapshotIndexReader } from './snapshot-index.js';
import { coverageForFacts } from './coverage.js';
import { selectDiagnostics } from './diagnostics.js';
import { parseGraphPathsRequest } from './path-request.js';
import { searchEvidencePaths } from './path-search.js';
import { renderGraphPaths } from './paths-renderer.js';

export const GRAPH_PATHS_VERSION = 'simple-evidence-paths-v3';

function continuationOffset(token: string | undefined, binding: string): number {
  if (!token) return 0;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
    const value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== 'binding,offset,version' ||
        value.version !== GRAPH_PATHS_VERSION || value.binding !== binding ||
        !Number.isInteger(value.offset) || value.offset < 1 || value.offset >= 100_000) throw new Error();
    return value.offset;
  } catch { throw new Error('Invalid graph.paths continuation or query/snapshot mismatch; restart graph.paths'); }
}

export class SnapshotGraphPathService implements GraphPathQueryService {
  private readonly indexes: SnapshotIndexReader;
  constructor(store: Pick<SnapshotStore, 'read'>, indexes?: SnapshotIndexReader) { this.indexes = indexes ?? new SnapshotIndexReader(store); }

  async paths(input: GraphPathsRequest): Promise<GraphPaths> {
    const request = parseGraphPathsRequest(input);
    const index = await this.indexes.read(request.snapshotId);
    const saved = index.snapshot, all = saved.facts;
    const { continuation, ...query } = request;
    const binding = index.binding(GRAPH_PATHS_VERSION, query);
    const offset = continuationOffset(continuation, binding);
    const selected = all.filter(fact => !request.predicates.length || request.predicates.includes(fact.predicate));
    const edges = selected.flatMap(fact => {
      const forward = { id: fact.id, from: fact.subject.id, to: fact.object.id };
      const reverse = { id: fact.id, from: fact.object.id, to: fact.subject.id };
      return request.direction === 'incoming' ? [reverse] : request.direction === 'outgoing' || forward.from === forward.to
        ? [forward] : [forward, reverse];
    });
    const nodes = new Set(index.adjacency.keys());
    const result = searchEvidencePaths(edges, request.fromNodeId, request.toNodeId, { ...request, offset }, nodes);
    const factIds = new Set(result.paths.flatMap(path => path.factIds));
    const facts = all.filter(fact => factIds.has(fact.id));
    const endpoint = (nodeId: string) => ({ nodeId, status: nodes.has(nodeId) ? 'present' as const : 'absent-from-snapshot' as const });
    const next = !result.search.exhaustedWithinDepth && result.search.stopReason !== 'search-limit'
      ? Buffer.from(JSON.stringify({ version: GRAPH_PATHS_VERSION, binding, offset: result.search.totalSteps })).toString('base64url') : undefined;
    const manifest = saved.manifest;
    const plain: Omit<GraphPaths, 'markdown'> = {
      snapshot: snapshotContext(manifest),
      endpoints: { from: endpoint(request.fromNodeId), to: endpoint(request.toNodeId) },
      paths: result.paths, facts, coverage: coverageForFacts(facts, saved, index.code),
      diagnostics: selectDiagnostics(saved, {}, facts, [], [], new Set([request.fromNodeId, request.toNodeId,
        ...facts.flatMap(fact => [fact.subject.id, fact.object.id])])),
      search: { version: GRAPH_PATHS_VERSION, order: 'shortest-first-target-first', direction: request.direction,
        predicates: request.predicates, maxDepth: request.maxDepth, maxPaths: request.maxPaths, maxSteps: request.maxSteps,
        ...result.search, ...(next ? { continuation: next } : {}) }, frontier: result.frontier,
    };
    return { ...plain, markdown: renderGraphPaths(plain) };
  }
}
