import { posix } from 'node:path';
import { physicalArtifactKey } from '../../infrastructure/artifact-paths.js';
import type { CacheObject } from '../inspection/layout.js';
import type { RetentionDecision } from './decisions.js';
import type { RetentionPolicy } from './policy.js';

function indexPaths(snapshot: CacheObject) {
  const id = snapshot.metadata?.snapshotId;
  if (snapshot.category !== 'snapshot' || !id || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(id)) return [];
  return [...new Set([physicalArtifactKey(id), id])].map(key => posix.join(snapshot.profile, 'scip', key + '.scip'));
}

/** Pair by the producer's profile and filename, then authenticate the index bytes with its manifest. */
export function pairCompanionIndexes(objects: CacheObject[], decisions: RetentionDecision[], policy: RetentionPolicy) {
  const companions = new Map<string, string>();
  if (!policy.retireCompanionIndexes) return companions;
  const byName = new Map<string, CacheObject[]>();
  const byDecision = new Map(decisions.map(d => [d.path, d]));
  const profiles = new Set(policy.profiles.map(p => p.path.toLowerCase()));
  // Long logical IDs may differ only by case and have distinct bounded filenames but one legacy path.
  const ownerCounts = new Map<string, number>();
  for (const object of objects) {
    const name = object.path.toLowerCase();
    if (name.endsWith('.scip')) {
      const entries = byName.get(name) ?? [];
      entries.push(object);
      byName.set(name, entries);
    }
    for (const path of indexPaths(object)) {
      const key = path.toLowerCase();
      ownerCounts.set(key, (ownerCounts.get(key) ?? 0) + 1);
    }
  }
  for (const snapshot of objects) {
    const digest = snapshot.metadata?.scipIndexDigest;
    if (snapshot.category !== 'snapshot' || byDecision.get(snapshot.path)?.disposition !== 'candidate' || !digest) continue;
    const indexDir = posix.join(snapshot.profile, 'scip'), snapshotDir = posix.dirname(snapshot.path);
    if (profiles.has(indexDir.toLowerCase()) || profiles.has(snapshotDir.toLowerCase())) continue;
    const paths = indexPaths(snapshot);
    const matches = paths.flatMap(path => byName.get(path.toLowerCase()) ?? []);
    if (matches.length !== 1) continue;
    const index = matches[0]!;
    if (!paths.includes(index.path) || ownerCounts.get(index.path.toLowerCase()) !== 1) continue;
    if (index.category !== 'scip-index' || index.profile !== snapshot.profile || index.kind !== 'file' ||
        index.inspection !== 'bytes-hashed' || index.sha256 !== digest || index.linkCount !== 1 ||
        !index.physicalIdentity || index.activity !== 'unknown') continue;
    const decision = byDecision.get(index.path)!;
    decision.disposition = 'candidate';
    decision.reasons = ['verified-scip-companion'];
    decision.removeBefore = [snapshot.path];
    decision.recovery = 'Reindexing requires the exact source and compatible tools. No rebuild runs during removal.';
    companions.set(snapshot.path, index.path);
  }
  return companions;
}
