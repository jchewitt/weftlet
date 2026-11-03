import type { GraphFact, GraphNode } from '@weftlet/core';

/** Query-order signals from saved evidence, never new assertions or authority. */
export function impactRankingSignals(facts: readonly GraphFact[], anchorTerms: readonly string[]) {
  const definitions = new Map<string, Set<string>>();
  const callsiteReferences = new Set<string>();
  const callableNativeSymbols = new Set<string>();
  const localCall = (fact: GraphFact) => fact.predicate === 'calls' && fact.codeCall !== undefined &&
    fact.codeCall.target !== 'external' && fact.codeCall.targetDefinitions.length > 0;
  for (const fact of facts) {
    if (fact.codeOccurrence?.role === 'definition' && fact.predicate === 'definedBy') {
      const paths = definitions.get(fact.subject.id) ?? new Set<string>();
      paths.add(fact.provenance.path); definitions.set(fact.subject.id, paths);
    }
    if (localCall(fact)) {
      for (const proof of fact.codeCall!.targetOccurrences) callsiteReferences.add(proof.factId);
      if (fact.object.codeSymbol) callableNativeSymbols.add(fact.object.codeSymbol.nativeSymbol);
    }
  }
  const explicit = (node: GraphNode) => anchorTerms.some(term =>
    `${node.id} ${node.label} ${node.codeSymbol?.nativeSymbol ?? ''}`.toLowerCase().includes(term));
  const unindexed = (node: GraphNode) => node.kind === 'CodeSymbol' &&
    node.codeSymbol?.resolution === 'no-indexed-definition';
  const hub = (node: GraphNode) => unindexed(node) && !explicit(node);
  const penalty = (fact: GraphFact) => [fact.subject, fact.object].some(hub) ? 8 : 0;
  const seedNodes = (fact: GraphFact) => {
    const eligible = [fact.subject, fact.object].filter(node => node.kind !== 'Project');
    const matching = eligible.filter(explicit);
    if (matching.length) return matching;
    // A cited local operation's library references must not turn those shared
    // library identities into zero-distance anchors for all their co-users.
    const local = eligible.filter(node => !unindexed(node));
    return local.length ? local : eligible;
  };
  const relationshipOrder = (fact: GraphFact) => {
    if (localCall(fact) || callsiteReferences.has(fact.id)) return 0;
    if (fact.predicate === 'consumes' && fact.object.id.startsWith('symbol:scip:') &&
        callableNativeSymbols.has(fact.object.label)) return 0;
    if (fact.codeOccurrence?.role === 'reference') {
      if (explicit(fact.object)) return 0;
      const targetPaths = definitions.get(fact.object.id);
      if (targetPaths && [...targetPaths].some(path => path !== fact.provenance.path)) return 1;
    }
    if (fact.codeOccurrence || fact.codeCall) return 2;
    return 0; // Keep intent, queue/data contracts, validation and legacy adapter relations available.
  };
  return { penalty, seedNodes, relationshipOrder };
}
