import type { GraphFact, GraphNeighborhood, GraphNeighborsRequest } from '@weftlet/core';

const opposite = (fact: GraphFact, nodeId: string) => fact.subject.id === nodeId ? fact.object.id : fact.subject.id;
export function selectNeighborhoodFacts(incident: readonly GraphFact[], request: GraphNeighborsRequest) {
  return incident.filter(fact =>
    (!request.direction || request.direction === 'both' || (request.direction === 'outgoing' ? fact.subject.id : fact.object.id) === request.nodeId) &&
    (!request.predicates?.length || request.predicates.includes(fact.predicate)))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Pure projection shared by saved queries and focused portable reports. */
export function neighborhoodFrontier(nodeId: string, incident: readonly GraphFact[], selected: readonly GraphFact[],
  facts: readonly GraphFact[], end: number, degree: (id: string) => number): GraphNeighborhood['frontier'] {
  const neighborIds = (items: readonly GraphFact[]) => new Set(items.map(fact => opposite(fact, nodeId)).filter(id => id !== nodeId));
  const connections = new Map<string, number>();
  for (const fact of incident) { const id = opposite(fact, nodeId); connections.set(id, (connections.get(id) ?? 0) + 1); }
  const totalNeighbors = neighborIds(selected).size;
  return { scope: 'selected-one-hop-neighborhood', totalNeighbors,
    remainingNeighbors: totalNeighbors - neighborIds(selected.slice(0, end)).size,
    neighbors: [...neighborIds(facts)].sort().map(id => ({ nodeId: id,
      factIds: facts.filter(fact => opposite(fact, nodeId) === id).map(fact => fact.id),
      otherIncidentFacts: degree(id) - (connections.get(id) ?? 0),
    })) };
}
