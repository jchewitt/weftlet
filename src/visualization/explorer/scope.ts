import { contextPackEvidenceAuthority } from '../../graph/authority.js';
import type { GraphCatalog, GraphCatalogRequest, GraphFact, GraphNeighborhood, GraphNeighborsRequest, GraphNode, GraphPaths, GraphPathsRequest } from '@weftlet/core';
export type Scope = { kind: 'catalog'; result: GraphCatalog; request: GraphCatalogRequest; facts: readonly GraphFact[] }
  | { kind: 'node'; result: GraphNeighborhood; request: GraphNeighborsRequest }
  | { kind: 'path'; result: GraphPaths; request: GraphPathsRequest };
export const factsForScope = (value: Scope) => value.kind === 'catalog' ? value.facts : value.result.facts;
export function nodesForFacts(facts: readonly GraphFact[]) {
  const nodes = new Map<string, GraphNode>();
  for (const fact of facts) {
    if (!nodes.has(fact.subject.id)) nodes.set(fact.subject.id, fact.subject);
    if (!nodes.has(fact.object.id)) nodes.set(fact.object.id, fact.object);
  }
  return nodes;
}

export function visibleScopeGraph(value: Scope, authority: string, knownNodes: Map<string, GraphNode>) {
  for (const node of nodesForFacts(factsForScope(value)).values()) knownNodes.set(node.id, node);
  if (value.kind === 'catalog') for (const entry of value.result.nodes) knownNodes.set(entry.node.id, entry.node);
  const facts = factsForScope(value).filter(fact => authority === 'all' || contextPackEvidenceAuthority(fact) === authority);
  const nodes = nodesForFacts(facts);
  if (value.kind === 'catalog') for (const entry of value.result.nodes) {
    if (authority === 'all' || entry.authorities[authority]) nodes.set(entry.node.id, entry.node);
  }
  const focus = value.kind === 'node' && value.result.focus.status === 'present' ? knownNodes.get(value.request.nodeId) : undefined;
  if (focus) nodes.set(focus.id, focus);
  return { facts, nodes, focus };
}
