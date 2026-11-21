import { posix } from 'node:path';
import { physicalArtifactKey } from '../../infrastructure/artifact-paths.js';
import type { CacheObject } from '../inspection/layout.js';
import type { RetentionPolicy } from './policy.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const lock = /^work\/ontology-([^/]+)\/\.gradle\/(?:8\.10\.2\/(?:checksums\/checksums|executionHistory\/executionHistory|fileHashes\/fileHashes)|buildOutputCleanup\/buildOutputCleanup)\.lock$/;

/** Historical compilers used the full logical snapshot ID, sometimes followed by a fresh UUID. */
export function compilerLockClassifier(objects: readonly CacheObject[], policy: RetentionPolicy, rootId: string) {
  const owners = new Map<string, string | null>(policy.profiles.map(p => [p.path, p.repositoryId]));
  const declarations = new Map((policy.historicalCompilerWorkspaces ?? []).map(d => [
    (d.profile === '.' ? '' : d.profile + '/') + 'work/' + d.directory, d]));
  const directories = new Map(objects.filter(e => declarations.has(e.path) && e.kind === 'directory').map(e => [e.path, e.physicalIdentity]));
  const witnesses = new Map<string, Map<string, string | null>>();
  const incomplete = new Set<string>();
  for (const entry of objects) {
    if (entry.category !== 'snapshot') continue;
    const m = entry.metadata;
    if (!m?.repositoryId || !entry.sha256 || entry.inspection !== 'json-complete') {
      if (entry.kind !== 'directory') incomplete.add(entry.profile);
      continue;
    }
    const prior = owners.get(entry.profile);
    owners.set(entry.profile, prior === undefined || prior === m.repositoryId ? m.repositoryId : null);
    if (!m.snapshotId || !m.commitSha || !/^[a-f0-9]{40}$/.test(m.commitSha) ||
        !(m.snapshotId === m.commitSha || m.snapshotId.startsWith(m.commitSha + '-'))) continue;
    const basename = posix.basename(entry.path);
    if (entry.kind !== 'file' || entry.linkCount !== 1 || !entry.physicalIdentity ||
        ![m.snapshotId, physicalArtifactKey(m.snapshotId)].some(key => basename === key + '.json')) {
      incomplete.add(entry.profile);
      continue;
    }
    const ids = witnesses.get(entry.profile) ?? new Map<string, string | null>();
    const key = m.snapshotId.toLowerCase();
    ids.set(key, ids.has(key) ? null : m.snapshotId);
    witnesses.set(entry.profile, ids);
  }
  return (entry: CacheObject) => {
    const prefix = entry.profile === '.' ? '' : entry.profile + '/';
    const name = entry.path.startsWith(prefix) && lock.exec(entry.path.slice(prefix.length))?.[1];
    if (entry.category !== 'temporary' || !name) return 'unrecognized-lock-layout';
    if (!owners.has(entry.profile)) return 'unresolved-profile-owner';
    if (!owners.get(entry.profile)) return 'ambiguous-profile-owner';
    if (entry.kind !== 'file' || entry.linkCount !== 1 || !entry.physicalIdentity || entry.activity !== 'unknown') return 'unsafe-lock-object';
    if (uuid.test(name)) return 'recognized';
    const ids = witnesses.get(entry.profile);
    const tail = name.slice(-36);
    const candidates = [name];
    if (name.at(-37) === '-' && uuid.test(tail)) candidates.push(name.slice(0, -37));
    const matching = candidates.filter(id => ids?.has(id.toLowerCase()));
    if (matching.length > 1 || matching.some(id => ids?.get(id.toLowerCase()) !== id) || incomplete.has(entry.profile)) {
      return 'ambiguous-historical-workspace';
    }
    const path = prefix + 'work/ontology-' + name;
    const declaration = declarations.get(path);
    if (declaration) {
      if (declaration.rootId !== rootId || declaration.physicalIdentity !== directories.get(path)) return 'historical-workspace-identity-changed';
      return 'recognized';
    }
    return matching.length === 1 ? 'recognized' : 'unverified-historical-workspace';
  };
}
