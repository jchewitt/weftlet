import type { ContextGraphConfig } from '../configuration/config.js';
import { resolveSemanticStorageRoots } from '../configuration/cache.js';
import { SemanticArtifactStore } from '../storage/storage.js';

/** Shared by planning and execution; construction never creates directories or reads credentials. */
export function createSemanticArtifactStore(repositoryRoot: string, config: ContextGraphConfig,
  userCacheRoot?: string): SemanticArtifactStore {
  const { primary, legacy } = resolveSemanticStorageRoots(repositoryRoot, config, userCacheRoot);
  return new SemanticArtifactStore(primary, legacy ? [legacy] : []);
}
