import { realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { withManagedCacheAccess } from '../coordination/managed-access.js';
import { indexSharingInventory } from './index-sharing-inventory.js';
import { safeTransferPath } from '../transfer-files.js';
import type { CacheObject } from '../inspection/layout.js';
import { previewScipBlob, previewScipReference, sharedScipRoot } from '../shared-scip.js';
import { matchCompanionIndexes } from './companion-indexes.js';
import { sumBytes } from './history-accounting.js';
import { parseRetentionPolicy, type RetentionPolicy } from './policy.js';
import type { RetentionPlanOptions } from './plan.js';
import { resolveRetentionReferences } from './references.js';

interface Member {
  snapshotPath: string; indexPath: string; snapshotId: string; profile: string; repositoryId: string;
  commitSha: string; contentDigest: string; legacyLogicalBytes: number; legacyAllocatedBytes: number | null;
  referenceExists: boolean; additionalReferenceBytes: number; headReferences: string[]; protections: string[];
}

function generation(entry: CacheObject, contentDigest: string | undefined) {
  const { repositoryId, snapshotId, commitSha, scipIndexDigest } = entry.metadata ?? {};
  if (!repositoryId || !snapshotId || !commitSha || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commitSha) ||
      !scipIndexDigest || !contentDigest || !/^[a-f0-9]{64}$/.test(contentDigest)) throw Error('Unverified generation');
  return { repositoryId, snapshotId, commitSha, scipIndexDigest, contentDigest };
}

function reviewOwnership(inventory: Awaited<ReturnType<typeof indexSharingInventory>>, policy: RetentionPolicy, now: number) {
  const references = resolveRetentionReferences(policy, inventory.objects, now);
  const issues = [...references.issues, ...inventory.issues.map(({ code, path }) => ({ code, path }))];
  for (const path of inventory.danglingHeads) issues.push({ code: 'dangling-head', path });
  for (const head of inventory.objects.filter(o => o.category === 'head' && references.profiles.has(o.profile) && o.inspection !== 'json-complete')) {
    issues.push({ code: 'unverified-head', path: head.path });
  }
  if (!inventory.complete) issues.push({ code: 'incomplete-inventory', path: '.' });
  const indexes = inventory.objects.filter(o => o.category === 'scip-index');
  const excluded = new Map<string, string>(indexes.map(o => [o.path, !references.profiles.has(o.profile) ? 'undeclared-profile' :
    o.kind !== 'file' || o.linkCount !== 1 || !o.physicalIdentity ? 'unsafe-index-file' :
    o.inspection !== 'bytes-hashed' ? 'unverified-index' : 'no-snapshot-owner']));
  const snapshots = inventory.objects.filter(o => o.category === 'snapshot' && references.profiles.has(o.profile));
  const unsafeProfiles = new Set<string>();
  for (const snapshot of snapshots) {
    if (snapshot.inspection !== 'json-complete' || !snapshot.sha256 ||
        snapshot.metadata?.repositoryId !== references.profiles.get(snapshot.profile)!.repositoryId) {
      unsafeProfiles.add(snapshot.profile);
      issues.push({ code: 'snapshot-ownership-or-integrity-unconfirmed', path: snapshot.path });
    }
  }
  for (const index of indexes) {
    if (unsafeProfiles.has(index.profile)) excluded.set(index.path, 'unverified-profile');
  }
  return { references, issues, snapshots, indexes, excluded, unsafeProfiles };
}

function* verifiedPairs(snapshots: CacheObject[], match: ReturnType<typeof matchCompanionIndexes>,
  unsafeProfiles: Set<string>, excluded: Map<string, string>) {
  for (const snapshot of snapshots) {
    if (unsafeProfiles.has(snapshot.profile)) continue;
    const { index, matches, reason } = match(snapshot);
    if (!index) {
      for (const entry of matches) if (excluded.has(entry.path)) excluded.set(entry.path, reason);
    } else if (snapshot.linkCount !== 1 || !snapshot.physicalIdentity || snapshot.activity !== 'unknown') {
      excluded.set(index.path, 'unsafe-snapshot-file');
    } else {
      yield { snapshot, index };
    }
  }
}

