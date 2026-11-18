import { randomUUID } from 'node:crypto';
import { lstat, open, opendir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import { safeTransferPath } from '../transfer-files.js';
import { withCacheMaintenance } from './access.js';

const descriptorName = '.weftlet-coordination/root.json';
export interface ManagedCacheRoot { schemaVersion: 1; protocol: 'cache-coordination-v1'; rootId: string }
async function descriptor(root: string): Promise<ManagedCacheRoot | undefined> {
  const path = join(root, descriptorName);
  try { await lstat(path); }
  catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return; throw error; }
  await safeTransferPath(path);
  const input = await open(path, 'r');
  let value: unknown;
  try {
    const buffer = Buffer.alloc(4097), { bytesRead } = await input.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 4096) throw Error('Managed cache descriptor exceeds its byte limit');
    value = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally { await input.close(); }
  const v = value as Partial<ManagedCacheRoot> | null;
  if (!v || v.schemaVersion !== 1 || v.protocol !== 'cache-coordination-v1' ||
      typeof v.rootId !== 'string' || !/^[a-f0-9-]{36}$/.test(v.rootId) || Object.keys(v).sort().join(',') !== 'protocol,rootId,schemaVersion') {
    throw Error('Invalid or unsupported managed cache descriptor; no uncoordinated fallback');
  }
  return v as ManagedCacheRoot;
}
/** Discovery reads only; an unmarked/read-only cache creates no control files. */
async function lexicalOwner(path: string): Promise<string | undefined> {
  let current = resolve(path), owner: string | undefined;
  for (;;) {
    if (await descriptor(current)) {
      if (owner) throw Error('Overlapping managed cache roots are unsupported; quiesce clients and resolve ownership');
      owner = current;
    }
    const parent = dirname(current); if (parent === current) return owner; current = parent;
  }
}
/** Resolve existing prefixes too: an external alias to a managed descendant must not bypass admission. */
async function physicalPath(path: string) {
  let current = resolve(path); const missing: string[] = [];
  for (;;) {
    try { return resolve(await realpath(current), ...missing); }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      const parent = dirname(current); if (parent === current) throw error;
      missing.unshift(current.slice(parent.length).replace(/^[\\/]+/, '')); current = parent;
    }
  }
}
export async function managedRootForPath(path: string): Promise<string | undefined> {
  const physical = await physicalPath(path), owner = await lexicalOwner(physical);
  if (physical !== resolve(path)) {
    const lexical = await lexicalOwner(path);
    if (lexical && await realpath(lexical) !== owner) throw Error('Managed cache path escapes its owner through an alias');
  }
  return owner;
}
export async function managedRootsForPaths(paths: readonly string[]) {
  return [...new Set((await Promise.all(paths.map(managedRootForPath))).filter((root): root is string => root !== undefined))].sort();
}
/** Activation scans directory metadata only, never follows links, and refuses incomplete scans. */
async function rejectManagedDescendants(root: string) {
  const pending = [root]; let visited = 0;
  while (pending.length) {
    const directory = pending.pop()!;
    await safeTransferPath(directory, true);
    if (directory !== root && await descriptor(directory)) throw Error('A descendant already owns cache coordination');
    const entries = await opendir(directory);
    for await (const entry of entries) {
      if (++visited > 100_000) throw Error('Cache activation metadata scan exceeded 100000 entries; choose smaller non-overlapping roots');
      if (entry.isSymbolicLink()) throw Error('Cache activation requires an ordinary directory tree without symbolic links or junctions');
      if (entry.isDirectory()) pending.push(join(directory, entry.name));
    }
  }
}
/** Explicit migration boundary. This acknowledgement cannot detect legacy/uncooperative processes. */
export async function enableCacheCoordination(root: string, options: { acknowledgeQuiescence: boolean }) {
  if (options.acknowledgeQuiescence !== true) throw Error('Stop all clients using this cache, including older versions, and explicitly acknowledge quiescence');
  root = resolve(root);
  if (root === parse(root).root) throw Error('Select a dedicated cache directory, not a filesystem root');
  await safeTransferPath(root, true);
  root = await realpath(root);
  const owner = await managedRootForPath(root);
  if (owner && owner !== root) throw Error('An ancestor already owns cache coordination');
  await rejectManagedDescendants(root);
  return withCacheMaintenance(root, async () => {
    const existing = await descriptor(root);
    if (existing) return { root, rootId: existing.rootId, changed: false, pruningEnabled: false };
    const value: ManagedCacheRoot = { schemaVersion: 1, protocol: 'cache-coordination-v1', rootId: randomUUID() };
    await writeFile(join(root, descriptorName), `${JSON.stringify(value)}\n`, { flag: 'wx', mode: 0o600 });
    return { root, rootId: value.rootId, changed: true, pruningEnabled: false };
  });
}
