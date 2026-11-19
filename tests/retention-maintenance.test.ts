import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { sha256, persistedJsonDigest, type GraphSnapshot } from '@weftlet/core';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { withManagedCacheAccess } from '../src/storage/coordination/managed-access.js';
import { emptyRetentionPolicy } from '../src/storage/retention/policy.js';
import { prepareRetention } from '../src/storage/retention/prepared.js';
import { maintainRetention } from '../src/storage/retention/maintenance.js';
import { recurringRetentionOperation } from '../src/application/retention/maintenance.js';

const hooks = vi.hoisted(() => ({ unlink: undefined as undefined | ((path: string) => Promise<void>), sync: undefined as undefined | ((path: string) => Promise<void>) }));
vi.mock('node:fs/promises', async original => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, unlink: async (path: string) => { await hooks.unlink?.(path); return actual.unlink(path); },
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args), sync = handle.sync.bind(handle);
      handle.sync = async () => { await hooks.sync?.(String(args[0])); return sync(); }; return handle;
    } };
});
const roots: string[] = [];
afterEach(async () => {
  hooks.unlink = undefined; hooks.sync = undefined; vi.useRealTimers();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});
function snapshot(id: string): GraphSnapshot {
  return { manifest: { schemaVersion: 1, repositoryId: 'public/recurring', ref: 'HEAD', commitSha: 'a'.repeat(40), snapshotId: id,
    configurationDigest: 'b'.repeat(64), contentDigest: sha256(id), scope: ['src'], ontologyVersion: 'test', extractorVersions: { public: 'unchanged' },
    semanticModel: 'none', semanticPromptVersion: 'test', generatedAt: '2026-11-19T00:00:00.000Z', semanticArtifactKeys: ['reuse'], scipIndexDigest: '', rdfDigest: '' },
    facts: [], invariants: [], runtimeEvidence: [], unresolved: [] };
}
async function fixture() {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'weftlet-maintain-'))); roots.push(parent);
  const root = join(parent, 'cache'); await mkdir(root);
  const store = new FileSnapshotStore(root);
  for (const id of ['old0', 'old1', 'previous', 'current', 'pinned']) await store.write(snapshot(id));
  await store.updateHead('default', 'previous'); await store.updateHead('default', 'current');
  await mkdir(join(root, 'artifacts/semantic'), { recursive: true }); await writeFile(join(root, 'artifacts/semantic/reuse.json'), '{"public":"retain exact reusable bytes"}');
  await mkdir(join(root, 'scip')); await writeFile(join(root, 'scip/index.scip'), 'public index');
  await writeFile(join(root, 'unknown'), 'preserve unknown bytes');
  const policy = emptyRetentionPolicy(); policy.history = { mode: 'target', maxBytes: 0 };
  policy.profiles.push({ path: '.', repositoryId: 'public/recurring', owner: 'team', reason: 'Development' });
  policy.activeScopes.push({ profile: '.', head: 'default', owner: 'team', reason: 'Current and previous' });
  policy.pins.push({ profile: '.', snapshotId: 'pinned', owner: 'team', reason: 'Reproduction' });
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  const plan = await prepareRetention({ root, policy });
  return { parent, root, store, policy, expectedRoot: plan.rootId, expectedPolicy: plan.policyDigest };
}
async function bytes(root: string) {
  const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter(e => e.isFile() && !join(e.parentPath, e.name).includes('.weftlet-coordination'));
  return Object.fromEntries(await Promise.all(files.map(async e => { const path = join(e.parentPath, e.name); return [relative(root, path).replaceAll('\\', '/'), sha256(await readFile(path))]; })));
}
async function controls(root: string) { return (await readdir(join(root, '.weftlet-coordination'), { recursive: true })).sort(); }
it('reconciles old history and new generations with one reviewed policy, preserving exact current/previous/pin/artifact bytes', async () => {
  const f = await fixture(), before = await bytes(f.root);
  const first = await maintainRetention(f);
  expect(first).toMatchObject({ status: 'complete', rootId: f.expectedRoot, policyDigest: f.expectedPolicy });
  expect(first.removal.deleted).toEqual(['snapshots/old0.json', 'snapshots/old1.json']);
  expect(first.history.root.protectedOverageBytes).toBeGreaterThan(0);
  for (const [path, hash] of Object.entries(await bytes(f.root))) expect(hash).toBe(before[path]);
  const markers = await controls(f.root);
  for (let i = 0; i < 2; i++) expect((await maintainRetention(f)).removal).toMatchObject({ journalPath: null, operationId: null, deleted: [] });
  expect(await controls(f.root)).toEqual(markers);
  // A necessary new graph can publish above the target; selection follows the new current/previous references.
  await f.store.write(snapshot('new')); await f.store.updateHead('default', 'new');
  expect((await maintainRetention(f)).removal.deleted).toEqual(['snapshots/previous.json']);
  expect(await f.store.readHead('default')).toEqual(snapshot('new')); expect(await f.store.read('current')).toEqual(snapshot('current'));
  expect(await f.store.read('pinned')).toEqual(snapshot('pinned'));
  expect(await f.store.read('previous')).toBeUndefined();
});
it('retains newly added undeclared heads and only expires a pin according to its explicitly configured expiry', async () => {
  const f = await fixture(); await f.store.updateHead('additional-scope', 'old0');
  f.policy.pins[0]!.expiresAt = '2030-01-01T00:00:00.000Z'; f.expectedPolicy = persistedJsonDigest(f.policy);
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2029-12-31T00:00:00Z'));
  expect((await maintainRetention(f)).removal.deleted).toEqual(['snapshots/old1.json']);
  vi.setSystemTime(new Date('2030-01-02T00:00:00Z'));
  expect((await maintainRetention(f)).removal.deleted).toEqual(['snapshots/pinned.json']);
  expect(await f.store.readHead('additional-scope')).toEqual(snapshot('old0'));
});
it('rejects wrong/replaced roots and changed policy before creating a removal journal', async () => {
  const f = await fixture(), other = await fixture(), before = await bytes(f.root), markers = await controls(f.root);
  await expect(maintainRetention({ ...f, expectedRoot: other.expectedRoot })).rejects.toThrow('expect-root');
  await expect(maintainRetention({ ...f, expectedPolicy: '0'.repeat(64) })).rejects.toThrow('expect-policy');
  await expect(maintainRetention({ ...f, expectedPolicy: '' })).rejects.toThrow('reviewed');
  const owner = join(f.root, '.weftlet-coordination/root.json');
  const original = JSON.parse(await readFile(owner, 'utf8')); await writeFile(owner, JSON.stringify({ ...original, rootId: other.expectedRoot }));
  await expect(maintainRetention(f)).rejects.toThrow('expect-root');
  expect(await bytes(f.root)).toEqual(before); expect(await controls(f.root)).toEqual(markers);
});
it('requires configured history and completed one-time migration even for an indefinite/no-candidate policy', async () => {
  const f = await fixture(), before = await bytes(f.root), markers = await controls(f.root);
  delete f.policy.history; f.expectedPolicy = persistedJsonDigest(f.policy);
  await expect(maintainRetention(f)).rejects.toThrow('configured history');
  f.policy.history = { mode: 'indefinite' };
  f.policy.releasedHeads.push({ profile: '.', head: 'missing-retirement', snapshotId: 'old0', owner: 'team', reason: 'not acknowledged' });
  f.expectedPolicy = persistedJsonDigest(f.policy);
  await expect(maintainRetention(f)).rejects.toThrow('one-time reviewed migration');
  expect(await bytes(f.root)).toEqual(before); expect(await controls(f.root)).toEqual(markers);
});
it('detects a policy edit during inventory before creating a journal or removing evidence', async () => {
  const f = await fixture(), before = await bytes(f.root), markers = await controls(f.root);
  await expect(maintainRetention({ ...f, readPolicy: async () => f.policy,
    onProgress() { f.policy.history = { mode: 'indefinite' }; } })).rejects.toThrow('expect-policy');
  expect(await bytes(f.root)).toEqual(before); expect(await controls(f.root)).toEqual(markers);
});
it('rechecks policy after durable unlink intent and stops without removing the newly protected evidence', async () => {
  const f = await fixture(), before = await bytes(f.root); let syncs = 0;
  hooks.sync = async path => { if (path.endsWith('.jsonl') && ++syncs === 2) f.policy.pins.push({ profile: '.', snapshotId: 'old0', owner: 'team', reason: 'New need' }); };
  const result = await maintainRetention({ ...f, readPolicy: async () => f.policy });
  expect(result.removal).toMatchObject({ status: 'partial', deleted: [], failure: 'removal-stopped' });
  expect(await bytes(f.root)).toEqual(before);
  hooks.sync = undefined; f.expectedPolicy = persistedJsonDigest(f.policy);
  expect((await maintainRetention(f)).removal.deleted).toEqual(['snapshots/old1.json']);
});
it('reselects after an ordinary partial I/O failure without replaying stale plans or losing current evidence', async () => {
  const f = await fixture();
  hooks.unlink = async path => { if (path.endsWith('old1.json')) throw Object.assign(Error('fixture'), { code: 'EACCES' }); };
  const first = await maintainRetention(f); expect(first.removal).toMatchObject({ status: 'partial', deleted: ['snapshots/old0.json'], failure: 'EACCES' });
  hooks.unlink = undefined;
  expect((await maintainRetention(f)).removal.deleted).toEqual(['snapshots/old1.json']);
  expect(await f.store.readHead('default')).toEqual(snapshot('current'));
});
it('handles cancellation and refuses pending journal recovery instead of resuming interrupted deletions', async () => {
  const f = await fixture(), cancel = new AbortController();
  hooks.unlink = async path => { if (path.endsWith('old0.json')) cancel.abort(); };
  expect((await maintainRetention({ ...f, signal: cancel.signal })).removal).toMatchObject({ status: 'partial', deleted: ['snapshots/old0.json'], failure: 'cancelled' });
  hooks.unlink = undefined;
  hooks.sync = async path => { if (path.endsWith('.jsonl')) throw Object.assign(Error('fixture disk'), { code: 'ENOSPC' }); };
  await expect(maintainRetention(f)).rejects.toThrow('fixture disk');
  hooks.sync = undefined; const before = await bytes(f.root);
  await expect(maintainRetention(f)).rejects.toThrow('explicit recovery');
  expect(await bytes(f.root)).toEqual(before);
});
it('serializes concurrent maintenance and waits for active users without deleting an in-use snapshot', async () => {
  const f = await fixture(), before = await bytes(f.root);
  let release!: () => void, started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; }), end = new Promise<void>(resolve => { release = resolve; });
  const reader = withManagedCacheAccess([f.root], async () => { started(); await end; });
  await ready;
  try { await expect(maintainRetention({ ...f, timeoutMs: 40 })).rejects.toThrow('blocked'); expect(await bytes(f.root)).toEqual(before); }
  finally { release(); await reader; }
  const results = await Promise.all([maintainRetention(f), maintainRetention(f)]);
  expect(results.map(r => r.removal.deleted.length).sort()).toEqual([0, 2]);
  expect(await f.store.readHead('default')).toEqual(snapshot('current'));
});
it('leaves indefinite and under-target maintenance journal-free and refuses incomplete inventory', async () => {
  const f = await fixture(), before = await bytes(f.root), markers = await controls(f.root);
  for (const history of [{ mode: 'indefinite' } as const, { mode: 'target', maxBytes: Number.MAX_SAFE_INTEGER } as const]) {
    f.policy.history = history; f.expectedPolicy = persistedJsonDigest(f.policy);
    for (let i = 0; i < 2; i++) expect((await maintainRetention(f)).removal).toMatchObject({ journalPath: null, deleted: [] });
  }
  await expect(maintainRetention({ ...f, maxEntries: 1 })).rejects.toThrow('blocked');
  expect(await bytes(f.root)).toEqual(before); expect(await controls(f.root)).toEqual(markers);
});
it('runs the actual CLI outside a repository, requires pinned approvals and refuses a policy inside the cache', async () => {
  const f = await fixture(), policyPath = join(f.parent, 'retention.json'); await writeFile(policyPath, JSON.stringify(f.policy));
  await writeFile(join(f.root, 'policy.json'), JSON.stringify(f.policy));
  await expect(recurringRetentionOperation({ ...f, policyPath: join(f.root, 'policy.json') })).rejects.toThrow('outside');
  const cli = join(process.cwd(), 'src/cli.ts');
  const run = (...args: string[]) => promisify(execFile)(process.execPath, ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href, cli, 'cache', 'retention', 'maintain', ...args], { cwd: f.parent, timeout: 30_000, windowsHide: true });
  const common = ['--root', f.root, '--policy', policyPath, '--expect-root', f.expectedRoot, '--expect-policy', f.expectedPolicy];
  await expect(run('--root', f.root, '--policy', policyPath)).rejects.toThrow('expect-policy');
  const result = JSON.parse((await run(...common, '--json', '--quiet')).stdout);
  expect(result).toMatchObject({ kind: 'retention-maintenance-result', status: 'complete', policyDigest: f.expectedPolicy });
  expect(result.removal.deleted).toEqual(['snapshots/old0.json', 'snapshots/old1.json']);
  expect((await run(...common, '--quiet')).stdout).toContain('No-op: no removal journal created.');
}, 60_000);
