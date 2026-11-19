import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { constants, createBrotliCompress, createBrotliDecompress, createGzip, createGunzip } from 'node:zlib';
import { inspectFileDigest } from '../../src/storage/inspection/read.js';

const codecs = [
  { name: 'gzip-6', encode: () => createGzip({ level: 6 }), decode: createGunzip },
  { name: 'brotli-4', encode: () => createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }), decode: createBrotliDecompress },
];

/** Measure identical persisted bytes. Stream the decoded output directly into a hash. */
export async function compareSnapshotCodecs(path: string) {
  const source = await inspectFileDigest(path, 8 * 1024 ** 3);
  const scratch = await mkdtemp(join(tmpdir(), 'weftlet-codec-'));
  try {
    const results = [];
    for (const codec of codecs) {
      const compressed = join(scratch, codec.name);
      const start = performance.now();
      await pipeline(createReadStream(path), codec.encode(), createWriteStream(compressed, { flags: 'wx' }));
      const encodeMs = Math.round(performance.now() - start);
      const compressedBytes = (await stat(compressed)).size;
      const hash = createHash('sha256');
      let decodedBytes = 0;
      const decodeStart = performance.now();
      await pipeline(createReadStream(compressed), codec.decode(), new Writable({
        write(chunk: Buffer, _encoding, done) {
          decodedBytes += chunk.length;
          hash.update(chunk);
          done();
        },
      }));
      const decodeMs = Math.round(performance.now() - decodeStart);
      assert.equal(decodedBytes, source.bytes);
      assert.equal(hash.digest('hex'), source.sha256);
      results.push({ codec: codec.name, compressedBytes, encodeMs, decodeMs, decodedBytes, exactSha256Verified: true });
      await rm(compressed);
    }
    return { sourceBytes: source.bytes, sourceSha256: source.sha256, results };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
