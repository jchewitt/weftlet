import { constants } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { JSONParser } from '@streamparser/json';
import { parseUniqueJson } from '../../infrastructure/unique-json.js';
import { safeTransferPath } from '../transfer-files.js';

import { InspectionError } from './errors.js';
import { JsonBoundary, arraySections } from './json-boundary.js';
export { InspectionError } from './errors.js';

const same = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
  a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;

/** Read an ordinary file through one handle; fail if its identity/bytes change during the read. */
export async function withInspectionFile<T>(path: string, maxBytes: number,
  read: (handle: FileHandle, before: BigIntStats) => Promise<T>): Promise<T> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw Error('maxBytes must be a positive safe integer');
  await safeTransferPath(dirname(path), true); // Read-only inspection can account for hard links.
  const named = await lstat(path, { bigint: true });
  if (named.isSymbolicLink() || !named.isFile()) throw new InspectionError('unsafe', 'Inspection requires an ordinary file');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || !same(named, before)) throw new InspectionError('changed', 'File changed before inspection');
    if (before.size > BigInt(maxBytes)) throw new InspectionError('limit', 'Inspection byte limit exceeded');
    const result = await read(handle, before).catch(async error => {
      await assertUnchanged(handle, path, before);
      throw error;
    });
    await assertUnchanged(handle, path, before);
    return result;
  } finally { await handle.close(); }
}

async function assertUnchanged(handle: FileHandle, path: string, before: BigIntStats) {
  let opened, named;
  try { opened = await handle.stat({ bigint: true }); named = await lstat(path, { bigint: true }); }
  catch { throw new InspectionError('changed', 'File became unavailable during inspection'); }
  if (!same(before, opened) || !same(before, named)) throw new InspectionError('changed', 'File changed during inspection');
}

async function* fileChunks(handle: FileHandle) {
  let position = 0;
  for (;;) {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
    if (!bytesRead) return;
    position += bytesRead; yield buffer.subarray(0, bytesRead);
  }
}

export async function inspectSmallJson(path: string, maxBytes = 1024 * 1024, uniqueKeys = false) {
  return (await inspectSmallJsonRecord(path, maxBytes, uniqueKeys)).value;
}
export async function inspectSmallJsonRecord(path: string, maxBytes = 1024 * 1024, uniqueKeys = false) {
  return withInspectionFile(path, maxBytes, async handle => {
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of fileChunks(handle)) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new InspectionError('limit', 'Inspection byte limit exceeded');
      chunks.push(chunk);
    }
    try {
      const bytes = Buffer.concat(chunks);
      return { value: (uniqueKeys ? parseUniqueJson : JSON.parse)(bytes.toString('utf8')) as unknown, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
    catch (error) { if (error instanceof SyntaxError) throw new InspectionError('invalid-json', 'Invalid JSON document'); throw error; }
  });
}
export interface JsonInspectionOptions {
  maxBytes?: number;
  maxRecordBytes?: number;
  manifestOnly?: boolean;
  signal?: AbortSignal;
  onRecord?: (section: string, value: unknown) => void;
  onProgress?: (bytes: number, total: number) => void;
}
const stopManifest = Symbol('manifest inspected');
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Stream the complete JSON and retain at most a manifest or one evidence record at a time. */
export async function inspectJson(path: string, options: JsonInspectionOptions = {}) {
  const maxBytes = options.maxBytes ?? 8 * 1024 ** 3, maxRecord = options.maxRecordBytes ?? 16 * 1024 ** 2;
  if (!Number.isSafeInteger(maxRecord) || maxRecord < 1) throw Error('maxRecordBytes must be a positive safe integer');
  return withInspectionFile(path, options.manifestOnly ? Number.MAX_SAFE_INTEGER : maxBytes, async (handle, before) => {
    const parser = new JSONParser({ paths: ['$.manifest', ...[...arraySections].map(key => `$.${key}.*`)], keepStack: false });
    const hash = createHash('sha256');
    const boundary = new JsonBoundary(maxRecord);
    let manifest: Record<string, unknown> | undefined;
    let bytes = 0, complete = false;
    parser.onToken = ({ token, value, offset }) => boundary.token(token, value, offset, complete);
    parser.onValue = ({ value, key, stack }) => {
      if (Buffer.byteLength(JSON.stringify(value) ?? '') > maxRecord) throw new InspectionError('limit', 'JSON record limit exceeded');
      if (key === 'manifest' && stack.length === 1) {
        if (!record(value)) throw new InspectionError('invalid-json', 'Expected a snapshot manifest object');
        manifest = value;
        options.onRecord?.('manifest', value);
        if (options.manifestOnly) throw stopManifest;
      } else if (stack.length === 2) options.onRecord?.(String(stack[1]!.key), value);
    };
    parser.onError = error => { if ((error as unknown) === stopManifest) throw stopManifest; throw error instanceof InspectionError ? error : new InspectionError('invalid-json', 'Invalid or incomplete JSON document'); };
    parser.onEnd = () => { complete = true; };
    try {
      for await (const chunk of fileChunks(handle)) {
        options.signal?.throwIfAborted();
        bytes += chunk.length;
        if (bytes > maxBytes && !options.manifestOnly) throw new InspectionError('limit', 'Inspection byte limit exceeded');
        hash.update(chunk);
        parser.write(chunk);
        boundary.checkLength(bytes);
        if (options.manifestOnly && bytes > maxRecord) throw new InspectionError('limit', 'Manifest preview limit exceeded');
        options.onProgress?.(bytes, Number(before.size));
      }
      if (!parser.isEnded) parser.end();
      if (!complete) throw new InspectionError('invalid-json', 'Incomplete JSON document');
    } catch (error) {
      if (error !== stopManifest) throw error;
    }
    return { manifest, sections: Object.fromEntries(boundary.sections), bytesRead: bytes, bytes: Number(before.size),
      jsonComplete: complete, sha256: complete ? hash.digest('hex') : undefined };
  });
}

export async function inspectFileDigest(path: string, maxBytes: number, signal?: AbortSignal) {
  return withInspectionFile(path, maxBytes, async handle => {
    const hash = createHash('sha256'); let bytes = 0;
    for await (const chunk of fileChunks(handle)) {
      signal?.throwIfAborted(); bytes += chunk.length;
      if (bytes > maxBytes) throw new InspectionError('limit', 'Inspection byte limit exceeded');
      hash.update(chunk);
    }
    return { bytes, sha256: hash.digest('hex') };
  });
}
