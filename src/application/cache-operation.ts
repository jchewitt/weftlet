import type { ContextGraphConfig } from '../configuration/config.js';
import { resolveSemanticStorageRoots, resolveStorageRoot } from '../configuration/cache.js';

/** Operational paths only: never add coordination settings to semantic/configuration identity. */
export function cacheOperationPaths(repositoryRoot: string, config: ContextGraphConfig): string[] {
  const semantic = resolveSemanticStorageRoots(repositoryRoot, config);
  return [...new Set([resolveStorageRoot(repositoryRoot, config), semantic.primary, ...(semantic.legacy ? [semantic.legacy] : [])])];
}
