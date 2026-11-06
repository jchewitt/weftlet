import type { ContextPackCoverage, GraphFact, GraphSnapshot } from '@weftlet/core';
import { projectCodeCoverage, codeCoverageDescription } from './code-coverage-projection.js';
import { pageCoverageForFacts } from './coverage-facts.js';
export { contextPackLanes, contextPackLaneForFact, isDeclaredFact, isImplementationEvidence, isProductIntentEvidence } from './coverage-facts.js';

export function coverageDescription(coverage: ContextPackCoverage): string {
  const page = coverage.scope === 'returned-page' && coverage.countsAreNonExclusive
    ? 'Counts describe evidence on this returned page and may overlap; intent-source contracts count as both intent and contracts, and a code relationship can also describe a contract. Intent-source evidence does not grant assertion approval. Counts are not a percentage, a count of display groups, or proof that behavior is correct.'
    : 'Coverage scope and overlap metadata are unavailable for this Context Pack; re-query saved evidence for an explicit report.';
  return `${page} ${codeCoverageDescription(coverage.code)}`;
}

export function coverageForFacts(facts: readonly GraphFact[], snapshot?: GraphSnapshot, code?: ContextPackCoverage['code']): ContextPackCoverage {
  return pageCoverageForFacts(facts, snapshot ? code ?? projectCodeCoverage(snapshot).overview : undefined);
}
