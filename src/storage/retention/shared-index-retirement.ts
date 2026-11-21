import { persistedJsonDigest } from '@weftlet/core';
import { lstat, readdir, rename, rmdir, unlink } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { inspectSmallJson } from '../inspection/read.js';
import type { CacheObject } from '../inspection/layout.js';
import type { CacheMaintenanceScope } from '../coordination/access.js';
import { safeTransferPath } from '../transfer-files.js';
import {
  captureEntry,
  identity,
  readWitness,
  referenceDir,
  witnessDirectory,
  type SharedEntry,
} from './shared-index-witness.js';
import { prepareRetentionOwned, withRetentionMaintenance, type PreparedRetentionOptions } from './prepared.js';

const retiredPath = (e: SharedEntry) =>
  posix.join(posix.dirname(e.directory), '.retiring-' + persistedJsonDigest([e.directory, e.directoryId]));
async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}

async function locate(root: string, entry: SharedEntry, limit: number) {
  const retired = retiredPath(entry),
    canonical = await exists(join(root, entry.directory)),
    staged = await exists(join(root, retired));
  if (!canonical && !staged) return;
  const path = staged ? retired : entry.directory;
  await safeTransferPath(join(root, path), true);
  if ((await identity(join(root, path))) !== entry.directoryId) {
    if (!staged) return; // A later canonical publication has its own identity and needs its own proof.
    throw Error('Staged shared directory ownership changed');
  }
  const children = await readdir(join(root, path));
  if (staged && children.length === 0) return { path, empty: true };
  const observed = await captureEntry(root, path, entry.name, limit);
  if (!isDeepStrictEqual({ ...observed, directory: entry.directory }, entry)) throw Error('Shared payload changed');
  return { path, empty: false };
}

async function prepare(options: PreparedRetentionOptions, root: string, rootId: string) {
  let inventory: CacheObject[] = [];
  const base = await prepareRetentionOwned(options, root, rootId, (objects) => {
    inventory = objects;
  });
  const issues = [...base.issues],
    receipts: string[] = [];
  const references = new Map<string, SharedEntry>(),
    blobs = new Map<string, SharedEntry>();
  const heldProofs = new Map<string, string>(),
    emptyStages = new Set<string>();
  const excludedStages = new Set<string>(),
    sourceGraphs = new Set<string>(),
    liveDigests = new Set<string>();
  const actualRefs = new Map<string, string>();
  if (!base.policy.retireCompanionIndexes) issues.push({ path: '.', code: 'companion-policy-required' });
  const limit = base.limits.maxBytes,
    journals = new Map();
  for (const o of inventory) {
    if (
      o.path
        .split('/')
        .some(
          (s) => ['scip', 'refs-v1', 'snapshots', 'scip-blobs-v1'].includes(s.toLowerCase()) && s !== s.toLowerCase(),
        )
    )
      issues.push({ path: o.path, code: 'noncanonical-index-namespace' });
    if (o.kind === 'link' || o.kind === 'other') issues.push({ path: o.path, code: 'unverified-root-object' });
    if (o.category === 'snapshot') {
      if (o.inspection !== 'json-complete' || !o.metadata?.snapshotId)
        issues.push({ path: o.path, code: 'unverified-snapshot' });
      else {
        sourceGraphs.add(JSON.stringify([o.profile, o.metadata.snapshotId]));
        if (o.metadata.scipIndexDigest) liveDigests.add(o.metadata.scipIndexDigest);
      }
    }
  }
  for (const o of inventory.filter((o) => o.path.startsWith(witnessDirectory + '/'))) {
    try {
      if (o.kind !== 'file' || o.linkCount !== 1 || posix.dirname(o.path) !== witnessDirectory) throw Error();
      const { witness: w, authorized } = await readWitness(root, rootId, o.path, journals);
      const history = base.policy.history;
      if (
        history?.mode === 'indefinite' ||
        (history?.mode === 'target' &&
          history.repositories?.some((r) => r.repositoryId === w.repositoryId && r.mode === 'indefinite'))
      ) {
        excludedStages.add(retiredPath(w.reference));
        liveDigests.add(w.indexDigest);
        continue;
      }
      if (!authorized || !base.policy.profiles.some((p) => p.path === w.profile && p.repositoryId === w.repositoryId))
        continue;
      const live = sourceGraphs.has(JSON.stringify([w.profile, w.snapshotId]));
      const refStage = retiredPath(w.reference),
        blobStage = retiredPath(w.blob);
      if (!live || (await exists(join(root, refStage)))) {
        const r = await locate(root, w.reference, limit);
        if (r) references.set(r.path, w.reference);
        if (r?.empty) emptyStages.add(r.path);
      }
      excludedStages.add(refStage);
      excludedStages.add(blobStage);
      blobs.set(blobStage, w.blob);
      heldProofs.set(blobStage, o.path);
      receipts.push(o.path);
    } catch {
      issues.push({ path: o.path, code: 'unverified-retirement-witness' });
    }
  }
  for (const o of inventory) {
    options.signal?.throwIfAborted();
    const m = /^(?:(.*)\/)?scip\/refs-v1(?:\/(.*))?$/.exec(o.path);
    if (!m) continue;
    if (excludedStages.has(o.path) || excludedStages.has(posix.dirname(o.path))) continue;
    const profile = m[1] ?? '.',
      suffix = m[2];
    if ((!suffix || /^[^/]+\.ref$/.test(suffix)) && o.kind === 'directory') {
      if (suffix && !(await exists(join(root, o.path, 'reference.json'))))
        issues.push({ path: o.path, code: 'incomplete-generation-reference' });
      continue;
    }
    try {
      if (o.kind !== 'file' || o.linkCount !== 1 || !/^[^/]+\.ref\/reference\.json$/.test(suffix ?? '')) throw Error();
      const ref = (await inspectSmallJson(join(root, o.path), 64 * 1024, true)) as {
        schemaVersion: number;
        snapshotId: string;
        scipIndexDigest: string;
      };
      const directory = posix.dirname(o.path);
      if (
        ref.schemaVersion !== 1 ||
        referenceDir(profile, ref.snapshotId) !== directory ||
        !/^[0-9a-f]{64}$/.test(ref.scipIndexDigest)
      )
        throw Error();
      actualRefs.set(directory, ref.scipIndexDigest);
    } catch {
      issues.push({ path: o.path, code: 'unverified-generation-reference' });
    }
  }
  for (const [dir, digest] of actualRefs) if (!references.has(dir)) liveDigests.add(digest);
  const keep = new Set<string>();
  for (const [stage, blob] of blobs) {
    try {
      if (liveDigests.has(blob.sha256) && !(await exists(join(root, stage)))) {
        blobs.delete(stage);
        // Keep one proof even for a raw-index-only or imported graph with no future shared retirement.
        keep.add(heldProofs.get(stage)!);
        continue;
      }
      const found = await locate(root, blob, limit);
      if (!found) blobs.delete(stage);
      if (found?.empty) emptyStages.add(found.path);
    } catch {
      issues.push({ path: blob.directory, code: 'unverified-shared-blob' });
    }
  }
  const entries = [...references.values(), ...blobs.values()];
  const body = {
    version: 1,
    kind: 'shared-index-retirement',
    rootId,
    limits: base.limits,
    policyDigest: base.policyDigest,
    stateDigest: base.stateDigest,
    canApply: issues.length === 0,
    issues,
    entries,
    receipts: receipts.filter((p) => !keep.has(p)),
    logicalPayloadBytes: entries.reduce((sum, e) => sum + (emptyStages.has(retiredPath(e)) ? 0 : e.bytes), 0),
  };
  return { ...body, planId: persistedJsonDigest(body) };
}
export function prepareSharedRetirement(options: PreparedRetentionOptions) {
  return withRetentionMaintenance(options, (root, id) => prepare(options, root, id));
}

