import { SnapshotImpactQueryService } from '../graph/query.js';
import type { ImpactScanRequest } from '@weftlet/core';
import { resolve } from 'node:path';
import { readBundleManifest, readHostedSnapshot } from './delivery/read-bundle.js';
import { transferLimit } from './delivery/contract.js';
import { coordinateMethods, withManagedCacheAccess } from '../storage/coordination/managed-access.js';
import { loadConfig } from '../configuration/config.js';
import { resolveStorageRoot } from '../configuration/cache.js';
import { FileSnapshotStore } from '../storage/storage.js';
import { SnapshotIndexReader, type RevisionedSnapshotReader } from '../graph/snapshot-index.js';
import { SnapshotGraphDiscoveryService } from '../graph/discovery.js';
import { SnapshotGraphExplorationService } from '../graph/neighborhood.js';
import { SnapshotGraphPathService } from '../graph/paths.js';
import { snapshotContext } from '../graph/snapshot-context.js';
import { selectDiagnostics } from '../graph/diagnostics.js';
import { GitRepository } from '../repository/git.js';
import { inspectSavedEvidence } from './saved-evidence.js';
import { requiredSnapshotExtractorVersions } from './extraction-identity.js';
import { sha256, stableJson } from '../infrastructure/util.js';
import type { ExplorerMetadata } from '../visualization/explorer-contract.js';
import { graphPredicates } from '@weftlet/core';

/** Read-only construction deliberately does not load an adapter, model, indexer or compiler. */
export async function createExplorerService(configPath: string, snapshotId: string) {
  const { config, repositoryRoot } = await loadConfig(configPath);
  const roots = [resolveStorageRoot(repositoryRoot, config)];
  const repository = new GitRepository(repositoryRoot);
  return buildExplorerService(new FileSnapshotStore(roots[0]!), snapshotId, roots, async snapshot => ({
    checkedAt: new Date().toISOString(),
    state: await inspectSavedEvidence(snapshot, repository, sha256(stableJson(config)), requiredSnapshotExtractorVersions(config)),
  }));
}

/** Load one verified generation into memory before listening. Changes on disk take effect only on a verified restart. */
export async function createBundleExplorerService(directory: string, expectDigest: string, maxBytes?: number) {
  const input = resolve(directory);
  return withManagedCacheAccess([input], async () => {
    const bundle = await readBundleManifest(input, expectDigest, transferLimit(maxBytes));
    if (bundle.files.length !== 1) throw Error('Serve a snapshot-only bundle exported without --include-semantic');
    const id = bundle.snapshot.snapshotId;
    const store: RevisionedSnapshotReader = {
      read: async requested => requested === id ? readHostedSnapshot(input, bundle) : undefined,
      readRevision: async requested => requested === id ? expectDigest : undefined,
    };
    return buildExplorerService(store, id, []);
  });
}

async function buildExplorerService(store: RevisionedSnapshotReader, snapshotId: string, roots: string[],
  assessCheckout?: (snapshot: ExplorerMetadata['snapshot']) => Promise<NonNullable<ExplorerMetadata['checkout']>>) {
  const indexes = new SnapshotIndexReader(store);
  const index = await withManagedCacheAccess(roots, () => indexes.read(snapshotId));
  const discovery = new SnapshotGraphDiscoveryService(store, indexes);
  const exploration = new SnapshotGraphExplorationService(store, indexes);
  const paths = new SnapshotGraphPathService(store, indexes);
  const pinned = async () => {
    const current = await indexes.read(snapshotId);
    if (current.digest !== index.digest) throw new Error('Saved evidence changed after the explorer started; restart the explorer');
    return current;
  };
  return coordinateMethods({ index,
    impact: (request: ImpactScanRequest) => SnapshotImpactQueryService.scanIndex(index, request),
    withOperation: <T>(run: () => Promise<T>, additionalPaths: readonly string[] = []) => withManagedCacheAccess([...roots, ...additionalPaths], run),
    discovery: coordinateMethods(discovery, roots, ['catalog', 'fact']),
    exploration: coordinateMethods(exploration, roots, ['neighbors']),
    paths: coordinateMethods(paths, roots, ['paths']), pinned,
    async metadata(): Promise<ExplorerMetadata> {
      await pinned();
      const snapshot = snapshotContext(index.snapshot.manifest);
      const checkout = await assessCheckout?.(snapshot);
      await pinned();
      return { version: 1, mode: checkout ? 'local' : 'hosted', snapshot, repositoryId: index.snapshot.manifest.repositoryId,
        evidenceDigest: index.digest, ...(checkout ? { checkout } : {}),
        diagnostics: selectDiagnostics(index.snapshot, {}, [], [], []), capabilities: { paths: true, search: true }, predicates: graphPredicates };
    },
  }, roots, ['pinned', 'metadata']);
}
export type ExplorerService = Awaited<ReturnType<typeof createExplorerService>>;
