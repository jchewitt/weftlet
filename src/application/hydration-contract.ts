import type { ContextGraphConfig } from '../configuration/config.js';
import type { FactExtractor, GraphSnapshot, InvariantEvaluator, RuntimeTraceReference,
  RuntimeEvidenceProvider, SnapshotStore } from '@weftlet/core';
import type { GitRepository } from '../repository/git.js';
import type { OntologyCompiler } from '../extraction/ontology.js';
import type { SemanticHydrator } from '../extraction/semantic.js';
import type { ScipIndexResult, StaticIndexer } from '../extraction/static.js';
import type { HydrationProgressEvent } from './semantic-run.js';

export interface HydrationOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: HydrationProgressEvent) => void;
  readonly ref: string;
  readonly headName: string;
  readonly forceSemantic?: boolean;
  readonly snapshotSuffix?: string;
  readonly requireClean?: boolean;
  /** Explicit local diagnostics may disclose repository identities, producers and citations. */
  readonly validationDetails?: boolean;
  readonly semanticSources?: readonly string[];
  readonly runtimeEvidenceRevision?: RuntimeEvidenceRevision;
}

export interface RuntimeEvidenceRevision {
  readonly commitSha: string;
  readonly digest: string;
  readonly references: readonly RuntimeTraceReference[];
}

export interface HydrationResult {
  readonly snapshot: GraphSnapshot;
  readonly semanticExtracted: number;
  readonly semanticReused: number;
  /** Present only for an independent comparison; its temporary snapshot is not retained. */
  readonly comparison?: CleanComparisonRecord;
}

export interface HydratorDependencies {
  readonly config: ContextGraphConfig;
  readonly repository: GitRepository;
  readonly snapshotStore: SnapshotStore;
  readonly semanticHydrator: SemanticHydrator;
  readonly staticIndexer: StaticIndexer;
  readonly ontologyCompiler: OntologyCompiler;
  readonly runtimeEvidenceProvider: RuntimeEvidenceProvider;
  readonly extractorFactory: (scip: ScipIndexResult) => readonly FactExtractor[];
  readonly invariantEvaluators: readonly InvariantEvaluator[];
  readonly cleanComparison?: CleanComparisonWorkspace;
}

export interface CleanComparisonWorkspace {
  readonly storageRoot: string;
  /** All index/compiler writes must be directed to this operation-owned root. */
  readonly createTools: (root: string) => Pick<HydratorDependencies, 'staticIndexer' | 'ontologyCompiler'>;
}
export interface CleanComparisonRecord {
  readonly receiptPath: string;
  readonly operationId: string;
  readonly originalSnapshotId: string;
  readonly independentSnapshotId: string;
  readonly temporaryOutputRemoved: true;
}

