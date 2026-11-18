import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { enableCacheCoordination, managedRootForPath } from '../src/storage/coordination/managed-root.js';
import { withManagedCacheAccess } from '../src/storage/coordination/managed-access.js';
import { withCacheMaintenance } from '../src/storage/coordination/access.js';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { withSnapshotAccess } from '../src/storage/coordination/snapshot-access.js';

const roots: string[] = [];
const execute = promisify(execFile);
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
async function root() { const path = await mkdtemp(join(tmpdir(), 'weftlet-managed-')); roots.push(path); return path; }
const enable = (path: string) => enableCacheCoordination(path, { acknowledgeQuiescence: true });
const participants = (path: string) => readdir(join(path, '.weftlet-coordination/participants'));
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true, maxRetries: 5 }))); });

it('leaves unmarked reads untouched and requires explicit quiescence for idempotent activation', async () => {
  const cache = await root(), store = new FileSnapshotStore(cache);
  expect(await store.read('absent')).toBeUndefined();
  expect(await managedRootForPath(join(cache, 'not-created'))).toBeUndefined();
  await withManagedCacheAccess([cache], async () => expect(await store.file('absent')).toBeUndefined());
  expect(await readdir(cache)).toEqual([]);
  await expect(enableCacheCoordination(cache, { acknowledgeQuiescence: false })).rejects.toThrow('quiescence');
  expect(await readdir(cache)).toEqual([]);
  const first = await enable(cache), bytes = await readFile(join(cache, '.weftlet-coordination/root.json'));
  expect(first).toMatchObject({ changed: true, pruningEnabled: false });
  expect(await enable(cache)).toMatchObject({ changed: false, rootId: first.rootId });
  if (process.platform === 'win32') expect(await enable(cache.toUpperCase())).toMatchObject({ changed: false, rootId: first.rootId });
  expect(await managedRootForPath(join(cache, 'future', 'file.json'))).toBe(await realpath(cache));
  expect(await readFile(join(cache, '.weftlet-coordination/root.json'))).toEqual(bytes);
  await expect(store.file('absent')).rejects.toThrow('enclosing');
  expect(() => store.read('../escape')).toThrow('safe storage identifier');
  expect(() => store.file('../escape')).toThrow('safe storage identifier');
  await withSnapshotAccess(cache, async scoped => expect(await scoped.withFile('absent', async path => path)).toBeUndefined());
  expect(await participants(cache)).toEqual([]);
});

