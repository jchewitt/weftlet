import type { ImpactScanRequest, SemanticArtifact, SemanticSource } from '@weftlet/core';
import { loadConfig, type ContextGraphConfig } from '../configuration/config.js';
import { resolveSemanticStorageRoots, resolveStorageRoot, semanticCachePartition } from '../configuration/cache.js';
import { inspectSemanticCache, type SemanticCacheInspection } from '../extraction/semantic-cache.js';
import { semanticProviderIdentity } from '../extraction/semantic-identity.js';
import { selectSemanticInputs, type SemanticInputIssue, type SemanticSelection } from '../extraction/semantic-sources.js';
import { sha256, stableJson } from '../infrastructure/util.js';
import { GitRepository } from '../repository/git.js';
import { SemanticArtifactStore } from '../storage/storage.js';
import { resolveSemanticScope, type SemanticScope } from './semantic-scope.js';

export interface SemanticCacheAdoptionOptions {
  readonly fromConfigPath: string;
  readonly ref?: string;
  readonly dryRun?: boolean;
  readonly request?: ImpactScanRequest;
}

export type SemanticCacheAdoptionStatus = 'adopted' | 'reusable' | 'planned' | 'missing' |
  'corrupt' | 'unavailable' | 'conflict';

export interface SemanticCacheAdoptionRecord {
  readonly path: string;
  readonly key: string;
  readonly status: SemanticCacheAdoptionStatus;
  readonly reason: string;
}

export interface SemanticCacheAdoption {
  readonly schemaVersion: 1;
  readonly kind: 'semantic-cache-adoption';
  readonly repositoryId: string;
  readonly ref: string;
  readonly commitSha: string;
  readonly configurationDigest: string;
  readonly previousConfigurationDigest: string;
  readonly dryRun: boolean;
  readonly ready: boolean;
  readonly scope: SemanticScope & { readonly complete: boolean };
  readonly records: readonly SemanticCacheAdoptionRecord[];
  readonly counts: Readonly<Record<SemanticCacheAdoptionStatus, number>>;
  readonly selections: readonly SemanticSelection[];
  readonly budgets: { readonly maxDocuments: number; readonly maxSourceBytes: number;
    readonly selectedDocuments: number; readonly totalSourceBytes: number };
  readonly issues: readonly SemanticInputIssue[];
  readonly assumptions: readonly string[];
}

interface AdoptionCandidate {
  readonly record: SemanticCacheAdoptionRecord;
  readonly source: SemanticSource;
  readonly artifact?: SemanticArtifact;
}

const problemStatuses = new Set<SemanticCacheAdoptionStatus>(['corrupt', 'unavailable', 'conflict']);

function problem(inspection: SemanticCacheInspection, source: SemanticSource,
  location: 'Current' | 'Previous'): SemanticCacheAdoptionRecord | undefined {
  if (inspection.status !== 'corrupt' && inspection.status !== 'unavailable') return undefined;
  return { path: source.path, key: inspection.key!, status: inspection.status,
    reason: `${location} cache: ${inspection.reason}` };
}

async function inspectCandidate(source: SemanticSource, config: ContextGraphConfig['semantic'],
  identity: string, previous: SemanticArtifactStore, current: SemanticArtifactStore): Promise<AdoptionCandidate> {
  const [before, existing] = await Promise.all([
    inspectSemanticCache(previous, config, source, identity),
    inspectSemanticCache(current, config, source, identity),
  ]);
  const failure = problem(existing, source, 'Current') ?? problem(before, source, 'Previous');
  if (failure) return { source, record: failure };
  const base = { path: source.path, key: existing.key! };
  if (existing.status === 'hit') {
    const conflict = before.status === 'hit' && before.artifact!.outputDigest !== existing.artifact!.outputDigest;
    return { source, record: { ...base, status: conflict ? 'conflict' : 'reusable', reason: conflict
      ? 'Current and previous caches contain different valid artifacts for this key; neither was overwritten.'
      : 'A validated artifact is already available in the current cache.' } };
  }
  if (before.status === 'miss') return { source, record: { ...base, status: 'missing',
    reason: 'The explicit previous profile has no complete artifact for this source and extraction contract.' } };
  if (before.status !== 'hit' || existing.status !== 'miss') throw new Error('Unexpected cache inspection state');
  return { source, artifact: before.artifact, record: { ...base, status: 'planned',
    reason: 'A validated previous artifact can be copied without extraction or changing its provenance.' } };
}

