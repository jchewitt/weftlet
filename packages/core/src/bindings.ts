import type { SourceSpan } from './source-span.js';

export interface BindingEvidence {
  readonly factId: string;
  readonly provenance: SourceSpan;
}

export interface BindingSubjectEvidence extends BindingEvidence {
  readonly authority?: 'declared' | 'implemented' | 'validated' | 'observed' | 'inferred' | 'draft';
  readonly sourceAuthority?: 'declared' | 'inferred' | 'draft';
  readonly extractionReview?: 'unreviewed' | 'approved' | 'deterministic';
}

/** A cited mapping declaration, not proof that the target fulfills the declared rule. */
export interface DocumentCodeBinding {
  readonly schemaVersion: 1;
  readonly method: 'explicit-markdown';
  readonly selector: {
    readonly path: string;
    readonly symbol: string;
    /** Optional exact indexed occurrence; both one-based UTF-16 fields are required. */
    readonly line?: number;
    readonly column?: number;
  };
  readonly documentCitations: readonly SourceSpan[];
  readonly selectedOccurrences: readonly BindingEvidence[];
  /** Includes every indexed definition span for the selected identity, including overloads. */
  readonly definitions: readonly BindingEvidence[];
  /** Original assertions that identify an annotated business subject; their review state is retained. */
  readonly subjectEvidence: readonly BindingSubjectEvidence[];
}
