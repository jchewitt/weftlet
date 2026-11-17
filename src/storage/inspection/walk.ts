import type { BigIntStats } from 'node:fs';
import { lstat, opendir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { safeTransferPath } from '../transfer-files.js';
import { cacheLayout, type CacheObject } from './layout.js';

const key = (p: string) => process.platform === 'win32' ? p.toLowerCase() : p;
function within(parent: string, child: string) {
  const part = relative(key(parent), key(child));
  return part === '' || !isAbsolute(part) && part !== '..' && !part.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
}
export function inventoryRoots(roots: readonly string[]) {
  const sorted = [...new Set(roots.map(root => resolve(root)))].sort((a, b) => a.length - b.length || a.localeCompare(b, 'en'));
  return sorted.filter((root, index) => !sorted.slice(0, index).some(parent => within(parent, root)));
}
export async function walkCache(roots: readonly string[], maxEntries: number, signal?: AbortSignal) {
  const objects: CacheObject[] = [], issues: { root: string; path: string; code: string }[] = [];
  const missingRoots: string[] = [];
  let limited = false;
  async function visit(root: string, path: string, depth: number): Promise<void> {
    signal?.throwIfAborted();
    if (objects.length >= maxEntries || depth > 64) { limited = true; return; }
    const local = relative(root, path).replaceAll('\\', '/') || '.';
    let info;
    try { info = await lstat(path, { bigint: true }); }
    catch (error) { issues.push({ root, path: local, code: (error as NodeJS.ErrnoException).code ?? 'stat-failed' }); return; }
    if (info.size > BigInt(Number.MAX_SAFE_INTEGER)) { issues.push({ root, path: local, code: 'size-not-representable' }); return; }
    const kind = info.isSymbolicLink() ? 'link' : info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other';
    objects.push(entryMetadata(root, local, kind, info));
    if (kind !== 'directory') return;
    try {
      await safeTransferPath(path, true);
      const names: string[] = [];
      const directory = await opendir(path);
      for await (const entry of directory) {
        if (names.length + objects.length >= maxEntries) { limited = true; break; }
        names.push(entry.name);
      }
      for (const name of names.sort()) { if (objects.length >= maxEntries) { limited = true; break; } await visit(root, join(path, name), depth + 1); }
    } catch (error) { signal?.throwIfAborted(); issues.push({ root, path: local, code: (error as NodeJS.ErrnoException).code ?? 'directory-unreadable-or-linked' }); }
  }
  for (const root of roots) {
    try {
      await safeTransferPath(root, true, true);
      try { await lstat(root); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { missingRoots.push(root); continue; } throw error; }
      await visit(root, root, 0);
    } catch (error) { signal?.throwIfAborted(); issues.push({ root, path: '.', code: (error as NodeJS.ErrnoException).code ?? 'unsafe-root' }); }
  }
  return { objects, issues, missingRoots, limited };
}

function entryMetadata(root: string, local: string, kind: CacheObject['kind'], info: BigIntStats): CacheObject {
  return { root, path: local, ...cacheLayout(local), kind, logicalBytes: kind === 'directory' ? 0 : Number(info.size),
      allocatedBytes: process.platform !== 'win32' && info.blocks >= 0n && info.blocks <= BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 512)) ? Number(info.blocks) * 512 : null,
      physicalIdentity: info.ino ? `${info.dev}:${info.ino}` : undefined, modifiedAt: info.mtime.toISOString(),
      inspection: 'not-inspected', headReferences: [], protection: [kind === 'link' ? 'link-not-followed' : 'read-only-inventory-no-deletion-decision'],
      activity: 'unknown', pinState: 'not-evaluated', archiveState: 'not-evaluated' };
}
