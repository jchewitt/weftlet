// A single inode is the publication unit for both JSON and compact snapshots.
import { createHash } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';
import { promisify } from 'node:util';
import { brotliCompress, brotliDecompress, constants } from 'node:zlib';

const compress = promisify(brotliCompress);
const decompress = promisify(brotliDecompress);
const magic = Buffer.from('WEFTBR1\n');
const headerSize = magic.length + 8 + 32 + 32;
const blockSize = 1024 ** 2;
const invalid = () => new SyntaxError('Invalid compact snapshot');
export function compactWritesEnabled() {
  const format = process.env.WEFTLET_SNAPSHOT_FORMAT ?? 'json';
  if (format !== 'json' && format !== 'brotli-v1') throw Error('WEFTLET_SNAPSHOT_FORMAT must be json or brotli-v1');
  return format === 'brotli-v1';
}
async function writeAll(handle: FileHandle, bytes: Buffer, position: number) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, position + offset);
    if (!bytesWritten) throw Error('Could not write compact snapshot');
    offset += bytesWritten;
  }
}
async function readBlock(handle: FileHandle, position: number, length: number) {
  const bytes = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    const read = await handle.read(bytes, offset, length - offset, position + offset);
    if (!read.bytesRead) break;
    offset += read.bytesRead;
  }
  return bytes.subarray(0, offset);
}

export async function writeCompactSnapshot(path: string, chunks: Iterable<string | Buffer> | AsyncIterable<Buffer>) {
  const file = await open(path, 'wx', 0o600);
  try {
    const plainHash = createHash('sha256'), encodedHash = createHash('sha256');
    const block = Buffer.allocUnsafe(blockSize);
    let used = 0, logicalBytes = 0, position = headerSize;
    const flush = async () => {
      const data = block.subarray(0, used);
      const encoded = await compress(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } });
      const frame = Buffer.allocUnsafe(4);
      frame.writeUInt32BE(encoded.length);
      encodedHash.update(frame).update(encoded);
      plainHash.update(data);
      await writeAll(file, frame, position);
      await writeAll(file, encoded, position + frame.length);
      position += frame.length + encoded.length;
      logicalBytes += used;
      used = 0;
    };
    for await (const chunk of chunks) {
      const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      for (let offset = 0; offset < data.length;) {
        const n = data.copy(block, used, offset);
        used += n;
        offset += n;
        if (used === blockSize) await flush();
      }
    }
    if (used) await flush();
    const header = Buffer.alloc(headerSize);
    magic.copy(header);
    header.writeBigUInt64BE(BigInt(logicalBytes), magic.length);
    plainHash.digest().copy(header, 16);
    encodedHash.digest().copy(header, 48);
    await writeAll(file, header, 0);
  } finally { await file.close(); }
}

export async function snapshotHeader(handle: FileHandle) {
  const header = await readBlock(handle, 0, headerSize);
  if (!header.subarray(0, magic.length).equals(magic)) return undefined;
  if (header.length !== headerSize) throw invalid();
  const logicalBytes = Number(header.readBigUInt64BE(8));
  if (!Number.isSafeInteger(logicalBytes) || logicalBytes <= 0) throw invalid();
  return { bytes: header, logicalBytes };
}
export async function* snapshotChunks(handle: FileHandle, maxBytes = Number.MAX_SAFE_INTEGER,
  physical?: (chunk: Buffer) => void, preview = false) {
  const header = await snapshotHeader(handle);
  let position = 0;
  if (!header) {
    for (;;) {
      const chunk = await readBlock(handle, position, 65536);
      if (!chunk.length) return;
      position += chunk.length;
      if (position > maxBytes) throw RangeError('Snapshot byte limit exceeded');
      physical?.(chunk);
      yield chunk;
    }
  }
  if (!preview && header.logicalBytes > maxBytes) throw RangeError('Snapshot byte limit exceeded');
  physical?.(header.bytes);
  position = headerSize;
  const plainHash = createHash('sha256'), encodedHash = createHash('sha256');
  let remaining = header.logicalBytes;
  while (remaining) {
    const frame = await readBlock(handle, position, 4);
    if (frame.length !== 4) throw invalid();
    const length = frame.readUInt32BE();
    if (!length || length > blockSize + 4096) throw invalid();
    const encoded = await readBlock(handle, position + 4, length);
    if (encoded.length !== length) throw invalid();
    position += 4 + length;
    physical?.(frame); physical?.(encoded);
    encodedHash.update(frame).update(encoded);
    const expected = Math.min(blockSize, remaining);
    let decoded: Buffer;
    try { decoded = await decompress(encoded, { maxOutputLength: expected }); }
    catch { throw invalid(); }
    if (decoded.length !== expected) throw invalid();
    remaining -= decoded.length;
    plainHash.update(decoded);
    yield decoded;
  }
  if ((await readBlock(handle, position, 1)).length || !plainHash.digest().equals(header.bytes.subarray(16, 48)) ||
      !encodedHash.digest().equals(header.bytes.subarray(48))) throw invalid();
}
export async function* storedSnapshotChunks(path: string) {
  const handle = await open(path, 'r');
  try { yield* snapshotChunks(handle); } finally { await handle.close(); }
}
