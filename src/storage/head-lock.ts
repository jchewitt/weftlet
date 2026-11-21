import { open, rm } from 'node:fs/promises';
import { platform } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

/** Cooperating writers serialize CAS and ordinary head replacement; crash locks are never stolen. */
export async function withHeadLock<T>(path: string, run: () => Promise<T>): Promise<T> {
  let lock;
  for (let attempt = 0; ; attempt++) {
    try { lock = await open(path, 'wx', 0o600); break; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        if (attempt >= 200) throw Error('Snapshot head is locked; confirm the previous writer stopped before removing its lock');
      } else {
        // NTFS can report access denied during another writer's close/unlink window.
        // Retry the exclusive create itself. Only a successful creator can release the lock.
        if (platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || attempt >= 200) throw error;
      }
      await delay(50);
    }
  }
  try { await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); return await run(); }
  finally { await lock.close(); await rm(path); }
}
