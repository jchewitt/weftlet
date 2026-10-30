import type { ContractCompatibilityReport, GraphFact } from '@weftlet/core';

/** Other declarations of the same endpoint/property remain visible; never choose a winning assertion. */
function competes(selected: GraphFact, other: GraphFact): boolean {
  const left = selected.contractObligation?.declaration, right = other.contractObligation?.declaration;
  if (!left || !right || other.id === selected.id || selected.object.id !== other.object.id) return false;
  return left.role === right.role && left.endpoint === right.endpoint && left.domain === right.domain &&
    left.stage === right.stage && left.constraint?.metric === right.constraint?.metric;
}

export function compatibilityContext(all: readonly GraphFact[], selected: readonly GraphFact[]): ContractCompatibilityReport['context'] {
  const contractNodeIds = [...new Set(selected.filter(fact => fact.contractObligation).map(fact => fact.object.id))].sort();
  const endpointNodeIds = [...new Set(selected.filter(fact => fact.contractObligation).map(fact => fact.subject.id))].sort();
  const selectedIds = new Set(selected.map(fact => fact.id));
  const competing = [...new Set(all.filter(other => !selectedIds.has(other.id) && selected.some(fact => competes(fact, other))).map(fact => fact.id))].sort();
  return { contractNodeIds, endpointNodeIds,
    otherIncidentFacts: all.filter(fact => !selectedIds.has(fact.id) &&
      [fact.subject.id, fact.object.id].some(id => contractNodeIds.includes(id))).length,
    competingFactIds: competing.slice(0, 20), competingFacts: competing.length, omittedCompetingFacts: Math.max(0, competing.length - 20) };
}
