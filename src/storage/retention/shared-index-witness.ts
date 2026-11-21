import { inspectRecoveryReceipts } from '../recovery/receipts.js';
import { validateStarted } from '../recovery/journals.js';
import { persistedJsonDigest, type SnapshotManifest } from '@weftlet/core';
import { lstat, open, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, posix } from 'node:path';
import { inspectFileDigest, inspectJson, inspectSmallJson } from '../inspection/read.js';
import { previewScipReference, sharedScipRoot } from '../shared-scip.js';
import { snapshotPath } from '../storage.js';
import { safeTransferPath, transferDirectory } from '../transfer-files.js';
import { readControl } from '../recovery/state.js';
import { parseUniqueJson } from '../../infrastructure/unique-json.js';
import { removalCandidates, removalEvents } from '../recovery/journal-events.js';

export const witnessDirectory = 'scip-retirements-v1';
export interface SharedEntry {
  directory: string;
  directoryId: string;
  fileId: string;
  name: 'reference.json' | 'index.scip';
  sha256: string;
  bytes: number;
}
export interface RetirementWitness {
  schemaVersion: 1;
  rootId: string;
  operationId: string;
  profile: string;
  repositoryId: string;
  snapshotId: string;
  snapshot: string;
  snapshotSha256: string;
  indexDigest: string;
  reference: SharedEntry;
  blob: SharedEntry;
}
export async function identity(path: string) {
  const s = await lstat(path, { bigint: true });
  if (!s.ino) throw Error('Missing shared index filesystem identity');
  return [s.dev, s.ino, s.birthtimeNs].join(':');
}
export function referenceDir(profile: string, id: string) {
  return posix.join(profile, 'scip', 'refs-v1', basename(snapshotPath('.', id), '.json') + '.ref');
}
export async function captureEntry(root: string, directory: string, name: SharedEntry['name'], maxBytes: number) {
  const dir = join(root, directory),
    path = join(dir, name);
  await safeTransferPath(dir, true);
  await safeTransferPath(path);
  const entries = await readdir(dir);
  if (entries.length !== 1 || entries[0] !== name) throw Error('Unexpected contents in shared index entry');
  const { sha256, bytes } = await inspectFileDigest(path, maxBytes);
  return { directory, directoryId: await identity(dir), fileId: await identity(path), name, sha256, bytes };
}
export async function witnessRemoval(
  root: string,
  rootId: string,
  operationId: string,
  snapshot: string,
  snapshotSha256: string,
  maxBytes: number,
  verifiedBlobs: Map<string, SharedEntry>,
) {
  const profile = posix.dirname(posix.dirname(snapshot));
  const refParent = join(root, profile, 'scip', 'refs-v1');
  try {
    await lstat(refParent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const { manifest } = await inspectJson(join(root, snapshot), {
    manifestOnly: true,
    snapshotEncoding: true,
    maxBytes,
  });
  const m = manifest as unknown as SnapshotManifest;
  if (!(await previewScipReference(join(root, profile), m)).exists) return;
  if ((await sharedScipRoot(join(root, profile))) !== root || !/^[a-f0-9]{64}$/.test(m.scipIndexDigest))
    throw Error('Invalid shared index owner');
  const reference = await captureEntry(root, referenceDir(profile, m.snapshotId), 'reference.json', maxBytes);
  const directory = posix.join('scip-blobs-v1', m.scipIndexDigest);
  let blob = verifiedBlobs.get(directory);
  if (!blob) {
    blob = await captureEntry(root, directory, 'index.scip', maxBytes);
    verifiedBlobs.set(directory, blob);
  }
  if (blob.sha256 !== m.scipIndexDigest) throw Error('Corrupt shared index');
  const record: RetirementWitness = {
    schemaVersion: 1,
    rootId,
    operationId,
    profile,
    repositoryId: m.repositoryId,
    snapshotId: m.snapshotId,
    snapshot,
    snapshotSha256,
    indexDigest: m.scipIndexDigest,
    reference,
    blob,
  };
  const digest = persistedJsonDigest(record);
  const target = join(root, witnessDirectory, digest + '.json');
  await transferDirectory(dirname(target));
  const staging = join(root, 'scip-retirement-staging-v1', digest + '.tmp');
  await transferDirectory(dirname(staging));
  const handle = await open(staging, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(JSON.stringify(record));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(staging, target);
  } finally {
    await rm(staging, { force: true });
  }
  return digest;
}

/** A certificate only authorizes later review after its original snapshot has an actual journaled removal intent. */
type Journal = Awaited<ReturnType<typeof readSnapshotIntents>>;
export async function readWitness(root: string, rootId: string, path: string, journals = new Map<string, Journal>()) {
  const w = (await inspectSmallJson(join(root, path), 16_384, true)) as RetirementWitness;
  if (
    !w ||
    w.schemaVersion !== 1 ||
    w.rootId !== rootId ||
    posix.basename(path) !== persistedJsonDigest(w) + '.json' ||
    !/^[\da-f-]{36}$/.test(w.operationId) ||
    !/^[a-f0-9]{64}$/.test(w.indexDigest) ||
    w.blob.directory !== 'scip-blobs-v1/' + w.indexDigest ||
    w.blob.name !== 'index.scip' ||
    w.blob.sha256 !== w.indexDigest ||
    w.reference.directory !== referenceDir(w.profile, w.snapshotId) ||
    w.reference.name !== 'reference.json' ||
    w.profile !== posix.dirname(posix.dirname(w.snapshot)) ||
    ![posix.basename(snapshotPath('.', w.snapshotId)), w.snapshotId + '.json'].some(
      (name) => posix.join(w.profile, 'snapshots', name) === w.snapshot,
    )
  )
    throw Error('Invalid shared retirement witness');
  let journal = journals.get(w.operationId);
  if (!journal) {
    journal = await readSnapshotIntents(root, rootId, w.operationId);
    journals.set(w.operationId, journal);
  }
  if (journal.candidates.get(w.snapshot)?.sha256 !== w.snapshotSha256)
    throw Error('Journal disagrees with retired graph');
  return { witness: w, authorized: journal.witnesses.get(w.snapshot) === persistedJsonDigest(w) };
}
async function readSnapshotIntents(root: string, rootId: string, operationId: string) {
  const journal = '.weftlet-coordination/removals/' + operationId + '.jsonl';
  const control = await readControl(root, journal);
  const bytes = control.bytes.toString('utf8');
  if (!bytes.endsWith('\n')) throw Error('Incomplete removal journal');
  const [first, ...events] = bytes.trimEnd().split('\n').map(parseUniqueJson);
  if (
    !first ||
    typeof first !== 'object' ||
    !('planId' in first) ||
    typeof first.planId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(first.planId)
  )
    throw Error('Invalid retirement journal');
  const planId = first.planId;
  validateStarted(first, operationId, planId, rootId, 1);
  const candidates = removalCandidates((first as Record<string, unknown>).candidates);
  const { witnesses, removed } = removalEvents(events, candidates, {
    operationId: operationId,
    planId,
    journalPath: join(root, journal),
  });
  if (
    [...witnesses.keys()].some((path) => !removed.has(path)) &&
    !events.some((e) => e && typeof e === 'object' && 'event' in e && e.event === 'finished')
  ) {
    for (const path of await recoveredAbsences(root, rootId, journal, control.file.sha256)) removed.add(path);
  }
  for (const path of witnesses.keys()) if (!removed.has(path)) witnesses.delete(path);
  return { candidates, witnesses };
}

async function recoveredAbsences(root: string, rootId: string, journal: string, sha256: string) {
  const directory = '.weftlet-coordination/recovery';
  const names = await readdir(join(root, directory)).catch((error) => {
    if (error.code === 'ENOENT') return [] as string[];
    throw error;
  });
  const absent = new Set<string>();
  for (const name of names) {
    if (!/^[a-f0-9]{64}\.done\.json$/.test(name)) continue;
    const id = name.slice(0, 64),
      prefix = directory + '/' + id;
    const values = new Map<string, unknown>();
    for (const suffix of ['claim', 'start', 'done']) {
      const path = prefix + '.' + suffix + '.json';
      values.set(path, parseUniqueJson((await readControl(root, path)).bytes.toString('utf8')));
    }
    const check = inspectRecoveryReceipts(values, root, rootId);
    if (check.issues.length || !check.resolved.has(id)) throw Error('Invalid recovery record');
    const start = values.get(prefix + '.start.json') as {
      originalPlan: {
        controls: { path: string; sha256: string }[];
        journals: {
          journal: string;
          candidates: { path: string; state: string }[];
        }[];
      };
    };
    if (!start.originalPlan.controls.some((f) => f.path === journal && f.sha256 === sha256)) continue;
    for (const j of start.originalPlan.journals)
      if (j.journal === journal) {
        for (const c of j.candidates) if (c.state === 'absent') absent.add(c.path);
      }
  }
  return absent;
}