export async function previewIndexSharing(options: RetentionPlanOptions) {
  await safeTransferPath(resolve(options.root), true);
  const root = await realpath(options.root), policy = parseRetentionPolicy(options.policy);
  if (await sharedScipRoot(root) !== root) throw Error('Select the exact coordinated cache root for index sharing');
  return withManagedCacheAccess([root], async () => (await inspectIndexSharing(root, { ...options, policy })).report,
    { signal: options.signal });
}

/** Called within an active reader or exclusive maintenance scope on this exact root. */
export async function inspectIndexSharing(root: string, options: RetentionPlanOptions) {
  const { policy } = options;
  for (const profile of policy.profiles) {
    if (await sharedScipRoot(join(root, profile.path)) !== root) throw Error('Different managed profile owner');
  }
  const inventory = await indexSharingInventory(root, options);
  const { references, issues, snapshots, indexes, excluded, unsafeProfiles } =
    reviewOwnership(inventory, policy, (options.now ?? new Date()).getTime());
  const match = matchCompanionIndexes(inventory.objects, policy);
  const groups = new Map<string, { digest: string; blobExists: boolean; members: Member[] }>();
  const blobs = new Map<string, boolean | null>();
  for (const { snapshot, index } of verifiedPairs(snapshots, match, unsafeProfiles, excluded)) {
    options.signal?.throwIfAborted();
    const digest = index.sha256!;
    const profile = join(root, snapshot.profile);
    if (!blobs.has(digest)) {
      try { blobs.set(digest, await previewScipBlob(root, digest, inventory.maxBytes, options.signal)); }
      catch { options.signal?.throwIfAborted(); blobs.set(digest, null); }
    }
    const blobExists = blobs.get(digest);
    if (blobExists == null) { excluded.set(index.path, 'unverified-shared-blob'); continue; }
    try {
      const saved = generation(snapshot, inventory.contentDigests.get(snapshot.path));
      const ref = await previewScipReference(profile, saved);
      if (ref.exists && !blobExists) { excluded.set(index.path, 'dangling-shared-reference'); continue; }
      const group = groups.get(digest) ?? { digest, blobExists, members: [] };
      group.members.push({ snapshotPath: snapshot.path, indexPath: index.path, profile: snapshot.profile,
        repositoryId: saved.repositoryId, snapshotId: saved.snapshotId, commitSha: saved.commitSha, contentDigest: saved.contentDigest,
        legacyLogicalBytes: index.logicalBytes, legacyAllocatedBytes: index.allocatedBytes, referenceExists: ref.exists,
        additionalReferenceBytes: ref.additionalBytes, headReferences: snapshot.headReferences,
        protections: references.protectedSnapshots.get(snapshot.path) ?? [] });
      groups.set(digest, group);
      excluded.delete(index.path);
    } catch { options.signal?.throwIfAborted(); excluded.set(index.path, 'unverified-generation-or-reference'); }
  }
  const measured = [...groups.values()].map(group => {
    const legacyBytes = sumBytes(group.members.map(m => m.legacyLogicalBytes));
    const newBlobBytes = group.blobExists ? 0 : group.members[0]!.legacyLogicalBytes;
    const newReferenceBytes = sumBytes(group.members.map(m => m.additionalReferenceBytes));
    return { ...group, legacyBytes, newBlobBytes, newReferenceBytes,
      projectedLogicalSavings: legacyBytes - newBlobBytes - newReferenceBytes };
  });
  const report = { schemaVersion: 1, kind: 'scip-sharing-preview', root, canApply: false, complete: issues.length === 0,
    issues, groups: measured, excluded: [...excluded].map(([indexPath, reason]) => ({ indexPath, reason })),
    observedLegacyIndexes: indexes.length,
    verifiedGenerations: measured.reduce((n, g) => n + g.members.length, 0),
    positiveGroupLogicalSavings: issues.length ? null : sumBytes(measured.map(g => Math.max(0, g.projectedLogicalSavings))),
    limitations: ['Read-only observation. Groups assume every listed generation keeps its graph and gains or retains a verified index reference.',
      'Positive savings include only groups with a net logical byte reduction. Filesystem allocation, staging space and recovery journals require separate measurement.',
      'Other clients may publish while this runs. A future migration must verify ownership, references and bytes again under exclusive coordination.'] };
  return { inventory, report };
}
