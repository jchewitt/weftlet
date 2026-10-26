// Modified for standalone extraction; see docs/extraction-manifest.json.
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import type { ContextGraphConfig } from "./config.js";
import { sha256, stableJson } from "../infrastructure/util.js";

export function resolveStorageRoot(
  repositoryRoot: string,
  config: ContextGraphConfig,
  userCacheRoot = resolve(homedir(), '.cache', 'context-graph'),
): string {
  if (config.storageScope !== 'user') return resolve(repositoryRoot, config.storagePath);
  const profile = sha256(stableJson({ config, checkout: resolve(repositoryRoot) })).slice(0, 20);
  return resolve(userCacheRoot, profile);
}

// These controls do not change a successful built-in Codex extraction. Unknown
// fields and module-provider configuration remain conservative identity inputs.
const codexOperationalFields = new Set([
  'timeoutMs', 'retries', 'concurrency', 'maxDocuments', 'maxSourceBytes',
]);

export function semanticCachePartition(repositoryRoot: string, config: ContextGraphConfig): string {
  const semantic = config.semantic.provider === 'codex-cli'
    ? Object.fromEntries(Object.entries(config.semantic).filter(([field]) => !codexOperationalFields.has(field)))
    : config.semantic;
  return sha256(stableJson({ config: { ...config, semantic }, checkout: resolve(repositoryRoot) }));
}

/** Snapshot profiles retain the full configuration. Only Codex user artifacts share operational changes. */
export function resolveSemanticStorageRoots(repositoryRoot: string, config: ContextGraphConfig,
  userCacheRoot = resolve(homedir(), '.cache', 'context-graph')): { primary: string; legacy?: string } {
  const legacy = resolveStorageRoot(repositoryRoot, config, userCacheRoot);
  if (config.storageScope !== 'user' || config.semantic.provider !== 'codex-cli') return { primary: legacy };
  return { primary: resolve(userCacheRoot, 'semantic-artifacts-v1', semanticCachePartition(repositoryRoot, config)), legacy };
}