it('rejects overlapping ownership, malformed descriptors and linked activation trees without fallback', async () => {
  const parent = await root(), child = join(parent, 'child'); await mkdir(child); await enable(child);
  await expect(enable(parent)).rejects.toThrow('descendant');
  await expect(readFile(join(parent, '.weftlet-coordination/root.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  const other = await root(); await enable(other); const nested = join(other, 'child'); await mkdir(nested);
  await expect(enable(nested)).rejects.toThrow('ancestor');
  await mkdir(join(nested, '.weftlet-coordination'));
  await writeFile(join(nested, '.weftlet-coordination/root.json'), await readFile(join(other, '.weftlet-coordination/root.json')));
  await expect(managedRootForPath(nested)).rejects.toThrow('Overlapping');
  await writeFile(join(other, '.weftlet-coordination/root.json'), '{"schemaVersion":2}');
  await expect(new FileSnapshotStore(other).read('absent')).rejects.toThrow('unsupported');
  const linked = await root(), outside = await root();
  await symlink(outside, join(linked, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(enable(linked)).rejects.toThrow('symbolic links or junctions');
  expect(await readdir(outside)).toEqual([]);
});

it('holds every root, reuses nested admission and rejects undeclared roots', async () => {
  const a = await root(), b = await root(), c = await root(); await Promise.all([enable(a), enable(b), enable(c)]);
  await withManagedCacheAccess([b, a, join(a, 'nested')], async () => {
    expect(await participants(a)).toHaveLength(1); expect(await participants(b)).toHaveLength(1);
    await withManagedCacheAccess([a, b], async () => expect(await participants(a)).toHaveLength(1));
    await expect(withManagedCacheAccess([c], async () => undefined)).rejects.toThrow('undeclared');
    await expect(withCacheMaintenance(b, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
  });
  await withCacheMaintenance(a, async () => undefined);
  expect(await participants(a)).toEqual([]); expect(await participants(b)).toEqual([]);
});

it('drains started children after parent failure/return, permits their delayed reads and revokes escaped continuations', async () => {
  for (const fail of [false, true]) {
    const cache = await root(); await enable(cache);
    const entered = deferred(), release = deferred(), childRead = deferred(); let settled = false;
    let escaped!: () => Promise<unknown>;
    const operation = withManagedCacheAccess([cache], async () => {
      escaped = () => withManagedCacheAccess([cache], async () => undefined);
      // Capture the async context as a delayed task, not merely a reusable function.
      const escape = deferred();
      void escape.promise.then(() => new FileSnapshotStore(cache).read('absent')).then(childRead.resolve, error => {
        expect(error.message).toContain('scope has ended'); childRead.resolve();
      });
      escaped = async () => { escape.resolve(); await childRead.promise; };
      void withManagedCacheAccess([cache], async () => {
        entered.resolve(); await release.promise;
        expect(await new FileSnapshotStore(cache).read('absent')).toBeUndefined();
      });
      if (fail) throw Error('parent failed');
    });
    const result = operation.then(() => { settled = true; return 'ok'; }, error => { settled = true; return error.message; });
    await entered.promise;
    expect(settled).toBe(false);
    await expect(withCacheMaintenance(cache, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
    release.resolve(); expect(await result).toBe(fail ? 'parent failed' : 'ok');
    await escaped(); expect(await participants(cache)).toEqual([]);
  }
});

it('cancels multi-root admission and releases roots already acquired without stealing a gate', async () => {
  const paths = [await root(), await root()].sort(); await Promise.all(paths.map(enable));
  const entered = deferred(), release = deferred();
  const maintenance = withCacheMaintenance(paths[1]!, async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const controller = new AbortController();
  const operation = withManagedCacheAccess(paths, async () => { throw Error('must not enter'); }, { signal: controller.signal });
  const failure = expect(operation).rejects.toThrow();
  await expect.poll(() => participants(paths[0]!)).toHaveLength(1);
  controller.abort(); await failure;
  expect(await participants(paths[0]!)).toEqual([]);
  release.resolve(); await maintenance;
});

it('exposes explicit activation/status through the real CLI without needing a project config', async () => {
  const cache = await root(), cli = resolve('dist/cli.js');
  const run = (...args: string[]) => execute(process.execPath, [cli, 'cache', 'coordination', ...args], { cwd: cache });
  expect(JSON.parse((await run('status', '--root', cache)).stdout).managedRoot).toBeNull();
  expect(await readdir(cache)).toEqual([]);
  await expect(run('enable', '--root', cache)).rejects.toThrow('quiescence');
  expect(JSON.parse((await run('enable', '--root', cache, '--acknowledge-quiescence')).stdout)).toMatchObject({ changed: true, pruningEnabled: false });
  expect(JSON.parse((await run('status', '--root', cache)).stdout).managedRoot).toBe(await realpath(cache));
  await expect(run('enable', '--root', cache, '--acknowledge-quiescence', '--unexpected')).rejects.toThrow('Invalid');
});


it('protects external aliases into managed descendants and refuses aliases escaping a managed owner', async () => {
  const cache = await root(), external = await root(), profile = join(cache, 'profile');
  await mkdir(profile); await enable(cache);
  const alias = join(external, 'alias');
  await symlink(profile, alias, process.platform === 'win32' ? 'junction' : 'dir');
  expect(await managedRootForPath(join(alias, 'missing', 'snapshot.json'))).toBe(await realpath(cache));
  await withManagedCacheAccess([alias], async () => {
    expect(await participants(cache)).toHaveLength(1);
    await expect(withCacheMaintenance(cache, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
  });
  await expect(new FileSnapshotStore(alias).file('absent')).rejects.toThrow('enclosing');
  // A newly introduced escape must not silently move writes outside the declared managed root.
  const ordinary = await root();
  await symlink(ordinary, join(cache, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(managedRootForPath(join(cache, 'escape', 'new.json'))).rejects.toThrow('escapes');
  const unmarked = join(external, 'ordinary');
  await symlink(ordinary, unmarked, process.platform === 'win32' ? 'junction' : 'dir');
  expect(await new FileSnapshotStore(unmarked).read('absent')).toBeUndefined();
  expect(await readdir(ordinary)).toEqual([]);
});


it('coordinates separate processes declaring the same roots in opposite order', async () => {
  const a = await root(), b = await root(); await Promise.all([enable(a), enable(b)]);
  const module = new URL('../src/storage/coordination/managed-access.ts', import.meta.url).href;
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  const children = [[a, b], [b, a]].map(paths => {
    const code = `import { withManagedCacheAccess } from ${JSON.stringify(module)};
      const release = new Promise(resolve => process.once('message', resolve));
      try { await withManagedCacheAccess(${JSON.stringify(paths)}, async () => { process.send('entered'); await release; });
        process.disconnect(); } catch (error) { process.send(String(error)); process.disconnect(); process.exitCode = 1; }`;
    const child = spawn(process.execPath, ['--import', tsx, '--input-type=module', '--eval', code], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
    });
    const events: unknown[] = []; let stderr = '';
    child.on('message', value => events.push(value)); child.stderr.on('data', value => { stderr += String(value); });
    const closed = new Promise<number | null>((resolve, reject) => { child.once('close', resolve); child.once('error', reject); });
    return { child, events, closed, stderr: () => stderr };
  });
  try {
    await expect.poll(() => children.map(c => {
      if (c.child.exitCode !== null) throw Error(c.stderr() + JSON.stringify(c.events));
      return c.events.includes('entered');
    }), { timeout: 15000 }).toEqual([true, true]);
    expect(await participants(a)).toHaveLength(2); expect(await participants(b)).toHaveLength(2);
    await expect(withCacheMaintenance(a, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
    for (const c of children) c.child.send('release');
    expect(await Promise.all(children.map(c => c.closed))).toEqual([0, 0]);
    expect(await participants(a)).toEqual([]); expect(await participants(b)).toEqual([]);
  } finally {
    for (const c of children) if (c.child.exitCode === null && c.child.signalCode === null) c.child.kill('SIGKILL');
    await Promise.allSettled(children.map(c => c.closed));
  }
}, 30000);
