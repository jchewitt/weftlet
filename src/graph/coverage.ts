import { repositoryFileNode, type ContextPackCoverage, type ContextPackLane, type GraphFact } from '@weftlet/core';
import { contextPackEvidenceAuthority } from './authority.js';

export const contextPackLanes: readonly ContextPackLane[] = [
  'productIntent',
  'contractsAndInvariants',
  'implementationAndConsumers',
  'validationEvidence',
];

function isValidationFact(fact: GraphFact): boolean {
  if (fact.sourceRole !== undefined) {
    return fact.sourceRole === 'validation' || fact.subject.kind === 'Evidence' ||
      fact.object.kind === 'Evidence' || fact.predicate === 'verifiedBy';
  }
  const path = fact.provenance.path.toLowerCase();
  return (
    fact.subject.kind === 'Evidence' ||
    fact.object.kind === 'Evidence' ||
    fact.predicate === 'verifiedBy' ||
    /(?:^|\/)(?:test|tests|testing|validation|evidence)(?:\/|$)/.test(path) ||
    /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path)
  );
}

export function isDeclaredFact(fact: GraphFact): boolean {
  if (fact.sourceRole !== undefined && fact.sourceRole !== 'intent') return false;
  if (fact.authority) return fact.authority === 'declared' && !isValidationFact(fact);
  return false;
}

export function contextPackLaneForFact(fact: GraphFact): ContextPackLane | undefined {
  if (fact.sourceRole === 'validation') return 'validationEvidence';
  if (fact.extractor.id === 'otlp-runtime-evidence') return undefined;
  const kinds = new Set([fact.subject.kind, fact.object.kind]);
  if (isValidationFact(fact)) {
    return 'validationEvidence';
  }
  if (
    kinds.has('Contract') ||
    kinds.has('Invariant') ||
    kinds.has('PersistenceModel') ||
    ['governedBy', 'definedBy', 'persistsTo', 'authorizedBy'].includes(fact.predicate)
  ) {
    return 'contractsAndInvariants';
  }
  if (
    (fact.sourceRole === undefined || fact.sourceRole === 'intent') &&
    (isDeclaredFact(fact) || fact.sourceAuthority === 'declared') &&
    (kinds.has('Document') ||
      kinds.has('Capability') ||
      kinds.has('Workflow') ||
      ['decisionAuthority', 'operationallyOwnedBy', 'references'].includes(fact.predicate))
  ) {
    return 'productIntent';
  }
  return 'implementationAndConsumers';
}

export function coverageDescription(coverage: ContextPackCoverage): string {
  return coverage.scope === 'returned-page' && coverage.countsAreNonExclusive
    ? 'Counts describe evidence on this returned page and may overlap; a code relationship can also describe a contract. They are not a percentage, a count of display groups, or proof that behavior is correct.'
    : 'Coverage scope and overlap metadata are unavailable for this Context Pack; re-query saved evidence for an explicit report.';
}

/** Reporting only: never changes a fact's authority, identity, primary lane or stored bytes. */
export function isImplementationEvidence(fact: GraphFact): boolean {
  if (fact.sourceRole !== undefined || isValidationFact(fact) || fact.extractor.id === 'otlp-runtime-evidence' ||
      fact.extractionReview === 'unreviewed' || contextPackEvidenceAuthority(fact) !== 'implemented') return false;
  const path = fact.provenance.path;
  if (!path || /(?:^|\/)(?:test|tests|testing|validation|evidence|__tests__|__mocks__)(?:\/|$)/i.test(path.replaceAll('\\', '/'))) return false;
  const file = repositoryFileNode(path);
  if (file.kind !== 'Component') return false;
  const nodes = [fact.subject, fact.object];
  // Explicit adapter authority also supports logical component/provider identities.
  if (fact.authority === 'implemented') return nodes.some(node => ['Component', 'Provider'].includes(node.kind));
  // Legacy deterministic adapters omitted authority. Require their cited physical file,
  // rather than treating every fact in the implementation display group as code evidence.
  return nodes.some(node => node.kind === 'Component' && node.id === file.id);
}

export function coverageForFacts(facts: readonly GraphFact[]): ContextPackCoverage {
  const counts: Record<ContextPackLane, number> = {
    productIntent: 0, contractsAndInvariants: 0, implementationAndConsumers: 0, validationEvidence: 0,
  };
  for (const fact of facts) {
    const lane = contextPackLaneForFact(fact);
    if (lane && lane !== 'implementationAndConsumers') counts[lane]++;
    if (isImplementationEvidence(fact)) counts.implementationAndConsumers++;
  }
  return { scope: 'returned-page', countsAreNonExclusive: true, counts,
    gaps: [
      ...contextPackLanes.filter(lane => counts[lane] === 0)
        .map(lane => `No ${lane} evidence appears on this returned page.`),
      ...(facts.some(fact => fact.sourceAuthority === 'declared' && fact.extractionReview === 'unreviewed')
        ? ['Approved-source extraction remains unreviewed; verify cited intent before using it as a rule or gate.'] : []),
    ],
  };
}
