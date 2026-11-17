import { stableJsonDigest, type GraphSnapshot } from '@weftlet/core';
import { loadConfig } from '../../configuration/config.js';
import { resolveStorageRoot, resolveSemanticStorageRoots } from '../../configuration/cache.js';
import { FileSnapshotStore, SemanticArtifactStore } from '../../storage/storage.js';
import { GitRepository } from '../../repository/git.js';
import { inspectSavedEvidence } from '../saved-evidence.js';
import { requiredSnapshotExtractorVersions } from '../extraction-identity.js';
import { sameValue } from './validation.js';

/** Configuration is data here: never initialize the application or load a custom adapter. */
export async function deliveryContext(configPath: string) {
  const loaded = await loadConfig(configPath);
  const { repositoryRoot, config } = loaded;
  const storageRoot = resolveStorageRoot(repositoryRoot, config);
  const semanticRoots = resolveSemanticStorageRoots(repositoryRoot, config);
  return { ...loaded, storageRoot, semanticRoots, store: new FileSnapshotStore(storageRoot),
    artifacts: new SemanticArtifactStore(semanticRoots.primary, semanticRoots.legacy ? [semanticRoots.legacy] : []),
    repository: new GitRepository(repositoryRoot), configurationDigest: stableJsonDigest(config) };
}
export type DeliveryContext = Awaited<ReturnType<typeof deliveryContext>>;
export async function deliveryState(context: DeliveryContext, snapshot: GraphSnapshot) {
  if (snapshot.manifest.repositoryId !== context.config.repositoryId) throw Error('Bundle belongs to a different repository identity');
  return inspectSavedEvidence(snapshot.manifest, context.repository, context.configurationDigest,
    requiredSnapshotExtractorVersions(context.config));
}
export function activationHead(context: DeliveryContext, snapshot: GraphSnapshot) {
  const m = snapshot.manifest;
  if (context.config.agentContext) return `agent-${stableJsonDigest(m.scope).slice(0, 16)}`;
  const scope = context.config.documentTraversal ? m.documentSelection?.documentPaths : context.config.semanticSources;
  if (!scope || !sameValue(scope, m.scope)) throw Error('Snapshot scope does not match the configured default head');
  return 'default';
}
