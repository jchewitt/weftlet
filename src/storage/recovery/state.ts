import { lstat, opendir, realpath } from 'node:fs/promises';
import { join, parse, resolve } from 'node:path';
import { sha256 } from '@weftlet/core';
import { withInspectionFile, inspectSmallJson } from '../inspection/read.js';
import { managedRootForPath, type ManagedCacheRoot } from '../coordination/managed-root.js';
import { safeTransferPath } from '../transfer-files.js';

export const controlName = '.weftlet-coordination';
export const barrierName = `${controlName}/recovery.block`;
export const barrierBytes = 'weftlet-offline-recovery-v1\n';
export const uuid = /^[a-f0-9-]{36}$/;
export const digest = /^[a-f0-9]{64}$/;
export interface ControlFile { path: string; revision: string; sha256: string; bytes: number }
export const revision = (s: import('node:fs').BigIntStats) => [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs, s.nlink].join(':');
export async function readControl(root: string, path: string, maxBytes = 32 * 1024 ** 2) {
  const absolute = join(root, path); await safeTransferPath(absolute);
  return withInspectionFile(absolute, maxBytes, async (handle, stat) => {
    const bytes = await handle.readFile();
    return { file: { path, revision: revision(stat), sha256: sha256(bytes), bytes: bytes.length }, bytes };
  });
}
export async function recoveryRoot(input: string) {
  await safeTransferPath(resolve(input), true);
  const root = await realpath(input);
  if (root === parse(root).root || await managedRootForPath(root) !== root) throw Error('Recovery requires the exact activated dedicated cache root');
  const owner = await inspectSmallJson(join(root, controlName, 'root.json'), 4096, true) as ManagedCacheRoot;
  const dirs = await Promise.all([root, join(root, controlName), join(root, controlName, 'participants')].map(async path => {
    await safeTransferPath(path, true); const info = await lstat(path); return { path, dev: info.dev, ino: info.ino };
  }));
  return { root, rootId: owner.rootId, async verify() {
    for (const dir of dirs) {
      await safeTransferPath(dir.path, true); const current = await lstat(dir.path);
      if (current.dev !== dir.dev || current.ino !== dir.ino) throw Error('Recovery directory identity changed');
    }
    if (await managedRootForPath(root) !== root || (await inspectSmallJson(join(root, controlName, 'root.json'), 4096, true) as ManagedCacheRoot).rootId !== owner.rootId) throw Error('Recovery root ownership changed');
  } };
}
/** Read-only, bounded control inventory. Unknown objects are preserved and block recovery. */
export async function controlFiles(root: string) {
  const paths: string[] = [], directories: { path: string; identity: string }[] = [];
  const pending = [controlName]; let count = 0, totalBytes = 0;
  while (pending.length) {
    const path = pending.pop()!; await safeTransferPath(join(root, path), true);
    const stat = await lstat(join(root, path), { bigint: true });
    directories.push({ path, identity: `${stat.dev}:${stat.ino}` });
    for await (const entry of await opendir(join(root, path))) {
      if (++count > 10_000) throw Error('Recovery control inventory exceeds 10000 entries');
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) pending.push(child);
      else {
        await safeTransferPath(join(root, child)); totalBytes += (await lstat(join(root, child))).size;
        if (totalBytes > 64 * 1024 ** 2) throw Error('Recovery control inventory exceeds 64 MiB; no recovery attempted');
        paths.push(child);
      }
    }
  }
  return { paths: paths.sort(), directories: directories.sort((a, b) => a.path.localeCompare(b.path, 'en')) };
}
/** A live or inaccessible PID is a veto, never an authorization based on an absent PID. */
export function ownerMayBeLive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
