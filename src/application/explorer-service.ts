import { coordinateMethods, withManagedCacheAccess } from '../storage/coordination/managed-access.js';
import { loadConfig } from '../configuration/config.js';
import { resolveStorageRoot } from '../configuration/cache.js';
import { FileSnapshotStore } from '../storage/storage.js';
import { SnapshotIndexReader } from '../graph/snapshot-index.js';
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
  const store = new FileSnapshotStore(roots[0]!);
  const indexes = new SnapshotIndexReader(store), index = await withManagedCacheAccess(roots, () => indexes.read(snapshotId));
  const repository = new GitRepository(repositoryRoot);
  const discovery = new SnapshotGraphDiscoveryService(store, indexes);
  const exploration = new SnapshotGraphExplorationService(store, indexes);
  const paths = new SnapshotGraphPathService(store, indexes);
  const pinned = async () => {
    const current = await indexes.read(snapshotId);
    if (current.digest !== index.digest) throw new Error('Saved evidence changed after the explorer started; restart the explorer');
    return current;
  };
  return coordinateMethods({ index,
    withOperation: <T>(run: () => Promise<T>, additionalPaths: readonly string[] = []) => withManagedCacheAccess([...roots, ...additionalPaths], run),
    discovery: coordinateMethods(discovery, roots, ['catalog', 'fact']),
    exploration: coordinateMethods(exploration, roots, ['neighbors']),
    paths: coordinateMethods(paths, roots, ['paths']), pinned,
    async metadata(): Promise<ExplorerMetadata> {
      await pinned();
      const snapshot = snapshotContext(index.snapshot.manifest);
      const state = await inspectSavedEvidence(snapshot, repository, sha256(stableJson(config)), requiredSnapshotExtractorVersions(config));
      await pinned();
      return { version: 1, mode: 'local', snapshot, repositoryId: index.snapshot.manifest.repositoryId,
        evidenceDigest: index.digest, checkout: { checkedAt: new Date().toISOString(), state },
        diagnostics: selectDiagnostics(index.snapshot, {}, [], [], []), capabilities: { paths: true, search: true }, predicates: graphPredicates };
    },
  }, roots, ['pinned', 'metadata']);
}
export type ExplorerService = Awaited<ReturnType<typeof createExplorerService>>;
