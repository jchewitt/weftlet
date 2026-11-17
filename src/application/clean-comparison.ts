import type { GraphSnapshot } from '@weftlet/core';
import type { HydrationOptions, HydrationResult, HydratorDependencies } from './hydration-contract.js';
import { FileSnapshotStore } from '../storage/storage.js';
import { createComparisonWorkspace, writeComparisonReceipt } from '../storage/comparison-workspace.js';
import { stableJsonDigest } from '../infrastructure/util.js';
import { toolkitIdentity } from '../infrastructure/package-identity.js';
import { SemanticProviderError } from '../extraction/semantic-process.js';

/** Independently rebuild and validate; never publish a normal head or request a model. */
export async function runCleanComparison(
  dependencies: HydratorDependencies,
  options: Omit<HydrationOptions, 'snapshotSuffix'>,
  hydrate: (dependencies: HydratorDependencies, options: HydrationOptions) => Promise<HydrationResult>,
): Promise<HydrationResult> {
  const checkCancellation = () => {
    if (options.signal?.aborted) throw new SemanticProviderError('cancelled', 'Clean comparison cancelled');
  };
  checkCancellation();
  if (options.forceSemantic) throw Error('Clean comparison reuses validated semantic artifacts; forced extraction requires a separate explicit hydration.');
  const workspace = dependencies.cleanComparison;
  if (!workspace) throw Error('Clean comparison requires an isolated workspace tool factory. Configure cleanComparison on custom HydratorDependencies.');
  const store = dependencies.snapshotStore;
  const current = store.readHeadManifest ? await store.readHeadManifest(options.headName)
    : (await store.readHead(options.headName))?.manifest;
  if (!current) throw Error('No incremental snapshot exists to compare');
  const commitSha = await dependencies.repository.resolveRef(options.ref);
  if (current.commitSha !== commitSha || current.overlayDigest || current.configurationDigest !== stableJsonDigest(dependencies.config)) {
    throw Error('Clean comparison requires a committed snapshot with the same exact ref and configuration; refresh the selected scope first.');
  }
  const toolkit = await toolkitIdentity();
  const startedAt = new Date().toISOString();
  const operation = await createComparisonWorkspace(workspace.storageRoot);
  let phase = 'prepare-independent-build';
  let clean: HydrationResult | undefined;
  let failure: unknown;
  let failed = false;
  let outputRemoved = false;
  let validated = false;
  let matched = false;
  try {
    checkCancellation();
    clean = await hydrate({
      ...dependencies,
      ...workspace.createTools(operation.root),
      snapshotStore: new FileSnapshotStore(operation.root),
      semanticHydrator: dependencies.semanticHydrator.forCleanComparison(),
    }, {
      ...options, ref: commitSha, headName: 'independent',
      snapshotSuffix: `clean-${operation.operationId.replaceAll('-', '').slice(0, 12)}`,
      onProgress: event => { phase = event.phase; options.onProgress?.(event); },
    });
    validated = true; // hydrate returned only after strict SHACL and temporary publication.
    checkCancellation();
    matched = clean.snapshot.manifest.contentDigest === current.contentDigest;
    if (!matched) throw Error(`Clean hydration drift: ${current.contentDigest} != ${clean.snapshot.manifest.contentDigest}`);
  } catch (error) { failed = true; failure = error; }
  try { await operation.dispose(); outputRemoved = true; }
  catch (error) {
    failure = failed ? new AggregateError([failure, error], 'Clean comparison failed and its workspace requires local recovery') : error;
    failed = true;
  }
  let receiptPath: string;
  try {
    receiptPath = await writeComparisonReceipt(workspace.storageRoot, operation.operationId,
      comparisonReceipt(current, clean, { operationId: operation.operationId, startedAt,
        completedAt: new Date().toISOString(), toolkit, commitSha, headName: options.headName,
        validated, matched, failed, cancelled: options.signal?.aborted ?? false, outputRemoved, phase }));
  } catch (error) {
    throw failed ? new AggregateError([failure, error], 'Clean comparison failed and its receipt could not be saved') : error;
  }
  if (failed) throw failure;
  return { ...clean!, comparison: { receiptPath, operationId: operation.operationId,
    originalSnapshotId: current.snapshotId, independentSnapshotId: clean!.snapshot.manifest.snapshotId,
    temporaryOutputRemoved: true } };
}

function comparisonReceipt(current: GraphSnapshot['manifest'], clean: HydrationResult | undefined,
  outcome: { operationId: string; startedAt: string; completedAt: string; toolkit: { name: string; version: string };
    commitSha: string; headName: string; validated: boolean; matched: boolean; failed: boolean;
    cancelled: boolean; outputRemoved: boolean; phase: string }) {
  const { operationId, startedAt, completedAt, toolkit, commitSha, headName,
    validated, matched, failed, cancelled, outputRemoved, phase } = outcome;
  const manifest = clean?.snapshot.manifest;
  return {
    schemaVersion: 1, kind: 'independent-clean-comparison', operationId,
    startedAt, completedAt, toolkit, node: process.version,
    repositoryId: current.repositoryId, commitSha, headName,
    configurationDigest: current.configurationDigest,
    scope: { digest: stableJsonDigest(current.scope), count: current.scope?.length ?? null },
    original: { snapshotId: current.snapshotId, contentDigest: current.contentDigest,
      extractorVersions: current.extractorVersions, scipIndexDigest: current.scipIndexDigest,
      rdfDigest: current.rdfDigest, runtimeEvidenceDigest: current.runtimeEvidenceDigest,
      semanticArtifactKeysDigest: stableJsonDigest(current.semanticArtifactKeys) },
    independent: manifest ? { snapshotId: manifest.snapshotId, contentDigest: manifest.contentDigest,
      extractorVersions: manifest.extractorVersions, scipIndexDigest: manifest.scipIndexDigest,
      rdfDigest: manifest.rdfDigest, runtimeEvidenceDigest: manifest.runtimeEvidenceDigest,
      scopeDigest: stableJsonDigest(manifest.scope),
      semanticArtifactKeysDigest: stableJsonDigest(manifest.semanticArtifactKeys) } : undefined,
    strictValidationPassed: validated, strictValidationStatus: validated ? 'passed' : 'not-confirmed',
    digestsMatch: matched,
    status: failed ? cancelled ? 'cancelled' : 'failed' : 'passed',
    temporaryOutputRemoved: outputRemoved,
    // No raw errors, source text, prompts, or entire graph in failure receipts.
    failurePhase: failed ? phase : undefined,
    semanticExtracted: clean?.semanticExtracted, semanticReused: clean?.semanticReused,
  };
}
