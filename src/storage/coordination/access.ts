import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { safeTransferPath } from '../transfer-files.js';
import { coordinationLayout, createMarker, withCleanup, type CoordinationLayout, type OwnedMarker } from './markers.js';

export interface CacheAccessOptions { timeoutMs?: number; signal?: AbortSignal }
export class CacheCoordinationBlocked extends Error {
  readonly code = 'CACHE_COORDINATION_BLOCKED';
  constructor(readonly phase: 'admission' | 'drain') {
    super(`Cache coordination blocked during ${phase}; another operation or an interrupted owner remains. No lock was stolen. Inspect and quiesce all clients before recovery.`);
  }
}
function waiter(options: CacheAccessOptions) {
  const timeout = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) throw Error('Cache coordination timeout must be 1–300000 milliseconds');
  const deadline = performance.now() + timeout;
  return { check() { options.signal?.throwIfAborted(); }, async pause(phase: 'admission' | 'drain') {
    options.signal?.throwIfAborted();
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new CacheCoordinationBlocked(phase);
    await delay(Math.min(25, remaining), undefined, { signal: options.signal });
  } };
}
async function acquireGate(layout: CoordinationLayout, wait: ReturnType<typeof waiter>, mode: string) {
  for (;;) {
    wait.check();
    try { return await createMarker(layout, layout.gate, mode); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Reject links/nonordinary objects; a valid but stale marker still blocks.
      await safeTransferPath(layout.gate, false, true);
      await wait.pause('admission');
    }
  }
}

/** Shared activity covers readers AND writers; only exclusive maintenance excludes both. Not reentrant. */
export async function withCacheAccess<T>(root: string, run: () => Promise<T>, options: CacheAccessOptions = {}): Promise<T> {
  const wait = waiter(options); wait.check();
  const layout = await coordinationLayout(resolve(root));
  const gate = await acquireGate(layout, wait, 'admission');
  let participant: OwnedMarker | undefined;
  try {
    await withCleanup(async () => {
      wait.check();
      participant = await createMarker(layout, join(layout.participants, `${randomUUID()}.json`), 'activity');
    }, () => gate.release());
  } catch (error) {
    if (participant) return withCleanup(async () => { throw error; }, () => participant!.release());
    throw error;
  }
  return withCleanup(async () => { wait.check(); await layout.verify(); return run(); }, () => participant!.release());
}

/** Internal maintenance boundary, not a collector or a deletion authorization. */
export async function withCacheMaintenance<T>(root: string, run: () => Promise<T>, options: CacheAccessOptions = {}): Promise<T> {
  const wait = waiter(options); wait.check();
  const layout = await coordinationLayout(resolve(root));
  const gate = await acquireGate(layout, wait, 'maintenance');
  return withCleanup(async () => {
    for (;;) {
      wait.check(); await layout.verify();
      if ((await readdir(layout.participants)).length === 0) break;
      // Keep admission closed while existing users drain; new users cannot starve maintenance.
      await wait.pause('drain');
    }
    wait.check(); return run();
  }, () => gate.release());
}
