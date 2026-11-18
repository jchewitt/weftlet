import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { sha256, type GraphSnapshot } from '@weftlet/core';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { physicalArtifactKey } from '../src/infrastructure/artifact-paths.js';
import { withSnapshotAccess } from '../src/storage/coordination/snapshot-access.js';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { inventoryCache } from '../src/storage/inspection/inventory.js';
import { planRetention, checkRetentionPlan } from '../src/storage/retention/plan.js';
import { emptyRetentionPolicy } from '../src/storage/retention/policy.js';

const fault = vi.hoisted(() => ({ rename: false, manifestReads: [] as string[] }));
vi.mock('../src/storage/streaming-json.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/storage/streaming-json.js')>();
  return { ...actual, readJsonProperty: async (...args: Parameters<typeof actual.readJsonProperty>) => {
    fault.manifestReads.push(args[0]);
    return actual.readJsonProperty(...args);
  } };
});
vi.mock('../src/storage/atomic-rename.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/storage/atomic-rename.js')>();
  return { atomicRename: async (from: string, to: string) => {
    if (fault.rename) throw Error('Injected pre-publication failure');
    return actual.atomicRename(from, to);
  } };
});
const execute = promisify(execFile), roots: string[] = [];
afterEach(async () => { fault.rename = false; await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
function snapshot(id: string): GraphSnapshot {
  return { manifest: { schemaVersion: 1, repositoryId: 'public/generations', ref: 'HEAD', commitSha: 'a'.repeat(40),
    snapshotId: id, configurationDigest: 'b'.repeat(64), contentDigest: sha256(id), scope: ['src'],
    ontologyVersion: 'test', extractorVersions: {}, semanticModel: 'none', semanticPromptVersion: 'test',
    generatedAt: '2026-11-18T00:00:00.000Z', semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
    facts: [], invariants: [], runtimeEvidence: [], unresolved: [] };
}
async function fixture(ids = ['a', 'b', 'c']) {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-heads-')); roots.push(root);
  const store = new FileSnapshotStore(root);
  for (const id of ids) await store.write(snapshot(id));
  return { root, store, head: join(root, 'heads/default.json') };
}
it('tracks distinct generations atomically and preserves unchanged head/snapshot bytes through the public scope', async () => {
  const f = await fixture();
  const before = await Promise.all(['a', 'b', 'c'].map(async id => readFile((await f.store.file(id))!)));
  await enableCacheCoordination(f.root, { acknowledgeQuiescence: true });
  await withSnapshotAccess(f.root, async store => {
    expect(await store.readHeadState('default')).toBeUndefined();
    await store.updateHead('default', 'a', { expectedSnapshotId: null });
    expect(await store.readHeadState('default')).toEqual({ schemaVersion: 1, snapshotId: 'a' });
    await store.updateHead('default', 'b', { expectedSnapshotId: 'a' });
    const bytes = await readFile(f.head);
    await store.updateHead('default', 'b', { expectedSnapshotId: 'b' });
    expect(await readFile(f.head)).toEqual(bytes);
    expect(await store.readHeadState('default')).toEqual({ schemaVersion: 1, snapshotId: 'b', previousSnapshotId: 'a' });
    await store.updateHead('default', 'c');
    expect(await store.readHeadState('default')).toEqual({ schemaVersion: 1, snapshotId: 'c', previousSnapshotId: 'b' });
    await store.updateHead('default', 'a'); // Explicit rollback is a new publication, not rewritten history.
    expect(await store.readHeadState('default')).toEqual({ schemaVersion: 1, snapshotId: 'a', previousSnapshotId: 'c' });
    for (const [i, id] of ['a', 'b', 'c'].entries()) await store.withFile(id, async file => expect(await readFile(file!)).toEqual(before[i]));
  });
});
it('keeps legacy heads byte-identical until advancement and preserves a long legacy head predecessor', async () => {
  const f = await fixture(); await mkdir(join(f.root, 'heads'));
  const name = 'legacy-'.repeat(20), legacy = join(f.root, 'heads', `${name}.json`);
  await writeFile(legacy, '{ "snapshotId": "a", "note": "legacy metadata" }\n');
  const bytes = await readFile(legacy);
  expect(await f.store.readHeadState(name)).toEqual({ snapshotId: 'a' });
  await f.store.updateHead(name, 'a');
  expect(await readFile(legacy)).toEqual(bytes);
  await expect(readFile(join(f.root, 'heads', physicalArtifactKey(name) + '.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  await f.store.updateHead(name, 'b');
  expect(await f.store.readHeadState(name)).toEqual({ schemaVersion: 1, snapshotId: 'b', previousSnapshotId: 'a' });
  expect(await readFile(legacy)).toEqual(bytes); // No legacy deletion/migration in this slice.
});
it('preserves the complete head and all snapshots on CAS, absent-target and publication failures, then retries safely', async () => {
  const f = await fixture(); await f.store.updateHead('default', 'a'); await f.store.updateHead('default', 'b');
  const bytes = await readFile(f.head);
  await expect(f.store.updateHead('default', 'c', { expectedSnapshotId: 'a' })).rejects.toThrow('changed');
  await expect(f.store.updateHead('default', 'missing')).rejects.toThrow('absent');
  fault.rename = true;
  await expect(f.store.updateHead('default', 'c')).rejects.toThrow('Injected');
  expect(await readFile(f.head)).toEqual(bytes);
  expect((await readdir(join(f.root, 'heads'))).sort()).toEqual(['default.json']);
  fault.rename = false;
  for (const id of ['a', 'b', 'c']) expect(await f.store.read(id)).toEqual(snapshot(id));
  await f.store.updateHead('default', 'c', { expectedSnapshotId: 'b' });
  expect(await f.store.readHeadState('default')).toEqual({ schemaVersion: 1, snapshotId: 'c', previousSnapshotId: 'b' });
});
it('rejects malformed or dangling current records without silently repairing away their history', async () => {
  const f = await fixture(); await f.store.updateHead('default', 'a');
  for (const record of [{ schemaVersion: 2, snapshotId: 'a' }, { schemaVersion: 1, snapshotId: 'a', previousSnapshotId: 'a' },
    { schemaVersion: 1, snapshotId: 'a', previousSnapshotId: '../escape' }, { snapshotId: 'a', previousSnapshotId: 'b' }]) {
    const bytes = JSON.stringify(record); await writeFile(f.head, bytes);
    await expect(f.store.readHeadState('default')).rejects.toThrow('Invalid');
    await expect(f.store.updateHead('default', 'c')).rejects.toThrow('Invalid');
    expect(await readFile(f.head, 'utf8')).toBe(bytes);
  }
  await writeFile(f.head, JSON.stringify({ schemaVersion: 1, snapshotId: 'absent', previousSnapshotId: 'a' }));
  await expect(f.store.updateHead('default', 'c')).rejects.toThrow('absent current');
});
it('does not reparse the previous graph while holding the short publication lock', async () => {
  const f = await fixture(); await f.store.updateHead('default', 'a');
  fault.manifestReads.length = 0;
  await f.store.updateHead('default', 'b');
  // Complete validation is needed for the new target, not another full parse of the old graph.
  expect(fault.manifestReads).toEqual([join(f.root, 'snapshots/b.json')]);
});
it('serializes competing process CAS publishers so only the winner advances the predecessor', async () => {
  const f = await fixture(); await f.store.updateHead('default', 'a');
  const module = new URL('../src/storage/storage.ts', import.meta.url).href;
  const results = await Promise.allSettled(['b', 'c'].map(id => execute(process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', `
      import { FileSnapshotStore } from ${JSON.stringify(module)};
      await new FileSnapshotStore(${JSON.stringify(f.root)}).updateHead('default', ${JSON.stringify(id)}, { expectedSnapshotId: 'a' });
    `], { cwd: process.cwd(), timeout: 25_000, windowsHide: true })));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  const head = (await f.store.readHeadState('default'))!;
  expect(['b', 'c']).toContain(head.snapshotId); expect(head.previousSnapshotId).toBe('a');
});
it('exposes no torn current/previous pairs to a reader during separate-process publication', async () => {
  const ids = Array.from({ length: 31 }, (_, i) => `generation-${i}`), f = await fixture(ids);
  await f.store.updateHead('default', ids[0]!);
  const module = new URL('../src/storage/storage.ts', import.meta.url).href;
  let finished = false, reads = 0;
  const writer = execute(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `
    import { FileSnapshotStore } from ${JSON.stringify(module)};
    const store = new FileSnapshotStore(${JSON.stringify(f.root)});
    for (let i = 1; i <= 30; i++) await store.updateHead('default', 'generation-' + i);
  `], { cwd: process.cwd(), timeout: 25_000, windowsHide: true }).finally(() => { finished = true; });
  const reader = (async () => {
    do {
      const state = (await f.store.readHeadState('default'))!, n = Number(state.snapshotId.split('-')[1]);
      expect(state.previousSnapshotId).toBe(n ? `generation-${n - 1}` : undefined);
      reads++; await delay(1);
    } while (!finished);
  })();
  const results = await Promise.allSettled([writer, reader]);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  expect(reads).toBeGreaterThan(1);
  expect(await f.store.readHeadState('default')).toEqual({ schemaVersion: 1, snapshotId: 'generation-30', previousSnapshotId: 'generation-29' });
});
it('protects tracked previous generations in inventory and plans, including undeclared heads, and invalidates old plans', async () => {
  const f = await fixture(); await f.store.updateHead('default', 'a'); await f.store.updateHead('default', 'b');
  const policy = emptyRetentionPolicy();
  policy.profiles.push({ path: '.', repositoryId: 'public/generations', owner: 'team', reason: 'Development' });
  const inventory = await inventoryCache({ roots: [f.root], verify: true });
  expect(inventory.danglingHeads).toEqual([]);
  for (const id of ['a', 'b']) expect(inventory.objects.find(o => o.path === `snapshots/${id}.json`)!.headReferences).toEqual([f.head]);
  const undeclared = await planRetention({ root: f.root, policy });
  for (const id of ['a', 'b']) expect(undeclared.objects.find(o => o.path === `snapshots/${id}.json`)!.disposition).toBe('retain');
  policy.activeScopes.push({ profile: '.', head: 'default', owner: 'team', reason: 'Active' });
  const plan = await planRetention({ root: f.root, policy });
  expect(plan.readyForReview).toBe(true); expect(plan.canApply).toBe(false);
  expect(plan.objects.find(o => o.path === 'snapshots/a.json')!.reasons).toContain('tracked-previous-generation:default');
  await f.store.updateHead('default', 'c');
  expect((await checkRetentionPlan(plan, { root: f.root, policy })).unchanged).toBe(false);
  const next = await planRetention({ root: f.root, policy });
  expect(next.objects.find(o => o.path === 'snapshots/a.json')!.disposition).toBe('candidate');
  expect(next.objects.find(o => o.path === 'snapshots/b.json')!.disposition).toBe('retain');
  await rm((await f.store.file('b'))!);
  expect((await inventoryCache({ roots: [f.root], verify: true })).danglingHeads).toEqual([f.head]);
  expect((await planRetention({ root: f.root, policy })).readyForReview).toBe(false);
});
it('keeps manual rollback protection in addition to tracked history and binds both references to explicit head retirement', async () => {
  const f = await fixture(); await f.store.updateHead('default', 'a'); await f.store.updateHead('default', 'b'); await f.store.updateHead('default', 'c');
  const policy = emptyRetentionPolicy();
  policy.profiles.push({ path: '.', repositoryId: 'public/generations', owner: 'team', reason: 'Development' });
  policy.activeScopes.push({ profile: '.', head: 'default', previousSnapshotId: 'a', owner: 'team', reason: 'Extra rollback' });
  const active = await planRetention({ root: f.root, policy });
  for (const id of ['a', 'b', 'c']) expect(active.objects.find(o => o.path === `snapshots/${id}.json`)!.disposition).toBe('retain');
  policy.activeScopes = [];
  policy.releasedHeads.push({ profile: '.', head: 'default', snapshotId: 'c', owner: 'team', reason: 'Scope closed' });
  const released = await planRetention({ root: f.root, policy });
  expect(released.readyForReview).toBe(true); expect(released.canApply).toBe(false);
  for (const id of ['b', 'c']) expect(released.objects.find(o => o.path === `snapshots/${id}.json`)).toMatchObject({ disposition: 'candidate', removeBefore: ['heads/default.json'] });
  await writeFile(f.head, JSON.stringify({ schemaVersion: 1, snapshotId: 'c', previousSnapshotId: '../escape' }));
  const invalid = await planRetention({ root: f.root, policy });
  expect(invalid.readyForReview).toBe(false);
  expect(invalid.issues.some(i => i.code === 'invalid-cache-object')).toBe(true);
});
