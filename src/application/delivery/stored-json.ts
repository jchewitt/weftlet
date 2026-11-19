import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { snapshotChunks, snapshotHeader } from '../../storage/compact-snapshot.js';
import { withInspectionFile } from '../../storage/inspection/read.js';
import { requireFreeSpace, safeTransferPath } from '../../storage/transfer-files.js';
import { manifestByteLimit } from './contract.js';
import { dirname } from 'node:path';

/** Bundle checksums and limits refer to the exact decoded JSON byte stream. */
export async function storedJsonDigest(path: string, maxBytes: number, destination?: string, signal?: AbortSignal) {
  await safeTransferPath(path);
  return withInspectionFile(path, Number.MAX_SAFE_INTEGER, async (handle, info) => {
    const header = await snapshotHeader(handle);
    const length = header?.logicalBytes ?? Number(info.size);
    if (destination && length > maxBytes) throw Error('Snapshot exceeds transfer byte limit');
    if (!destination && length !== maxBytes) throw Error('Immutable evidence collision: existing byte length differs');
    if (destination) await requireFreeSpace(dirname(destination), length + manifestByteLimit);
    const hash = createHash('sha256');
    let bytes = 0;
    async function* measured() {
      for await (const chunk of snapshotChunks(handle, maxBytes)) {
        signal?.throwIfAborted();
        hash.update(chunk);
        bytes += chunk.length;
        yield chunk;
      }
    }
    const sink = destination ? createWriteStream(destination, { flags: 'wx', mode: 0o600 }) : new Writable({
      write(_chunk, _encoding, done) { done(); },
    });
    await pipeline(measured(), sink, { signal });
    return { bytes, sha256: hash.digest('hex') };
  });
}
