import { posix } from 'node:path';
import { physicalArtifactKey } from '../../infrastructure/artifact-paths.js';
import type { CacheObject } from '../inspection/layout.js';
import type { RetentionPolicy } from './policy.js';

export interface RetentionIssue { code: string; path: string }
interface CompletionReview {
  profile: string; head: string; snapshotId: string; observedSnapshotId: string | null;
  path: string | null; snapshotPaths: string[]; finishedOwners: string[]; remainingOwners: string[];
  status: 'missing-or-invalid' | 'advanced' | 'still-owned' | 'shared-file' | 'leased' | 'eligible';
}
export function resolveRetentionReferences(policy: RetentionPolicy, objects: CacheObject[], now: number) {
  const issues: RetentionIssue[] = [], protectedSnapshots = new Map<string, string[]>();
  const releasedHeads = new Set<string>(), declaredHeads = new Set<string>();
  const completions: CompletionReview[] = [], completedHeads = new Set<string>();
  const profiles = new Map(policy.profiles.map(p => [p.path, p]));
  const byPath = new Map(objects.map(o => [o.path, o]));
  const snapshots = new Map<string, CacheObject[]>();
  for (const entry of objects) if (entry.category === 'snapshot' && entry.metadata?.snapshotId) {
    const key = `${entry.profile}:${entry.metadata.snapshotId}`, list = snapshots.get(key) ?? [];
    list.push(entry); snapshots.set(key, list);
  }
  function snapshot(profile: string, id: string) {
    const found = snapshots.get(`${profile}:${id}`) ?? [];
    if (found.length !== 1 || !valid(found[0]!) || found[0]!.metadata?.repositoryId !== profiles.get(profile)?.repositoryId) {
      issues.push({ code: 'missing-ambiguous-or-invalid-snapshot', path: posix.join(profile, 'snapshots', physicalArtifactKey(id) + '.json') }); return;
    }
    return found[0]!;
  }
  function protect(entry: CacheObject | undefined, reason: string) {
    if (!entry) return;
    const reasons = protectedSnapshots.get(entry.path) ?? []; reasons.push(reason); protectedSnapshots.set(entry.path, reasons);
  }
  function head(profile: string, name: string) {
    const paths = [...new Set([physicalArtifactKey(name), name])].map(key => posix.join(profile, 'heads', key + '.json'));
    const found = paths.map(path => byPath.get(path)).filter((entry): entry is CacheObject => !!entry);
    if (found.length !== 1 || !valid(found[0]!) || !found[0]!.metadata?.snapshotId) {
      issues.push({ code: 'missing-ambiguous-or-invalid-head', path: paths[0]! }); return;
    }
    declaredHeads.add(found[0]!.path); return found[0]!;
  }
  for (const declaration of policy.profiles) {
    if (byPath.get(declaration.path)?.kind !== 'directory') issues.push({ code: 'missing-profile-directory', path: declaration.path });
  }
  for (const scope of policy.activeScopes) {
    const current = head(scope.profile, scope.head);
    const observed = current?.metadata?.snapshotId;
    const target = observed ? snapshot(scope.profile, observed) : undefined;
    const predecessor = current?.metadata?.previousSnapshotId;
    const previous = predecessor ? snapshot(scope.profile, predecessor) : undefined;
    if (scope.completion) {
      const { snapshotId, finishedOwners } = scope.completion;
      const remainingOwners = [scope.owner, ...(scope.additionalOwners ?? [])].filter(owner => !finishedOwners.includes(owner));
      let status: CompletionReview['status'] = 'eligible';
      if (!current || !target || (predecessor && !previous)) status = 'missing-or-invalid';
      else if (snapshotId !== observed) status = 'advanced';
      else if (remainingOwners.length) status = 'still-owned';
      else if (current.linkCount !== 1) status = 'shared-file';
      else if (current.activity !== 'unknown') status = 'leased';
      completions.push({ profile: scope.profile, head: scope.head, snapshotId, observedSnapshotId: observed ?? null,
        path: current?.path ?? null, snapshotPaths: [target, previous].flatMap(entry => entry ? [entry.path] : []),
        finishedOwners, remainingOwners, status });
      if (status === 'eligible' && current) {
        completedHeads.add(current.path);
        releasedHeads.add(current.path);
      }
    }
    if (current && !completedHeads.has(current.path)) protect(target, `active-scope:${scope.head}`);
    if (current && previous && !completedHeads.has(current.path)) {
      protect(previous, `tracked-previous-generation:${scope.head}`);
    }
    if (scope.previousSnapshotId) {
      if (current?.metadata?.snapshotId === scope.previousSnapshotId) issues.push({ code: 'previous-must-differ-from-current', path: current.path });
      protect(snapshot(scope.profile, scope.previousSnapshotId), `previous-generation:${scope.head}`);
    }
  }
  for (const release of policy.releasedHeads) {
    const current = head(release.profile, release.head);
    if (!current) continue;
    if (current.metadata!.snapshotId !== release.snapshotId) { issues.push({ code: 'released-head-advanced', path: current.path }); continue; }
    if (current.metadata!.previousSnapshotId && !snapshot(release.profile, current.metadata!.previousSnapshotId)) continue;
    if (current.linkCount !== 1) { issues.push({ code: 'released-head-is-shared', path: current.path }); continue; }
    if (snapshot(release.profile, release.snapshotId)) releasedHeads.add(current.path);
  }
  const pins = policy.pins.map(pin => {
    const expired = pin.expiresAt !== undefined && Date.parse(pin.expiresAt) <= now;
    if (!expired) protect(snapshot(pin.profile, pin.snapshotId), `explicit-pin:${pin.owner}`);
    return { ...pin, state: expired ? 'expired' : 'protected' };
  });
  return { issues, profiles, protectedSnapshots, releasedHeads, declaredHeads, pins, completedHeads, completions };
}
export const valid = (entry: CacheObject) => entry.kind === 'file' && entry.inspection === 'json-complete';
