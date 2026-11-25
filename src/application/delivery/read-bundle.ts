import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256, type GraphSnapshot } from '@weftlet/core';
import { safeTransferPath } from '../../storage/transfer-files.js';
import { parseJsonChunks } from '../../storage/streaming-json.js';
import { assertBundle, manifestByteLimit, validDigest, type SnapshotBundle } from './contract.js';
import { sameValue, validateSnapshotRecords } from './validation.js';

/** Bound bytes on the stream being consumed, including if the input changes during startup. */
async function* boundedChunks(path: string, limit: number) {
  await safeTransferPath(path);
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer = chunk as Buffer;
    bytes += buffer.length;
    if (bytes > limit) throw Error('Snapshot transfer byte limit exceeded');
    yield buffer;
  }
}

export async function readBundleManifest(input: string, expectDigest: string, maxBytes: number) {
  if (!validDigest(expectDigest)) throw Error('A trusted manifest SHA-256 is required via --expect-digest');
  const chunks = [];
  for await (const chunk of boundedChunks(join(input, 'manifest.json'), manifestByteLimit)) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  if (sha256(raw) !== expectDigest) throw Error('Bundle manifest integrity mismatch');
  let bundle: unknown;
  try { bundle = JSON.parse(raw.toString('utf8')); }
  catch { throw Error('Invalid bundle manifest JSON'); }
  assertBundle(bundle, maxBytes);
  const names = (await readdir(input)).sort();
  if (!sameValue(names, ['manifest.json', ...bundle.files.map(file => file.name)].sort())) throw Error('Bundle contains missing or unlisted files');
  return bundle;
}

export function assertBundleSnapshot(bundle: SnapshotBundle, validated: Awaited<ReturnType<typeof validateSnapshotRecords>>) {
  if (!sameValue(validated.snapshot.manifest, bundle.snapshot) || validated.persistedGraphDigest !== bundle.persistedGraphDigest) {
    throw Error('Persisted snapshot identity or canonical digest mismatch');
  }
}

export async function readHostedSnapshot(input: string, bundle: SnapshotBundle) {
  const entry = bundle.files[0]!;
  async function* verifiedChunks() {
    const digest = createHash('sha256');
    let bytes = 0;
    for await (const chunk of boundedChunks(join(input, entry.name), entry.bytes)) {
      digest.update(chunk);
      bytes += chunk.length;
      yield chunk;
    }
    if (bytes !== entry.bytes || digest.digest('hex') !== entry.sha256) throw Error('Bundle payload integrity mismatch');
  }
  const snapshot = await parseJsonChunks<GraphSnapshot>(verifiedChunks());
  assertBundleSnapshot(bundle, await validateSnapshotRecords(snapshot, {}));
  return snapshot;
}
