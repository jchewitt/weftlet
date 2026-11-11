import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { atomicRename } from '../../storage/atomic-rename.js';

export const contentDigest = (content: string) => createHash('sha256').update(content).digest('hex');
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

/** Inspect each in-project path component without following directory/file links. */
export async function inspectSetupPath(root: string, path: string): Promise<string | null> {
  const target = resolve(root, path), local = relative(root, target);
  if (!local || isAbsolute(local) || local.split(/[\\/]/).includes('..')) throw Error('Setup path must be inside the project');
  const parts = local.split(/[\\/]/);
  let current = root;
  for (let index = -1; index < parts.length; index++) {
    if (index >= 0) current = join(current, parts[index]!);
    let info;
    try { info = await lstat(current); } catch (error) { if (missing(error)) return null; throw error; }
    if (info.isSymbolicLink()) throw Error(`Setup refuses a symbolic link or junction: ${current}`);
    if (index < parts.length - 1) {
      if (!info.isDirectory()) throw Error(`Setup parent must be a directory: ${current}`);
    } else {
      if (!info.isFile() || info.nlink !== 1 || info.size > 262_144) throw Error(`Setup requires a regular, unshared file of at most 256 KiB: ${current}`);
      return readFile(current, 'utf8');
    }
  }
  return null;
}

export interface SetupFileChange {
  path: string;
  before: string | null;
  after: string;
}

/** A project lock coordinates toolkit writers; each file is rechecked before replacement. */
export async function applySetupFiles(root: string, changes: readonly SetupFileChange[]): Promise<void> {
  await inspectSetupPath(root, '.weftlet-setup.lock');
  await mkdir(root, { recursive: true });
  const lockPath = join(root, '.weftlet-setup.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw Error('Another setup owns .weftlet-setup.lock. If interrupted, confirm it has stopped before removing that lock and replanning.');
    throw error;
  }
  const recheck = async (change: SetupFileChange) => {
    if (await inspectSetupPath(root, change.path) !== change.before) throw Error(`Setup plan is stale for ${change.path}; preview again.`);
  };
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    // Detect conflicts across the whole selection before modifying any skill.
    for (const change of changes) await recheck(change);
    for (const change of changes) {
      if (change.before === change.after) continue;
      const target = join(root, change.path);
      await mkdir(dirname(target), { recursive: true });
      await recheck(change);
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        // Client settings may already contain credentials; replacement must not widen permissions.
        const mode = change.before === null ? 0o600 : (await lstat(target)).mode & 0o777;
        await writeFile(temporary, change.after, { flag: 'wx', mode });
        await recheck(change);
        // Hard-link publication creates a complete file and fails if another writer won.
        if (change.before === null) await link(temporary, target);
        else await atomicRename(temporary, target);
      } finally { await rm(temporary, { force: true }); }
    }
  } finally {
    await lock.close();
    await rm(lockPath);
  }
}