async function removeEntry(root: string, e: SharedEntry, limit: number, scope: CacheMaintenanceScope) {
  const at = await locate(root, e, limit);
  if (!at) throw Error('Reviewed entry disappeared');
  const target = join(root, retiredPath(e));
  await scope.verify();
  if (at.path === e.directory) await rename(join(root, at.path), target);
  // Publishing readers can never encounter an empty canonical entry, even after a process crash.
  const moved = await locate(root, e, limit);
  if (moved?.path !== retiredPath(e)) throw Error('Retired directory identity changed');
  if (!moved.empty) await unlink(join(target, e.name));
  await rmdir(target);
}
export async function applySharedRetirement(saved: unknown, expected: string, options: PreparedRetentionOptions) {
  const { planId, ...body } = (saved ?? {}) as Awaited<ReturnType<typeof prepare>>;
  if (body.kind !== 'shared-index-retirement' || planId !== expected || persistedJsonDigest(body) !== expected)
    throw Error('Unsupported or edited shared retirement plan');
  return withRetentionMaintenance(options, async (root, id, scope) => {
    const current = await prepare({ ...options, ...body.limits }, root, id);
    if (!current.canApply || current.planId !== expected) throw Error('Stale or blocked shared retirement plan');
    return finish(root, id, current, options, scope);
  });
}
export async function maintainSharedRetirement(
  root: string,
  id: string,
  options: PreparedRetentionOptions,
  scope: CacheMaintenanceScope,
) {
  if (!(await exists(join(root, witnessDirectory))) || !(await readdir(join(root, witnessDirectory))).length) return;
  const current = await prepare(options, root, id);
  if (!current.canApply) throw Error('Shared index retirement is blocked; review prepare-index-retirement');
  return finish(root, id, current, options, scope);
}
async function finish(
  root: string,
  id: string,
  current: Awaited<ReturnType<typeof prepare>>,
  options: PreparedRetentionOptions,
  scope: CacheMaintenanceScope,
) {
  const journals = new Map();
  for (const entry of current.entries) {
    options.signal?.throwIfAborted();
    if (persistedJsonDigest((await options.readPolicy?.()) ?? options.policy) !== current.policyDigest)
      throw Error('Retention policy changed');
    await removeEntry(root, entry, current.limits.maxBytes, scope);
  }
  for (const path of current.receipts) {
    options.signal?.throwIfAborted();
    await scope.verify();
    await readWitness(root, id, path, journals);
    await unlink(join(root, path));
  }
  return { planId: current.planId, entriesRemoved: current.entries.length, receiptsRemoved: current.receipts.length };
}
