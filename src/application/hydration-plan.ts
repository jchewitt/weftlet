import type { ImpactScanRequest, SemanticSource } from '@weftlet/core';
import { loadConfig, type ContextGraphConfig } from '../configuration/config.js';
import { GitRepository } from '../repository/git.js';
import { matchesRepositoryGlob } from '../repository/glob.js';
import type { SemanticArtifactStore } from '../storage/storage.js';
import { createSemanticArtifactStore } from './semantic-artifact-store.js';
import { inspectSemanticCache, type SemanticCacheInspection } from '../extraction/semantic-cache.js';
import { semanticProviderIdentity } from '../extraction/semantic-identity.js';
import { selectSemanticInputs, type SemanticInputIssue, type SemanticSelection } from '../extraction/semantic-sources.js';
import { sha256, stableJson } from '../infrastructure/util.js';
import { resolveSemanticScope, type SemanticScope } from './semantic-scope.js';

export interface HydrationPlanOptions {
  readonly ref?: string;
  readonly forceSemantic?: boolean;
  readonly request?: ImpactScanRequest;
}

export interface HydrationPlanDocument {
  readonly path: string;
  readonly stableSemanticId: string;
  readonly sourceDigest: string;
  readonly bytes: number;
  readonly lines: number;
  readonly selectedBy: readonly string[];
  readonly role: 'semantic-document' | 'validation-evidence';
  readonly sourceAuthority: 'declared' | 'inferred';
  readonly approvedBy: readonly string[];
  readonly extractionReview: 'unreviewed';
  readonly cache: Omit<SemanticCacheInspection, 'artifact'>;
}

export interface HydrationPlan {
  readonly schemaVersion: 1;
  readonly kind: 'hydration-plan';
  readonly repositoryId: string;
  readonly ref: string;
  readonly commitSha: string;
  readonly configurationDigest: string;
  readonly ready: boolean;
  readonly scope: SemanticScope & { readonly complete: boolean };
  readonly documents: readonly HydrationPlanDocument[];
  readonly selections: readonly SemanticSelection[];
  readonly budgets: { readonly maxDocuments: number; readonly maxSourceBytes: number;
    readonly selectedDocuments: number; readonly totalSourceBytes: number };
  readonly estimates: { readonly reusableArtifacts: number; readonly extractions: number; readonly unknownArtifacts: number };
  readonly issues: readonly SemanticInputIssue[];
  readonly excludedWorkingChanges: readonly string[];
  readonly assumptions: readonly string[];
}

async function describeDocument(source: SemanticSource, selections: readonly SemanticSelection[],
  config: ContextGraphConfig, evidencePaths: ReadonlySet<string>, store: SemanticArtifactStore,
  forceSemantic = false): Promise<HydrationPlanDocument> {
  const inspection: SemanticCacheInspection = forceSemantic
    ? { status: 'forced', reason: 'Explicit force bypasses existing artifacts; a new revision is allocated only during hydration.' }
    : await inspectSemanticCache(store, config.semantic, source, semanticProviderIdentity(config.semantic));
  const { artifact: _artifact, ...cache } = inspection;
  const approvedBy = (config.approvedIntentSources ?? []).filter((pattern) => matchesRepositoryGlob(source.path, pattern));
  return { path: source.path, stableSemanticId: source.stableSemanticId, sourceDigest: source.digest,
    bytes: Buffer.byteLength(source.content), lines: source.content.split('\n').length,
    selectedBy: selections.filter((item) => item.paths.includes(source.path)).map((item) => item.selector),
    role: evidencePaths.has(source.path) ? 'validation-evidence' : 'semantic-document',
    sourceAuthority: approvedBy.length ? 'declared' : 'inferred', approvedBy,
    extractionReview: 'unreviewed', cache };
}

/** Inspect only committed source objects, config and existing artifacts; never initialize a provider or adapter. */
export async function planHydration(configPath: string, options: HydrationPlanOptions = {}): Promise<HydrationPlan> {
  const { config, repositoryRoot } = await loadConfig(configPath);
  const repository = new GitRepository(repositoryRoot);
  const ref = options.ref ?? 'HEAD';
  const commitSha = await repository.resolveRef(ref);
  const scope = await resolveSemanticScope(config, repository, commitSha, options.request);
  const selection = await selectSemanticInputs(repository, commitSha, scope.selectors, config.semantic);
  const issues = [...selection.issues];
  const { omittedDocuments, ignoredSearchTerms } = scope;
  const limited = omittedDocuments.length > 0 || ignoredSearchTerms > 0;
  const complete = !limited && selection.selections.every((item) => item.status === 'matched');
  if (limited) issues.push({ code: 'selection-limited', severity: 'warning',
    message: `Existing agent selection limits omitted ${omittedDocuments.length} documents and ${ignoredSearchTerms} search terms; this plan describes only the selected scope.`,
    paths: omittedDocuments });
  const store = createSemanticArtifactStore(repositoryRoot, config);
  const evidencePaths = new Set(await repository.listFilesAt(commitSha, config.evidenceRoots));
  const documents: HydrationPlanDocument[] = [];
  for (const source of selection.sources) {
    const document = await describeDocument(source, selection.selections, config, evidencePaths, store, options.forceSemantic);
    const { cache } = document;
    if (cache.status === 'corrupt' || cache.status === 'unavailable') issues.push({
      code: `cache-${cache.status}`, severity: 'error', message: cache.reason, paths: [source.path],
    });
    documents.push(document);
  }
  const count = (...states: SemanticCacheInspection['status'][]) => documents.filter((doc) => states.includes(doc.cache.status)).length;
  return {
    schemaVersion: 1, kind: 'hydration-plan', repositoryId: config.repositoryId, ref, commitSha,
    configurationDigest: sha256(stableJson(config)), ready: complete && !issues.some((item) => item.severity === 'error'),
    scope: { ...scope, complete },
    documents, selections: selection.selections, budgets: selection.budgets,
    estimates: { reusableArtifacts: count('hit'), extractions: count('miss', 'forced'), unknownArtifacts: count('corrupt', 'unavailable') },
    issues, excludedWorkingChanges: await repository.workingChanges(),
    assumptions: [
      'Sources come from the resolved commit; configuration and cache are read from the current local environment.',
      'Estimates require unchanged source, configuration, provider contract and readable artifacts; concurrent changes can invalidate them.',
      'Document and per-document UTF-8 byte limits apply to all selected documents, including cache hits; no token or monetary estimate is made.',
      'Ready describes semantic inputs and readable cache only. Providers, credentials, adapters, storage writes, indexing, runtime evidence, routing, ontology and graph validation have not been checked.',
      'Roles reflect configured evidence roots, not inferred prose meaning. Selected validation documents still undergo semantic extraction today; source approval never approves extracted assertions.',
      'Selection is the configured scope, optionally narrowed by existing bounded agent selection; recursive SOT traversal and complete product coverage are not claimed.',
      'Unmatched selectors and bounded scope omissions need review. They do not introduce new hydration gates: removing the last document can still publish a graph with its relationships removed.',
    ],
  };
}
