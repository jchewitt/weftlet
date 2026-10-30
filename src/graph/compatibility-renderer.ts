import { sourceLocation, type CompatibilityReason, type ContractCompatibilityReport } from '@weftlet/core';
import { factEvidenceDescription } from './evidence-description.js';
import { diagnosticSummary } from './diagnostics.js';
import { coverageDescription } from './coverage.js';

const quoted = (value: string) => JSON.stringify(value).replace(/[\\`*_{}\[\]()<>!|]/g, '\\$&');
const explanations: Record<CompatibilityReason, string> = {
  'missing-assertion': 'One or both exact assertion IDs are absent from this snapshot.',
  'invalid-evidence': 'The selected records lack valid obligation metadata or matching snapshot/revision provenance.',
  'wrong-roles': 'Select a producer guarantee first and a consumer requirement second.',
  'different-contracts': 'The assertions do not identify the same exact repository/scoped/transport/versioned contract.',
  'unknown-version': 'A contract version is unknown; no version equivalence is assumed.',
  'missing-context': 'Documented domain, stage, numeric constraint or unit is missing.',
  'different-domain': 'The documented domains differ.',
  'different-metric': 'The documented metrics differ; no semantic equivalence is inferred.',
  'different-unit': 'The units differ; no unit conversion is inferred.',
  'different-stage': 'The measurement stages differ; no elapsed-time or transformation model is available.',
  'unsupported-number': 'A numeric limit is nonfinite or outside the supported safe numeric magnitude.',
  'competing-declarations': 'Other assertions describe this endpoint/property; no winning declaration was selected.',
  'extraction-gaps': 'Relevant source/extraction gaps remain in the saved evidence.',
  subset: 'At the same declared stage, every value allowed by the producer constraint is allowed by the consumer constraint.',
  'overlap-only': 'Some allowed producer values do not satisfy the consumer constraint. This alone is not a contradiction.',
  disjoint: 'At the same declared stage, no value satisfies both constraints. This is a documented range incompatibility for an untransformed accepted value.',
  'consumer-revalidation': 'The consumer explicitly requires revalidation. Verify its check and rejection behavior; the declaration alone does not prove them.',
};

export function renderContractCompatibility(report: Omit<ContractCompatibilityReport, 'markdown'>): string {
  const { snapshot, assessment, context, evidenceState } = report;
  return ['# Selected contract constraint assessment',
    `Snapshot: ${quoted(snapshot.snapshotId)} (${snapshot.commitSha}); configuration ${snapshot.configurationDigest ?? 'unknown'}`,
    `Scope: ${snapshot.scope?.map(quoted).join(', ') ?? 'unknown'}; selected assertions: ${quoted(report.selection.producerFactId)}, ${quoted(report.selection.consumerFactId)}`,
    `Result: ${assessment.status}; authority: ${assessment.authority}; method: ${assessment.version}; CI gate eligible: false; fulfillment: not evaluated`,
    ...assessment.reasons.map(reason => `- ${explanations[reason]}`),
    ...(evidenceState ? [`Stale: ${evidenceState.stale}; configuration matches: ${evidenceState.configurationMatches}; extraction compatible: ${evidenceState.extractionCompatible ?? 'unknown'}`,
      `Excluded working changes: ${evidenceState.excludedWorkingChanges.map(quoted).join(', ') || '(none)'}; overlay freshness: ${evidenceState.overlayFreshness ?? 'not an overlay'}`] : []),
    '', '## Cited declarations', ...report.facts.map(fact =>
      `- ${quoted(fact.id)} [${fact.authority ?? 'unspecified'}; source ${fact.sourceAuthority ?? 'unspecified'}; review ${fact.extractionReview ?? 'unspecified'}] ` +
      `${quoted(sourceLocation(fact.provenance))}–${fact.provenance.endLine}@${fact.provenance.commitSha}: ${quoted(factEvidenceDescription(fact) ?? 'Not a structured obligation')}`),
    '', '## Assessment limits', ...assessment.conditions.map(condition => `- ${condition}`),
    coverageDescription(report.coverage), ...report.coverage.gaps.map(quoted),
    '', '## Further evidence',
    `Other contract-incident assertions: ${context.otherIncidentFacts}; competing declarations: ${context.competingFacts}; omitted competing IDs: ${context.omittedCompetingFacts}.`,
    ...context.competingFactIds.map(id => `- Competing assertion: ${quoted(id)}`),
    ...context.contractNodeIds.map(id => `- Use graph.neighbors with contract ${quoted(id)} and the same snapshot for all declarations and continuation.`),
    ...context.endpointNodeIds.map(id => `- Use graph.neighbors with endpoint ${quoted(id)} for indexed definitions, mappings and tests; file existence alone proves no fulfillment.`),
    '', '## Scoped diagnostics', ...diagnosticSummary(report).map(quoted),
  ].join('\n');
}
