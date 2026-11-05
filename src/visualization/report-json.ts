import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { stringifyChunked } from '@discoveryjs/json-ext';

/** Bounded browser-readable shards, without constructing one graph-sized JSON string. */
export async function writeReportJson(directory: string, value: unknown, maximumBytes: number) {
  const temporary = join(directory, `${randomUUID()}.tmp`), hash = createHash('sha256');
  let bytes = 0;
  const measure = new Transform({ transform(chunk: Buffer, _encoding, next) {
    bytes += chunk.length;
    if (bytes > maximumBytes) { next(new Error('Portable report byte budget exceeded; select a smaller scope')); return; }
    hash.update(chunk); next(null, chunk);
  } });
  try {
    await pipeline(stringifyChunked(value), measure, createWriteStream(temporary, { flags: 'wx' }));
    const name = `${hash.digest('hex')}.json`;
    await rename(temporary, join(directory, name));
    return { name, bytes };
  } catch (error) { await rm(temporary, { force: true }); throw error; }
}
