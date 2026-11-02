import type { ContextPack, GraphFact, GraphNode } from './core.js';
import type { SourceSpan } from './source-span.js';

/** Explicit operation scope; never inferred from labels or the entire repository. */
export interface MappingProposalRequest {
  readonly snapshotId: string;
  readonly ruleId: string;
  readonly documentPath: string;
  readonly files: readonly string[];
  readonly maxCandidates?: number;
  readonly maxInputBytes?: number;
}
export interface MappingCandidate {
  readonly node: GraphNode;
  readonly body: SourceSpan;
  readonly excerptBytes: number;
  readonly definitions: readonly GraphFact[];
}
export interface MappingProposalPlan {
  readonly version: 'mapping-proposal-v1';
  readonly request: Required<MappingProposalRequest>;
  readonly snapshot: ContextPack['snapshot'];
  readonly snapshotDigest: string;
  readonly ready: boolean;
  readonly issues: readonly { readonly code: string; readonly path?: string }[];
  readonly subjectEvidence: readonly GraphFact[];
  readonly associations: readonly GraphFact[];
  readonly candidates: readonly MappingCandidate[];
  readonly candidateEnumeration: { readonly complete: boolean; readonly observed: number; readonly returned: number };
  readonly excluded: readonly { readonly path: string; readonly reason: string; readonly count: number }[];
  readonly inputBytes: number;
  readonly inputDigest: string;
  readonly evidenceState?: ContextPack['evidenceState'];
}
/** Only committed, budgeted source excerpts are supplied to a provider. */
export interface MappingProposalInput {
  readonly ruleId: string;
  readonly subjectEvidence: readonly GraphFact[];
  readonly associations: readonly GraphFact[];
  readonly document: { readonly source: SourceSpan; readonly text: string };
  readonly candidates: readonly (MappingCandidate & { readonly text: string })[];
}
export interface MappingProposalOutput {
  readonly decision: 'proposed' | 'abstained';
  readonly reason: string;
  readonly proposals: readonly {
    readonly symbolId: string;
    readonly rationale: string;
    /** Model-reported confidence, not a calibrated probability or authority level. */
    readonly confidence: number;
    readonly documentCitation: { readonly startLine: number; readonly endLine: number };
    readonly codeCitation: { readonly startLine: number; readonly endLine: number };
  }[];
}
export interface MappingProposalArtifact {
  readonly key: string;
  readonly version: 'mapping-proposal-v1';
  readonly providerIdentity: string;
  readonly plan: MappingProposalPlan;
  readonly output: MappingProposalOutput;
  readonly outputDigest: string;
  readonly authority: 'inferred';
  readonly extractionReview: 'unreviewed';
  readonly establishesCompliance: false;
}
export interface MappingProposalProvider {
  readonly identity: string;
  propose(input: MappingProposalInput, options: { readonly signal: AbortSignal; readonly timeoutMs: number }): Promise<unknown>;
}
export interface MappingProposalStore {
  read(key: string): Promise<MappingProposalArtifact | undefined>;
  write(artifact: MappingProposalArtifact): Promise<void>;
}