async function publishCandidate(candidate: AdoptionCandidate, config: ContextGraphConfig['semantic'],
  identity: string, current: SemanticArtifactStore): Promise<SemanticCacheAdoptionRecord> {
  let publicationError: unknown;
  let published = false;
  try {
    await current.write(candidate.artifact!);
    published = true;
  } catch (error) {
    publicationError = error;
  }
  // Reinspect even after a successful write: an immutable-key winner can have
  // matching output but corrupt identity metadata. A digest match alone is not
  // permission to report that artifact as reusable.
  const existing = await inspectSemanticCache(current, config, candidate.source, identity);
  const failure = problem(existing, candidate.source, 'Current');
  if (failure) return failure;
  if (existing.status === 'hit' && existing.artifact!.outputDigest !== candidate.artifact!.outputDigest) {
    return { ...candidate.record, status: 'conflict',
      reason: 'A concurrent writer published a different valid artifact; neither artifact was overwritten.' };
  }
  if (!published) {
    throw new Error('Unable to adopt a semantic artifact because storage publication failed.', { cause: publicationError });
  }
  if (existing.status !== 'hit') return { ...candidate.record, status: 'unavailable',
    reason: 'Published artifact is no longer readable; no successful adoption is claimed.' };
  return { ...candidate.record, status: 'adopted',
    reason: 'Validated artifact is available in the current cache; the previous artifact is unchanged.' };
}

/** Explicitly adopts only committed-source artifacts from a compatible, named legacy profile. */
export async function adoptSemanticCache(configPath: string,
  options: SemanticCacheAdoptionOptions): Promise<SemanticCacheAdoption> {
  const [loaded, previous] = await Promise.all([loadConfig(configPath), loadConfig(options.fromConfigPath)]);
  const { config, repositoryRoot } = loaded;
  if (repositoryRoot !== previous.repositoryRoot) {
    throw new Error('Cache adoption requires both configurations to resolve to the same checkout.');
  }
  if (semanticCachePartition(repositoryRoot, config) !== semanticCachePartition(repositoryRoot, previous.config)) {
    throw new Error('Cache adoption requires matching non-operational configuration and provider contracts.');
  }
  const repository = new GitRepository(repositoryRoot);
  const ref = options.ref ?? 'HEAD';
  const commitSha = await repository.resolveRef(ref);
  const scope = await resolveSemanticScope(config, repository, commitSha, options.request);
  const selection = await selectSemanticInputs(repository, commitSha, scope.selectors, config.semantic);
  const issues = [...selection.issues];
  const limited = scope.omittedDocuments.length > 0 || scope.ignoredSearchTerms > 0;
  const complete = !limited && selection.selections.every((item) => item.status === 'matched');
  if (limited) issues.push({ code: 'selection-limited', severity: 'warning',
    message: `Existing agent selection limits omitted ${scope.omittedDocuments.length} documents and ${scope.ignoredSearchTerms} search terms; adoption describes only the selected scope.`,
    paths: scope.omittedDocuments });
  const dryRun = options.dryRun ?? false;
  const records: SemanticCacheAdoptionRecord[] = [];
  if (!issues.some((issue) => issue.severity === 'error')) {
    const current = new SemanticArtifactStore(resolveSemanticStorageRoots(repositoryRoot, config).primary);
    // Do not scan sibling profiles or infer ownership from an artifact key. The
    // supplied old configuration proves the exact legacy location to inspect.
    const old = new SemanticArtifactStore(resolveStorageRoot(repositoryRoot, previous.config));
    const identity = semanticProviderIdentity(config.semantic);
    for (const source of selection.sources) {
      const candidate = await inspectCandidate(source, config.semantic, identity, old, current);
      const result = candidate.artifact && !dryRun
        ? await publishCandidate(candidate, config.semantic, identity, current) : candidate.record;
      records.push(result);
      if (problemStatuses.has(result.status)) issues.push({ code: `cache-${result.status}`, severity: 'error',
        message: result.reason, paths: [result.path] });
    }
  }
  const counts: Record<SemanticCacheAdoptionStatus, number> = {
    adopted: 0, reusable: 0, planned: 0, missing: 0, corrupt: 0, unavailable: 0, conflict: 0,
  };
  for (const record of records) counts[record.status]++;
  return {
    schemaVersion: 1, kind: 'semantic-cache-adoption', repositoryId: config.repositoryId,
    ref, commitSha, configurationDigest: sha256(stableJson(config)),
    previousConfigurationDigest: sha256(stableJson(previous.config)), dryRun,
    ready: complete && !issues.some((issue) => issue.severity === 'error'), scope: { ...scope, complete },
    records, counts, selections: selection.selections, budgets: selection.budgets, issues,
    assumptions: [
      'Selection uses the same configured or bounded agent scope as hydration planning at the resolved commit; only expected keys in the explicitly named previous profile are inspected.',
      'Missing or incomplete previous artifacts need later extraction. Corrupt or conflicting complete artifacts are retained for diagnosis.',
      'Adoption preserves original artifact identity and provenance; it does not validate or publish a current snapshot.',
      'Artifacts are adopted independently; earlier valid copies remain available if a later artifact or storage operation fails.',
      'No provider, authentication, indexing, ontology or repository adapter is initialized. Dry runs do not write cache files.',
    ],
  };
}
