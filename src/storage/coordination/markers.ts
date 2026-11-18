import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { safeTransferPath, transferDirectory } from '../transfer-files.js';

/** Persistent control directories are never scavenged by this protocol. */
export async function coordinationLayout(root: string) {
  const control = join(root, '.weftlet-coordination'), participants = join(control, 'participants');
  await transferDirectory(participants);
  const directories = await Promise.all([root, control, participants].map(async path => ({ path, info: await lstat(path) })));
  return { control, participants, gate: join(control, 'gate.lock'), async verify() {
    for (const { path, info } of directories) {
      await safeTransferPath(path, true);
      const current = await lstat(path);
      if (current.dev !== info.dev || current.ino !== info.ino) throw Error('Cache coordination directory changed; refusing ownership-sensitive action');
    }
  } };
}
export type CoordinationLayout = Awaited<ReturnType<typeof coordinationLayout>>;

/** Exclusive creation; release checks the exact owned file, never a PID or its age. */
export async function createMarker(layout: CoordinationLayout, path: string, mode: string) {
  await layout.verify();
  const handle = await open(path, 'wx', 0o600);
  const bytes = JSON.stringify({ schemaVersion: 1, protocol: 'cache-coordination-v1', operationId: randomUUID(),
    mode, pid: process.pid, startedAt: new Date().toISOString() });
  let identity;
  try { identity = await handle.stat(); await handle.writeFile(bytes); }
  catch (error) { await handle.close(); throw error; } // Incomplete markers block; never guess ownership after failed initialization.
  let closed = false;
  return { async release() {
    if (closed) throw Error('Cache coordination marker already released');
    closed = true;
    try {
      await layout.verify(); await safeTransferPath(path);
      const named = await lstat(path);
      if (named.dev !== identity.dev || named.ino !== identity.ino || named.size !== Buffer.byteLength(bytes) || await readFile(path, 'utf8') !== bytes) {
        throw Error('Cache coordination marker changed; refusing to remove it');
      }
    } finally { await handle.close(); }
    // Cooperating processes never replace markers. Closed first for native Windows unlink.
    await unlink(path);
  } };
}
export type OwnedMarker = Awaited<ReturnType<typeof createMarker>>;

/** Preserve both failures when the operation and ownership-sensitive cleanup fail. */
export async function withCleanup<T>(run: () => Promise<T>, cleanup: () => Promise<void>): Promise<T> {
  let value: T;
  try { value = await run(); }
  catch (error) {
    try { await cleanup(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Cache operation and coordination cleanup failed'); }
    throw error;
  }
  await cleanup(); return value;
}
