import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { withCacheAccess, withCacheMaintenance } from '../src/storage/coordination/access.js';
import { planRetention } from '../src/storage/retention/plan.js';
import { emptyRetentionPolicy } from '../src/storage/retention/policy.js';

const roots: string[] = [], children: { child: ChildProcess; closed: Promise<unknown> }[] = [];
afterEach(async () => {
  for (const { child } of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await Promise.allSettled(children.splice(0).map(c => c.closed));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});
async function root() { const value = await mkdtemp(join(tmpdir(), 'weftlet-coordination-')); roots.push(value); return value; }
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const gate = (root: string) => join(root, '.weftlet-coordination/gate.lock');
const participants = (root: string) => join(root, '.weftlet-coordination/participants');
function processAccess(root: string, mode: 'shared' | 'exclusive') {
  const module = new URL('../src/storage/coordination/access.ts', import.meta.url).href;
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  const script = `
    import { withCacheAccess, withCacheMaintenance } from ${JSON.stringify(module)};
    const release = new Promise(resolve => process.once('message', resolve));
    try {
      await (${mode === 'shared' ? 'withCacheAccess' : 'withCacheMaintenance'})(${JSON.stringify(root)}, async () => {
        process.send('entered'); await release;
      }, { timeoutMs: 20000 });
      process.send('released'); process.disconnect();
    } catch (error) { process.send({error: String(error)}); process.disconnect(); process.exitCode = 1; }
  `;
  const child = spawn(process.execPath, ['--import', tsx, '--input-type=module', '--eval', script], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
  });
  const events: unknown[] = []; let errors = '';
  child.on('message', message => events.push(message));
  child.stderr!.on('data', data => { errors += String(data); });
  const closed = new Promise<number | null>((resolve, reject) => { child.once('close', resolve); child.once('error', reject); });
  children.push({ child, closed });
  return { child, closed, events, release: () => child.send('release'), async entered() {
    await expect.poll(() => { if (events.some(v => typeof v === 'object')) throw Error(JSON.stringify(events));
      if (child.exitCode !== null) throw Error(`Child exited: ${errors}`); return events.includes('entered'); }, { timeout: 15000 }).toBe(true);
  } };
}

it('admits concurrent processes, drains them before maintenance and blocks newcomers until exclusive work finishes', async () => {
  const cache = await root(); await writeFile(join(cache, 'evidence'), 'unchanged bytes');
  const first = processAccess(cache, 'shared'), second = processAccess(cache, 'shared');
  await Promise.all([first.entered(), second.entered()]);
  expect(await readdir(participants(cache))).toHaveLength(2);
  const exclusive = processAccess(cache, 'exclusive');
  await expect.poll(async () => JSON.parse(await readFile(gate(cache), 'utf8').catch(() => '{}')).mode, { timeout: 15000 }).toBe('maintenance');
  expect(exclusive.events).not.toContain('entered');
  await expect(withCacheAccess(cache, async () => { throw Error('must not enter'); }, { timeoutMs: 100 })).rejects.toMatchObject({ code: 'CACHE_COORDINATION_BLOCKED', phase: 'admission' });
  first.release(); second.release();
  expect(await first.closed).toBe(0); expect(await second.closed).toBe(0);
  await exclusive.entered();
  await expect(withCacheAccess(cache, async () => undefined, { timeoutMs: 100 })).rejects.toMatchObject({ phase: 'admission' });
  exclusive.release(); expect(await exclusive.closed).toBe(0);
  await withCacheAccess(cache, async () => expect(await readFile(join(cache, 'evidence'), 'utf8')).toBe('unchanged bytes'));
  expect(await readdir(participants(cache))).toEqual([]);
  await expect(readFile(gate(cache))).rejects.toMatchObject({ code: 'ENOENT' });
}, 60000);

it('leaves crashed participant and maintenance markers intact instead of stealing them by PID or age', async () => {
  const cache = await root(), reader = processAccess(cache, 'shared'); await reader.entered();
  const [name] = await readdir(participants(cache)); const path = join(participants(cache), name!);
  const before = await readFile(path);
  reader.child.kill('SIGKILL'); await reader.closed;
  await expect(withCacheMaintenance(cache, async () => undefined, { timeoutMs: 100 })).rejects.toMatchObject({ phase: 'drain' });
  expect(await readFile(path)).toEqual(before);
  // Shared access remains possible; the abandoned participant only blocks maintenance.
  await withCacheAccess(cache, async () => undefined);
  const other = await root(), owner = processAccess(other, 'exclusive'); await owner.entered();
  const gateBytes = await readFile(gate(other)); owner.child.kill('SIGKILL'); await owner.closed;
  await expect(withCacheAccess(other, async () => undefined, { timeoutMs: 100 })).rejects.toMatchObject({ phase: 'admission' });
  expect(await readFile(gate(other))).toEqual(gateBytes);
}, 60000);

