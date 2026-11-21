// Modified for standalone extraction; see docs/extraction-manifest.json.
import { homedir } from 'node:os';
import { isAbsolute, parse, resolve } from 'node:path';

import type { ContextGraphConfig } from "./config.js";
import { sha256, stableJson } from "../infrastructure/util.js";
import { assertDocumentTraversalConfig } from './document-traversal.js';

export function resolveUserCacheRoot(): string {
  const override = process.env.WEFTLET_USER_CACHE_ROOT;
  if (override === undefined) return resolve(homedir(), '.cache', 'context-graph');
  if (/^\\\\[?.]\\/.test(override) || (process.platform === 'win32' && !/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+(?:\\|$))/.test(override)) || !isAbsolute(override) || resolve(override) === parse(resolve(override)).root) {
    throw Error('WEFTLET_USER_CACHE_ROOT must be an absolute dedicated directory');
  }
  return resolve(override);
}

export function resolveStorageRoot(
  repositoryRoot: string,
  config: ContextGraphConfig,
  userCacheRoot?: string,
): string {
  if (config.storageScope !== 'user') return resolve(repositoryRoot, config.storagePath);
  const profile = sha256(stableJson({ config, checkout: resolve(repositoryRoot) })).slice(0, 20);
  return resolve(userCacheRoot ?? resolveUserCacheRoot(), profile);
}

// These controls do not change a successful built-in CLI extraction. Unknown
// fields and module-provider configuration remain conservative identity inputs.
const cliOperationalFields = new Set([
  'timeoutMs', 'retries', 'concurrency', 'maxDocuments', 'maxSourceBytes',
]);

export function semanticCachePartition(repositoryRoot: string, config: ContextGraphConfig): string {
  if (config.documentTraversal) assertDocumentTraversalConfig(config.documentTraversal);
  const semantic = config.semantic.provider !== 'module'
    ? Object.fromEntries(Object.entries(config.semantic).filter(([field]) => !cliOperationalFields.has(field)))
    : config.semantic;
  // Traversal/role metadata is assembled after the built-in CLI artifact is validated.
  // Keep the old partition exactly when enabling it; do not ignore unknown configuration.
  const { documentTraversal: _traversal, ...directConfig } = config;
  const inputs = config.semantic.provider !== 'module' ? directConfig : config;
  return sha256(stableJson({ config: { ...inputs, semantic }, checkout: resolve(repositoryRoot) }));
}

/** Snapshot profiles retain the full configuration. Only built-in CLI user artifacts share operational changes. */
export function resolveSemanticStorageRoots(repositoryRoot: string, config: ContextGraphConfig,
  userCacheRoot?: string): { primary: string; legacy?: string } {
  const legacy = resolveStorageRoot(repositoryRoot, config, userCacheRoot);
  // Module providers can inspect arbitrary extraction context. Opt-in traversal isolates their
  // artifacts even in workspace storage, while unchanged committed sources still reuse them.
  if (config.documentTraversal && config.semantic.provider === 'module') {
    return { primary: resolve(legacy, 'document-semantic-v1', semanticCachePartition(repositoryRoot, config)) };
  }
  if (config.storageScope !== 'user' || config.semantic.provider === 'module') return { primary: legacy };
  return { primary: resolve(userCacheRoot ?? resolveUserCacheRoot(), 'semantic-artifacts-v1', semanticCachePartition(repositoryRoot, config)), legacy };
}
