import type { ContextPack, DiagnosticReport, GraphFact } from './core.js';

/** Exact saved assertion IDs discovered through graph.neighbors/impact.scan. */
export interface ContractCompatibilityRequest {
  readonly snapshotId: string;
  readonly producerFactId: string;
  readonly consumerFactId: string;
}
export type ContractCompatibilityStatus = 'compatible-constraints' | 'insufficient-guarantee' |
  'disjoint-constraints' | 'revalidation-required' | 'unknown';
export type CompatibilityReason = 'missing-assertion' | 'invalid-evidence' | 'wrong-roles' | 'different-contracts' |
  'unknown-version' | 'missing-context' | 'different-domain' | 'different-metric' | 'different-unit' |
  'different-stage' | 'unsupported-number' | 'competing-declarations' | 'extraction-gaps' |
  'subset' | 'overlap-only' | 'disjoint' | 'consumer-revalidation';
export interface ContractCompatibilityAssessment {
  readonly version: 'declared-constraint-comparison-v1';
  readonly scope: 'selected-assertion-pair';
  readonly authority: 'inferred' | 'draft';
  readonly status: ContractCompatibilityStatus;
  readonly reasons: readonly CompatibilityReason[];
  readonly gateEligible: false;
  readonly fulfillment: 'not-evaluated';
  readonly conditions: readonly string[];
}
export interface ContractCompatibilityReport {
  readonly snapshot: ContextPack['snapshot'];
  readonly evidenceState?: ContextPack['evidenceState'];
  readonly selection: ContractCompatibilityRequest;
  readonly facts: readonly GraphFact[];
  readonly coverage: ContextPack['coverage'];
  readonly assessment: ContractCompatibilityAssessment;
  readonly context: {
    readonly contractNodeIds: readonly string[];
    readonly endpointNodeIds: readonly string[];
    readonly otherIncidentFacts: number;
    /** At most 20 IDs; use graph.neighbors for the complete cited neighborhood. */
    readonly competingFactIds: readonly string[];
    readonly competingFacts: number;
    readonly omittedCompetingFacts: number;
  };
  readonly diagnostics: DiagnosticReport;
  readonly markdown: string;
}
export interface ContractCompatibilityService {
  assess(request: ContractCompatibilityRequest): Promise<ContractCompatibilityReport>;
}
