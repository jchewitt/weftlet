import { snapshotContext } from './snapshot-context.js';
import type { GraphExplorationService, GraphFact, GraphNeighborhood, GraphNeighborsRequest, SnapshotStore } from '@weftlet/core';
import { sha256, stableJson } from '../infrastructure/util.js';
import { RdfEvidenceGraph } from './rdf.js';
import { coverageForFacts } from './coverage.js';
import { parseGraphNeighborsRequest } from './neighborhood-request.js';
import { renderGraphNeighborhood } from './neighborhood-renderer.js';
import { selectDiagnostics } from './diagnostics.js';

export const GRAPH_NEIGHBORHOOD_VERSION = 'exact-neighborhood-v1';

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

function opposite(fact: GraphFact, nodeId: string): string {
  return fact.subject.id === nodeId ? fact.object.id : fact.subject.id;
}

/** One-hop, exact-ID exploration over the same lossless RDF projection as impact.scan. */
export class SnapshotGraphExplorationService implements GraphExplorationService {
  constructor(private readonly store: Pick<SnapshotStore, 'read'>) {}

  async neighbors(input: GraphNeighborsRequest): Promise<GraphNeighborhood> {
    const request = parseGraphNeighborsRequest(input);
    const saved = await this.store.read(request.snapshotId);
    if (!saved) throw new Error('No graph snapshot is available for that identifier');
    if (saved.manifest.snapshotId !== request.snapshotId) throw new Error('Saved snapshot identity does not match the requested identifier');
    const all = await new RdfEvidenceGraph(saved).facts();
    const adjacency = new Map<string, GraphFact[]>();
    const factIds = new Set<string>();
    for (const fact of all) {
      if (factIds.has(fact.id)) throw new Error('Duplicate fact identities prevent stable graph.neighbors pagination');
      factIds.add(fact.id);
      for (const nodeId of new Set([fact.subject.id, fact.object.id])) {
        const adjacent = adjacency.get(nodeId) ?? [];
        adjacent.push(fact);
        adjacency.set(nodeId, adjacent);
      }
    }
    const incident = adjacency.get(request.nodeId) ?? [];
    const selected = incident.filter(fact =>
      (request.direction === 'both' || (request.direction === 'outgoing' ? fact.subject.id : fact.object.id) === request.nodeId) &&
      (!request.predicates.length || request.predicates.includes(fact.predicate)))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const { continuation: _continuation, ...query } = request;
    // Bind to actual projected facts too: even a corrupt store reusing a manifest digest
    // must not silently turn a saved continuation into a different neighborhood/frontier.
    const binding = sha256(stableJson({ version: GRAPH_NEIGHBORHOOD_VERSION, query, manifest: saved.manifest,
      facts: all, diagnostics: saved.diagnostics, unresolved: saved.unresolved }));
    const offset = pageOffset(request.continuation, binding, selected.length, request.maxFacts);
    const facts = selected.slice(offset, offset + request.maxFacts);
    const end = offset + facts.length;
    const next = end < selected.length ? Buffer.from(JSON.stringify({
      version: GRAPH_NEIGHBORHOOD_VERSION, binding, offset: end,
    })).toString('base64url') : undefined;
    const neighborIds = (items: readonly GraphFact[]) => new Set(items.map(fact => opposite(fact, request.nodeId))
      .filter(id => id !== request.nodeId));
    const totalNeighbors = neighborIds(selected).size;
    const neighbors = [...neighborIds(facts)].sort().map(nodeId => ({
      nodeId,
      factIds: facts.filter(fact => opposite(fact, request.nodeId) === nodeId).map(fact => fact.id),
      otherIncidentFacts: adjacency.get(nodeId)!.filter(fact =>
        fact.subject.id !== request.nodeId && fact.object.id !== request.nodeId).length,
    }));
    const manifest = saved.manifest;
    const plain: Omit<GraphNeighborhood, 'markdown'> = {
      snapshot: snapshotContext(manifest),
      focus: { nodeId: request.nodeId, status: incident.length ? 'present' : 'absent-from-snapshot' },
      facts,
      coverage: coverageForFacts(facts),
      diagnostics: selectDiagnostics(saved, {}, facts, [], [],
        new Set([request.nodeId, ...facts.flatMap(fact => [fact.subject.id, fact.object.id])])),
      selection: { version: GRAPH_NEIGHBORHOOD_VERSION, direction: request.direction, predicates: request.predicates,
        maxFacts: request.maxFacts, incidentFacts: incident.length, matchingFacts: selected.length,
        filteredFacts: incident.length - selected.length, offset, returnedFacts: facts.length,
        remainingFacts: selected.length - end, truncated: Boolean(next), ...(next ? { continuation: next } : {}) },
      frontier: { scope: 'selected-one-hop-neighborhood', totalNeighbors,
        remainingNeighbors: totalNeighbors - neighborIds(selected.slice(0, end)).size, neighbors },
    };
    return { ...plain, markdown: renderGraphNeighborhood(plain) };
  }
}
