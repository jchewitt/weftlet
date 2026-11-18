import { dirname, join } from 'node:path';
import { lstat } from 'node:fs/promises';
import { inspectFileDigest, inspectJson, inspectSmallJsonRecord, InspectionError } from './read.js';
import { object, snapshotMetadata, type CacheObject } from './layout.js';
import { physicalArtifactKey } from '../../infrastructure/artifact-paths.js';
import { parseSnapshotHead } from '../head-state.js';

export async function inspectCacheObject(entry: CacheObject, verify: boolean, maxBytes: number, signal?: AbortSignal) {
  if (entry.kind !== 'file' || entry.category === 'unknown' || entry.category === 'temporary') return;
  const path = join(entry.root, entry.path);
  try {
    signal?.throwIfAborted();
    const now = await lstat(path, { bigint: true });
    if ([now.dev, now.ino, now.size, now.mtimeNs, now.ctimeNs, now.nlink].join(':') !== entry.revision) {
      throw new InspectionError('changed', 'File changed since enumeration');
    }
    await readMetadata(entry, path, verify, maxBytes, signal);
  } catch (error) {
    signal?.throwIfAborted();
    entry.inspection = error instanceof InspectionError ? ({ changed: 'changed', limit: 'limited', 'invalid-json': 'invalid', unsafe: 'unreadable' } as const)[error.code] : 'unreadable';
    entry.protection.push(`inspection-${entry.inspection}`);
  }
}
export function linkInventory(objects: CacheObject[]) {
  const paths = new Map(objects.map(entry => [join(entry.root, entry.path), entry]));
  const danglingHeads: string[] = [];
  for (const head of objects.filter(entry => entry.category === 'head' && entry.metadata?.snapshotId)) {
    const profile = join(head.root, head.profile);
    for (const id of [head.metadata!.snapshotId!, head.metadata!.previousSnapshotId].filter((id): id is string => !!id)) {
      const targets = [...new Set([physicalArtifactKey(id), id])].map(key => paths.get(join(profile, 'snapshots', `${key}.json`))).filter(Boolean) as CacheObject[];
      if (!targets.length && !danglingHeads.includes(join(head.root, head.path))) danglingHeads.push(join(head.root, head.path));
      for (const target of targets) { target.headReferences.push(join(head.root, head.path)); target.protection.push('head-referenced-activity-unverified'); }
    }
  }
  const leased = objects.filter(entry => entry.category === 'lease-marker').map(entry => dirname(join(entry.root, entry.path)));
  for (const entry of objects) {
    const path = join(entry.root, entry.path);
    if (leased.some(root => path === root || path.startsWith(root + (process.platform === 'win32' ? '\\' : '/')))) {
      entry.activity = 'lease-marker-present-unverified'; entry.protection.push('operation-lease-marker');
    }
  }
  return danglingHeads;
}

async function readMetadata(entry: CacheObject, path: string, verify: boolean, maxBytes: number, signal?: AbortSignal) {
  if (entry.category === 'snapshot') {
    const result = await inspectJson(path, { manifestOnly: !verify, maxBytes, signal });
    if (verify && result.sections.facts !== 'array') throw new InspectionError('invalid-json', 'Snapshot facts array missing');
    entry.metadata = snapshotMetadata(result.manifest);
    if (!entry.metadata) throw new InspectionError('invalid-json', 'Snapshot manifest missing or malformed');
    const filename = entry.path.split('/').at(-1);
    if (![`${physicalArtifactKey(entry.metadata.snapshotId!)}.json`, `${entry.metadata.snapshotId}.json`].includes(filename!)) {
      throw new InspectionError('invalid-json', 'Snapshot filename and manifest identity disagree');
    }
    entry.inspection = result.jsonComplete ? 'json-complete' : 'metadata-only'; entry.sha256 = result.sha256;
  } else if (['head', 'comparison-receipt', 'lease-marker'].includes(entry.category)) {
    const { value, sha256 } = await inspectSmallJsonRecord(path, Math.min(maxBytes, 1024 * 1024), true);
    if (!object(value)) throw new InspectionError('invalid-json', 'Expected metadata object');
    if (entry.category === 'head') {
      try {
        const head = parseSnapshotHead(value);
        entry.metadata = { snapshotId: head.snapshotId, ...(head.previousSnapshotId ? { previousSnapshotId: head.previousSnapshotId } : {}) };
      } catch { throw new InspectionError('invalid-json', 'Invalid head generation record'); }
    }
    if (entry.category === 'lease-marker') entry.activity = 'lease-marker-present-unverified';
    entry.inspection = 'json-complete'; entry.sha256 = sha256;
  } else if (verify) {
    const result = entry.category === 'scip-index' ? await inspectFileDigest(path, maxBytes, signal) : await inspectJson(path, { maxBytes, signal });
    entry.sha256 = result.sha256; entry.inspection = entry.category === 'scip-index' ? 'bytes-hashed' : 'json-complete';
  }
}
