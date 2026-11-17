import { open, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

/** Cooperating writers serialize CAS and ordinary head replacement; crash locks are never stolen. */
export async function withHeadLock<T>(path: string, run: () => Promise<T>): Promise<T> {
  let lock;
  for (let attempt = 0; ; attempt++) {
    try { lock = await open(path, 'wx', 0o600); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (attempt >= 200) throw Error('Snapshot head is locked; confirm the previous writer stopped before removing its lock');
      await delay(50);
    }
  }
  try { await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); return await run(); }
  finally { await lock.close(); await rm(path); }
}
