import { isDeepStrictEqual } from 'node:util';
import { type FileHandle, lstat, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { SnapshotManifest } from '@weftlet/core';
import { physicalArtifactKey } from '../infrastructure/artifact-paths.js';
import { withManagedCacheAccess } from './coordination/managed-access.js';
import { managedRootForPath } from './coordination/managed-root.js';
import { digestOpenFile, inspectFileDigest, inspectSmallJson, withInspectionFile } from './inspection/read.js';
import { snapshotPath } from './storage.js';
import { safeTransferPath, transferDirectory } from './transfer-files.js';

async function exists(path: string) {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

export async function sharedScipRoot(profile: string) {
  await safeTransferPath(profile, true, true);
  const owner = await managedRootForPath(profile);
  if (!owner) throw Error('Shared SCIP indexes require a coordinated cache root');
  return owner;
}

function blobDirectory(owner: string, digest: string) {
  if (!/^[0-9a-f]{64}$/.test(digest)) throw Error('Invalid saved SCIP digest');
  return join(owner, 'scip-blobs-v1', digest);
}

function referenceDirectory(profile: string, manifest: SnapshotManifest) {
  // Apply the same logical-ID bounds and containment rules as the snapshot store.
  const key = basename(snapshotPath(profile, manifest.snapshotId), '.json');
  return join(profile, 'scip', 'refs-v1', key + '.ref');
}

function reference(manifest: SnapshotManifest) {
  const { repositoryId, snapshotId, commitSha, contentDigest, scipIndexDigest } = manifest;
  return { schemaVersion: 1, repositoryId, snapshotId, commitSha, contentDigest, scipIndexDigest };
}

// A same-parent directory rename makes a complete, nonempty entry visible in one step.
// Concurrent writers cannot replace a nonempty winner on POSIX or Windows.
async function install(directory: string, name: string, bytes: Uint8Array | string, verify: (path: string) => Promise<void>) {
  await transferDirectory(dirname(directory));
  const path = join(directory, name);
  if (!await exists(directory)) {
    const staging = await mkdtemp(join(dirname(directory), '.stage-'));
    try {
      await writeFile(join(staging, name), bytes, { flag: 'wx', mode: 0o600 });
      await verify(join(staging, name));
      try {
        await rename(staging, directory);
        return path; // This exact verified file became the immutable entry.
      }
      catch (error) { if (!await exists(directory)) throw error; }
    } finally { await rm(staging, { recursive: true, force: true, maxRetries: 5 }); }
  }
  await verify(path);
  return path;
}

async function verifyDigest(path: string, digest: string) {
  await safeTransferPath(path);
  const result = await inspectFileDigest(path, Number.MAX_SAFE_INTEGER);
  if (result.sha256 !== digest) throw Error('SCIP index integrity mismatch');
}

async function verifyReference(path: string, manifest: SnapshotManifest) {
  await safeTransferPath(path);
  if (!isDeepStrictEqual(await inspectSmallJson(path, 64 * 1024, true), reference(manifest))) {
    throw Error('Shared SCIP reference disagrees with the snapshot manifest');
  }
}

export async function storeScipBlob(profile: string, digest: string, bytes: Uint8Array) {
  return install(blobDirectory(await sharedScipRoot(profile), digest), 'index.scip', bytes,
    path => verifyDigest(path, digest));
}

export async function publishScipReference(profile: string, manifest: SnapshotManifest) {
  const blob = join(blobDirectory(await sharedScipRoot(profile), manifest.scipIndexDigest), 'index.scip');
  await verifyDigest(blob, manifest.scipIndexDigest);
  await install(referenceDirectory(profile, manifest), 'reference.json', JSON.stringify(reference(manifest)),
    path => verifyReference(path, manifest));
}

async function referencedScipPath(profile: string, manifest: SnapshotManifest) {
  const directory = referenceDirectory(profile, manifest);
  await safeTransferPath(dirname(directory), true, true);
  if (!await exists(directory)) return undefined;
  await verifyReference(join(directory, 'reference.json'), manifest);
  return join(blobDirectory(await sharedScipRoot(profile), manifest.scipIndexDigest), 'index.scip');
}

export async function verifyExistingScipReference(profile: string, manifest: SnapshotManifest) {
  // Old caches may live behind an unmanaged alias. Only enter shared resolution when its namespace exists.
  if (!await exists(join(profile, 'scip', 'refs-v1'))) return;
  const path = await referencedScipPath(profile, manifest);
  if (path !== undefined) await verifyDigest(path, manifest.scipIndexDigest);
}

/** Verify an exact generation and hold cooperative maintenance off throughout the caller's read. */
export function withSavedScipIndex<T>(profile: string, manifest: SnapshotManifest, read: (index: FileHandle) => Promise<T>) {
  return withManagedCacheAccess([profile], async () => {
    let path = await referencedScipPath(profile, manifest);
    if (path === undefined) {
      const key = physicalArtifactKey(manifest.snapshotId);
      path = join(profile, 'scip', key + '.scip');
      const windowsDevice = process.platform === 'win32' && /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(manifest.snapshotId);
      if (!windowsDevice && key !== manifest.snapshotId && Buffer.byteLength(manifest.snapshotId + '.scip') <= 255 &&
          !await exists(path)) path = join(profile, 'scip', manifest.snapshotId + '.scip');
    }
    await safeTransferPath(path);
    return withInspectionFile(path, Number.MAX_SAFE_INTEGER, async handle => {
      if ((await digestOpenFile(handle, Number.MAX_SAFE_INTEGER)).sha256 !== manifest.scipIndexDigest) {
        throw Error('SCIP index integrity mismatch');
      }
      return read(handle);
    });
  });
}