it('cancels waiting maintenance without removing active participants and cleans up failed operations', async () => {
  const cache = await root(), entered = deferred(), release = deferred();
  const reader = withCacheAccess(cache, async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const controller = new AbortController();
  const maintenance = withCacheMaintenance(cache, async () => { throw Error('must not enter'); }, { signal: controller.signal });
  const failure = expect(maintenance).rejects.toThrow();
  await expect.poll(async () => JSON.parse(await readFile(gate(cache), 'utf8').catch(() => '{}')).mode).toBe('maintenance');
  controller.abort(); await failure;
  expect(await readdir(participants(cache))).toHaveLength(1);
  release.resolve(); await reader;
  await expect(withCacheMaintenance(cache, async () => { throw Error('operation failure'); })).rejects.toThrow('operation failure');
  await expect(withCacheAccess(cache, async () => { throw Error('read failure'); })).rejects.toThrow('read failure');
  await withCacheMaintenance(cache, async () => undefined);
  expect(await readdir(participants(cache))).toEqual([]);
  const aborted = new AbortController(); aborted.abort(); const unused = await root();
  await expect(withCacheAccess(unused, async () => undefined, { signal: aborted.signal })).rejects.toThrow();
  expect(await readdir(unused)).toEqual([]);
});

it('refuses linked control directories and preserves changed markers with both operation and cleanup errors', async () => {
  const cache = await root(), outside = await root();
  await symlink(outside, join(cache, '.weftlet-coordination'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(withCacheAccess(cache, async () => undefined)).rejects.toThrow('symbolic links or junctions');
  expect(await readdir(outside)).toEqual([]);
  const other = await root();
  const failure = await withCacheMaintenance(other, async () => {
    await writeFile(gate(other), '{"different":"owner"}'); throw Error('original failure');
  }).catch(error => error);
  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure.errors.map((e: Error) => e.message)).toEqual(['original failure', 'Cache coordination marker changed; refusing to remove it']);
  expect(await readFile(gate(other), 'utf8')).toBe('{"different":"owner"}');
});

it('reports coordination markers as blocking activity in retention reviews without treating empty control directories as active', async () => {
  const cache = await root(), policy = emptyRetentionPolicy();
  await withCacheAccess(cache, async () => {
    const plan = await planRetention({ root: cache, policy });
    expect(plan.readyForReview).toBe(false);
    expect(plan.issues.some(issue => issue.code === 'activity-requires-coordination')).toBe(true);
    expect(plan.objects.some(object => object.category === 'lease-marker')).toBe(true);
  });
  expect((await planRetention({ root: cache, policy })).readyForReview).toBe(true);
});

it('refuses swapped control roots without touching the replacement; Windows instead protects the open marker directory', async () => {
  const cache = await root(), outside = await root();
  const control = join(cache, '.weftlet-coordination');
  const run = () => withCacheMaintenance(cache, async () => {
    if (process.platform === 'win32') {
      await expect(rename(control, `${control}-old`)).rejects.toMatchObject({ code: 'EPERM' });
    } else {
      await rename(control, `${control}-old`);
      await symlink(outside, control, 'dir');
    }
  });
  if (process.platform === 'win32') await run();
  else await expect(run()).rejects.toThrow('symbolic links or junctions');
  expect(await readdir(outside)).toEqual([]);
});

it('isolates different roots and validates bounded waiting without treating unknown participant records as disposable', async () => {
  const first = await root(), second = await root();
  for (const timeoutMs of [0, -1, 1.5, NaN, Infinity, 300001]) {
    await expect(withCacheAccess(first, async () => undefined, { timeoutMs })).rejects.toThrow('timeout');
  }
  expect(await readdir(first)).toEqual([]);
  await withCacheMaintenance(first, () => withCacheMaintenance(second, async () => undefined));
  await writeFile(join(participants(first), 'unknown'), 'not a protocol record');
  await expect(withCacheMaintenance(first, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
  expect(await readFile(join(participants(first), 'unknown'), 'utf8')).toBe('not a protocol record');
});

it('keeps active shared and exclusive work protected after cancellation until the callback settles', async () => {
  for (const mode of ['shared', 'exclusive'] as const) {
    const cache = await root(), entered = deferred(), release = deferred(), controller = new AbortController();
    const access = mode === 'shared' ? withCacheAccess : withCacheMaintenance;
    let settled = false;
    const operation = access(cache, async () => {
      entered.resolve(); await release.promise;
    }, { signal: controller.signal });
    const result = operation.then(() => { settled = true; });
    await entered.promise; controller.abort();
    expect(settled).toBe(false);
    if (mode === 'shared') expect(await readdir(participants(cache))).toHaveLength(1);
    else expect(JSON.parse(await readFile(gate(cache), 'utf8')).mode).toBe('maintenance');
    await expect(withCacheMaintenance(cache, async () => { throw Error('must not enter'); }, { timeoutMs: 75 }))
      .rejects.toMatchObject({ phase: mode === 'shared' ? 'drain' : 'admission' });
    release.resolve(); await result;
    await withCacheMaintenance(cache, async () => undefined);
    expect(await readdir(participants(cache))).toEqual([]);
    await expect(readFile(gate(cache))).rejects.toMatchObject({ code: 'ENOENT' });
  }
});
