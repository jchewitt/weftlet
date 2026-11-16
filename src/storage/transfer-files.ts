import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, open, statfs } from 'node:fs/promises';
import { join, parse, relative, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Transfer boundaries reject symlinks/junctions, including ancestors, rather than following them. */
export async function safeTransferPath(path: string, directory = false, allowMissing = false) {
  const target = resolve(path), base = parse(target).root;
  const parts = relative(base, target).split(/[\\/]/).filter(Boolean);
  let current = base;
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]!);
    let info;
    try { info = await lstat(current); }
    catch (error) { if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    if (info.isSymbolicLink()) throw Error('Snapshot transfer refuses symbolic links or junctions');
    const isDirectory = index < parts.length - 1 || directory;
    if (isDirectory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) throw Error('Snapshot transfer requires ordinary directories and unshared regular files');
  }
}
export async function transferDirectory(path: string) {
  await safeTransferPath(path, true, true);
  await mkdir(path, { recursive: true });
  await safeTransferPath(path, true);
}
export async function requireFreeSpace(directory: string, bytes: number, floor = 256 * 1024 * 1024) {
  const disk = await statfs(directory);
  if (disk.bavail * disk.bsize < bytes + floor) throw Error('Snapshot transfer would violate the free-disk safety floor');
}
export async function fileDigest(path: string, maxBytes: number) {
  await safeTransferPath(path);
  const digest = createHash('sha256'); let bytes = 0;
  for await (const data of createReadStream(path)) {
    bytes += (data as Buffer).length;
    if (bytes > maxBytes) throw Error('Snapshot transfer byte limit exceeded');
    digest.update(data as Buffer);
  }
  return { bytes, sha256: digest.digest('hex') };
}
/** Copy and hash bounded chunks; never create a whole-snapshot string or overwrite a destination. */
export async function copyTransferFile(source: string, destination: string, maxBytes: number, signal?: AbortSignal) {
  await safeTransferPath(source); await safeTransferPath(destination, false, true);
  const input = await open(source, 'r');
  try {
    const [opened, named] = await Promise.all([input.stat(), lstat(source)]);
    if (!opened.isFile() || opened.ino !== named.ino || opened.dev !== named.dev || named.isSymbolicLink() || opened.size > maxBytes) throw Error('Transfer source changed or exceeds the byte limit');
    const digest = createHash('sha256'); let bytes = 0;
    const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) { callback(Error('Snapshot transfer byte limit exceeded')); return; }
      digest.update(chunk); callback(null, chunk);
    } });
    await pipeline(input.createReadStream({ autoClose: false }), meter, createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal });
    const after = await input.stat();
    if (after.size !== opened.size || bytes !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw Error('Transfer source changed during copying');
    return { bytes, sha256: digest.digest('hex') };
  } finally { await input.close(); }
}
