import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { loadConfig } from '../../configuration/config.js';
import { resolveStorageRoot, resolveSemanticStorageRoots } from '../../configuration/cache.js';
import { FileSnapshotStore } from '../../storage/storage.js';

/** Only configuration and saved files: no Git checkout, adapter, indexer or provider initialization. */
export async function cacheInspectionRoots(configPath?: string) {
  const globalRoot = resolve(homedir(), '.cache/context-graph');
  if (!configPath) return [globalRoot];
  const { config, repositoryRoot } = await loadConfig(configPath);
  const semantic = resolveSemanticStorageRoots(repositoryRoot, config);
  return [globalRoot, resolveStorageRoot(repositoryRoot, config), semantic.primary, ...(semantic.legacy ? [semantic.legacy] : [])];
}
export async function inspectionSnapshot(configPath: string, snapshotId: string) {
  const { config, repositoryRoot } = await loadConfig(configPath);
  const file = await new FileSnapshotStore(resolveStorageRoot(repositoryRoot, config)).file(snapshotId);
  if (!file) throw Error('The requested saved snapshot is absent; inspection does not hydrate or substitute another snapshot');
  return file;
}
