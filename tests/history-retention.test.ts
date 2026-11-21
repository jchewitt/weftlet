import { link, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile, utimes } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { sha256, type GraphSnapshot } from '@weftlet/core';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { emptyRetentionPolicy, parseRetentionPolicy } from '../src/storage/retention/policy.js';
import { planRetention } from '../src/storage/retention/plan.js';
import { prepareRetention } from '../src/storage/retention/prepared.js';
import { applyRetention } from '../src/storage/retention/apply.js';
import { maintainRetention } from '../src/storage/retention/maintenance.js';
import { initializeRetentionPolicy } from '../src/application/retention/operations.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }))); });
function snapshot(id: string, repositoryId: string): GraphSnapshot & { fixturePadding: string } {
  return { manifest: { schemaVersion: 1, repositoryId, ref: 'HEAD', commitSha: 'a'.repeat(40), snapshotId: id,
    configurationDigest: 'b'.repeat(64), contentDigest: sha256(id), scope: ['src'], ontologyVersion: 'test', extractorVersions: { public: 'unchanged' },
    semanticModel: 'none', semanticPromptVersion: 'test', generatedAt: '2026-11-19T00:00:00.000Z', semanticArtifactKeys: ['reuse'], scipIndexDigest: '', rdfDigest: '' },
    facts: [], invariants: [], runtimeEvidence: [], unresolved: [], fixturePadding: 'public fixture '.repeat(4096) };
}
async function fixture(sharedRepository = false) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'weftlet-history-'))); roots.push(parent);
  const root = join(parent, 'cache'); await mkdir(root);
  const policy = emptyRetentionPolicy(), stores = new Map<string, FileSnapshotStore>();
  for (const [index, path] of ['alpha', 'alpha/nested', 'beta'].entries()) {
    const repositoryId = path === 'alpha/nested' ? (sharedRepository ? 'public/alpha' : 'public/nested') : `public/${path}`;
    const store = new FileSnapshotStore(join(root, path)); stores.set(path, store);
    for (const [order, id] of ['old0', 'old1', 'orphan', 'previous', 'current', 'pinned'].entries()) {
      await store.write(snapshot(id, repositoryId));
      const time = new Date(Date.UTC(2020, 0, 1 + index * 10 + order));
      await utimes((await store.file(id))!, time, time);
    }
    await store.updateHead('default', 'previous'); await store.updateHead('default', 'current');
    await store.updateHead('retired', 'old0'); await store.updateHead('retired', 'old1');
    await mkdir(join(root, path, 'artifacts/semantic'), { recursive: true }); await writeFile(join(root, path, 'artifacts/semantic/reuse.json'), '{"public":"retained reuse"}');
    await mkdir(join(root, path, 'scip')); await writeFile(join(root, path, 'scip/index.scip'), 'public index');
    await writeFile(join(root, path, 'unknown.txt'), `retained ${path}`);
    policy.profiles.push({ path, repositoryId, owner: 'team', reason: 'Development profile' });
    policy.activeScopes.push({ profile: path, head: 'default', owner: 'team', reason: 'Current and previous' });
    policy.releasedHeads.push({ profile: path, head: 'retired', snapshotId: 'old1', owner: 'team', reason: 'Closed scope' });
    policy.pins.push({ profile: path, snapshotId: 'pinned', owner: 'reviewer', reason: 'Reproduction' });
  }
  await writeFile(join(root, 'unknown-user-wide.txt'), 'preserve unattributed bytes');
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  return { parent, root, policy, stores };
}
const selected = (plan: Awaited<ReturnType<typeof prepareRetention>>) => plan.objects.filter(o => o.disposition === 'candidate').map(o => o.path);
async function evidenceBytes(root: string) {
  const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter(e => e.isFile() && !join(e.parentPath, e.name).includes('.weftlet-coordination'));
  return Object.fromEntries(await Promise.all(files.map(async e => { const path = join(e.parentPath, e.name); return [relative(root, path).replaceAll('\\', '/'), sha256(await readFile(path))]; })));
}
it('reconciles an already oversized multi-profile cache toward one root target without deleting newer or protected evidence', async () => {
  const f = await fixture(), before = await evidenceBytes(f.root); f.policy.history = { mode: 'target', maxBytes: Number.MAX_SAFE_INTEGER };
  const manual = await prepareRetention(f);
  f.policy.history = { mode: 'target', maxBytes: manual.history.root.observedBytes - 1 };
  const plan = await prepareRetention(f);
  expect(plan.canApply).toBe(true); expect(plan.history.root.projectedOverageBytes).toBe(0);
  expect(selected(plan)).toEqual(['alpha/heads/retired.json', 'alpha/snapshots/old0.json']);
  const removal = await applyRetention(plan, plan.planId, f); expect(removal.deleted).toEqual(selected(plan));
  const after = await evidenceBytes(f.root);
  for (const [path, hash] of Object.entries(after)) expect(hash).toBe(before[path]);
  expect(Object.keys(before).length - Object.keys(after).length).toBe(2);
  for (const [path, store] of f.stores) {
    expect((await store.readHead('default'))!.manifest.snapshotId).toBe('current');
    expect((await store.read('previous'))!.manifest.extractorVersions).toEqual({ public: 'unchanged' });
    expect(await readFile(join(f.root, path, 'artifacts/semantic/reuse.json'), 'utf8')).toBe('{"public":"retained reuse"}');
  }
  // Explicit retirement declarations remain exact: remove only the now-confirmed retired declaration.
  expect((await prepareRetention(f)).canApply).toBe(false);
  f.policy.releasedHeads = f.policy.releasedHeads.filter(r => r.profile !== 'alpha');
  const next = await prepareRetention(f); expect(next.canApply).toBe(true); expect(selected(next)).toEqual([]);
  expect(next.history.root.observedBytes).toBeLessThanOrEqual(f.policy.history.maxBytes);
});
it('deduplicates shared released-head prerequisites and makes protected overage a valid report rather than a build cap', async () => {
  const f = await fixture(), before = await evidenceBytes(f.root); f.policy.history = { mode: 'target', maxBytes: 0 };
  const plan = await prepareRetention(f), candidates = plan.objects.filter(o => o.disposition === 'candidate');
  expect(plan.canApply).toBe(true); expect(plan.history.selectedSnapshotFiles).toBe(9); expect(candidates).toHaveLength(12);
  expect(plan.history.root.selectedBytes).toBe(candidates.reduce((n, o) => n + o.logicalBytes, 0));
  expect(plan.history.root.protectedOverageBytes).toBe(plan.history.root.projectedBytes);
  expect(plan.history.root.protectedOverageBytes).toBeGreaterThan(0);
  const result = await applyRetention(plan, plan.planId, f); expect(result.status).toBe('complete');
  for (const [path, hash] of Object.entries(await evidenceBytes(f.root))) expect(hash).toBe(before[path]);
  // A necessary graph larger than the target still publishes and remains queryable.
  const store = f.stores.get('alpha')!; await store.write(snapshot('larger-current', 'public/alpha')); await store.updateHead('default', 'larger-current');
  expect((await store.readHead('default'))!.manifest.snapshotId).toBe('larger-current');
});
it('keeps global and per-repository indefinite history and avoids permanent growth on repeated no-op application', async () => {
  const f = await fixture(), before = await evidenceBytes(f.root); f.policy.history = { mode: 'indefinite' };
  const controls = await readdir(join(f.root, '.weftlet-coordination'), { recursive: true });
  const plan = await prepareRetention(f); expect(selected(plan)).toEqual([]); expect(plan.history.mode).toBe('indefinite');
  for (let i = 0; i < 3; i++) {
    const next = await prepareRetention(f); expect(next.planId).toBe(plan.planId);
    expect(await applyRetention(next, next.planId, f)).toMatchObject({ status: 'complete', deleted: [], journalPath: null, operationId: null });
  }
  expect(await readdir(join(f.root, '.weftlet-coordination'), { recursive: true })).toEqual(controls);
  expect(await evidenceBytes(f.root)).toEqual(before);
  f.policy.history = { mode: 'target', maxBytes: 0, repositories: [{ repositoryId: 'public/beta', mode: 'indefinite' }] };
  const targeted = await prepareRetention(f);
  expect(selected(targeted).some(path => path.startsWith('beta/'))).toBe(false);
  expect(targeted.objects.find(o => o.path === 'beta/snapshots/old0.json')!.reasons).toContain('history-indefinite');
  expect(targeted.history.root.projectedOverageBytes).toBeGreaterThan(0);
});
it('applies a repository target across profiles and attributes nested unknown data without granting deletion eligibility', async () => {
  const f = await fixture();
  f.policy.history = { mode: 'target', maxBytes: Number.MAX_SAFE_INTEGER, repositories: [{ repositoryId: 'public/nested', mode: 'target', maxBytes: 0 }] };
  const plan = await prepareRetention(f);
  expect(selected(plan).every(path => path.startsWith('alpha/nested/'))).toBe(true);
  expect(selected(plan)).toHaveLength(4);
  const nested = plan.history.repositories.find(r => r.repositoryId === 'public/nested')!;
  const actual = plan.objects.filter(o => o.path.startsWith('alpha/nested/')).reduce((n, o) => n + o.logicalBytes, 0);
  expect(nested.observedBytes).toBe(actual);
  expect(plan.objects.find(o => o.path === 'alpha/nested/unknown.txt')!.disposition).toBe('retain');
  expect(plan.history.root.observedBytes).toBe(plan.history.repositories.reduce((n, r) => n + r.observedBytes, 0) + plan.history.unattributedBytes);
  expect(plan.history.coordinationBytes).toBeGreaterThan(0);
  const observed = await planRetention(f); expect(observed.history).toEqual(plan.history);
});
it('preserves undeclared profiles, legacy heads and linked files even when their bytes exceed the target', async () => {
  const f = await fixture(); f.policy.history = { mode: 'target', maxBytes: 0 };
  f.policy.profiles = f.policy.profiles.filter(p => p.path !== 'beta');
  f.policy.activeScopes = f.policy.activeScopes.filter(p => p.profile !== 'beta');
  f.policy.releasedHeads = f.policy.releasedHeads.filter(p => p.profile !== 'beta' && p.profile !== 'alpha');
  f.policy.pins = f.policy.pins.filter(p => p.profile !== 'beta');
  const fs = await import('node:fs/promises'); await fs.link(join(f.root, 'alpha/snapshots/orphan.json'), join(f.parent, 'hardlink.json'));
  const plan = await prepareRetention(f);
  expect(selected(plan).every(path => path.startsWith('alpha/nested/'))).toBe(true);
  expect(plan.history.unattributedBytes).toBeGreaterThan(100_000);
  expect(plan.history.root.protectedOverageBytes).toBeGreaterThan(0);
});
it('invalidates prepared choices for target, pin, file-age and current-head changes without touching evidence', async () => {
  const f = await fixture(); f.policy.history = { mode: 'target', maxBytes: 0 };
  const saved = await prepareRetention(f), before = await evidenceBytes(f.root);
  const changed = structuredClone(f.policy); changed.history = { mode: 'indefinite' };
  await expect(applyRetention(saved, saved.planId, { ...f, policy: changed })).rejects.toThrow('stale');
  const pinned = structuredClone(f.policy); pinned.pins.push({ profile: 'alpha', snapshotId: 'orphan', owner: 'team', reason: 'New pin' });
  await expect(applyRetention(saved, saved.planId, { ...f, policy: pinned })).rejects.toThrow('stale');
  await utimes(join(f.root, 'alpha/snapshots/orphan.json'), new Date(), new Date());
  await expect(applyRetention(saved, saved.planId, f)).rejects.toThrow('stale');
  const afterTime = await prepareRetention(f); await f.stores.get('alpha')!.updateHead('default', 'orphan');
  await expect(applyRetention(afterTime, afterTime.planId, f)).rejects.toThrow('stale');
  const after = await evidenceBytes(f.root); for (const path of Object.keys(after).filter(p => p !== 'alpha/heads/default.json')) expect(after[path]).toBe(before[path]);
});
it('validates operational policy separately and scaffolds explicit target/indefinite choices without overwrites', async () => {
  const f = await fixture();
  for (const history of [{ mode: 'target', maxBytes: -1 }, { mode: 'target', maxBytes: 1.2 }, { mode: 'target', maxBytes: Infinity },
    { mode: 'target', maxBytes: '10 GiB' }, { mode: 'target', maxBytes: Number.MAX_SAFE_INTEGER + 1 }, { mode: 'indefinite', maxBytes: 1 },
    { mode: 'indefinite', repositories: [] }, { mode: 'automatic' }, { mode: 'target', maxBytes: 1, repositories: [{ repositoryId: 'absent', mode: 'indefinite' }] }]) {
    expect(() => parseRetentionPolicy({ ...f.policy, history })).toThrow();
  }
  for (const path of ['.weftlet-coordination', 'profile/.weftlet-coordination', '.WEFTLET-COORDINATION']) {
    expect(() => parseRetentionPolicy({ ...emptyRetentionPolicy(), profiles: [{ path, repositoryId: 'public/reserved', owner: 'team', reason: 'Invalid reserved owner' }] })).toThrow('contained relative path');
  }
  const target = join(f.parent, 'target.json'), indefinite = join(f.parent, 'indefinite.json');
  await initializeRetentionPolicy(target, { targetBytes: 10 * 1024 ** 3 }); await initializeRetentionPolicy(indefinite, { keepIndefinitely: true });
  expect(JSON.parse(await readFile(target, 'utf8')).history).toEqual({ mode: 'target', maxBytes: 10737418240 });
  expect(JSON.parse(await readFile(indefinite, 'utf8')).history).toEqual({ mode: 'indefinite' });
  await expect(initializeRetentionPolicy(target, { targetBytes: 1 })).rejects.toMatchObject({ code: 'EEXIST' });
  await expect(initializeRetentionPolicy(join(f.parent, 'bad.json'), { targetBytes: 1, keepIndefinitely: true })).rejects.toThrow('Choose');
});
it('shares a repository target across old/new configuration profiles rather than granting each profile a separate allowance', async () => {
  const f = await fixture(true); f.policy.history = { mode: 'target', maxBytes: Number.MAX_SAFE_INTEGER };
  const initial = await prepareRetention(f), repo = initial.history.repositories.find(r => r.repositoryId === 'public/alpha')!;
  f.policy.history.repositories = [{ repositoryId: 'public/alpha', mode: 'target', maxBytes: repo.observedBytes - 1 }];
  const targeted = await prepareRetention(f);
  expect(selected(targeted)).toEqual(['alpha/heads/retired.json', 'alpha/snapshots/old0.json']);
  const result = targeted.history.repositories.find(r => r.repositoryId === 'public/alpha')!;
  expect(result.observedBytes).toBe(repo.observedBytes); expect(result.projectedOverageBytes).toBe(0);
  expect(selected(targeted).some(path => path.startsWith('alpha/nested/'))).toBe(false);
});
it('uses deterministic path tie-breaking and treats persistent control growth as part of configured targets', async () => {
  const f = await fixture(); f.policy.history = { mode: 'target', maxBytes: Number.MAX_SAFE_INTEGER };
  const sameTime = new Date('2010-01-01T00:00:00.000Z');
  await utimes(join(f.root, 'alpha/snapshots/orphan.json'), sameTime, sameTime);
  await utimes(join(f.root, 'beta/snapshots/orphan.json'), sameTime, sameTime);
  const initial = await prepareRetention(f); f.policy.history.maxBytes = initial.history.root.observedBytes - 1;
  const first = await prepareRetention(f); expect(selected(first)).toEqual(['alpha/snapshots/orphan.json']);
  await writeFile(join(f.root, '.weftlet-coordination/public-audit-receipt'), 'persistent retained control bytes');
  await expect(applyRetention(first, first.planId, f)).rejects.toThrow('stale');
  const next = await prepareRetention(f); expect(next.history.coordinationBytes).toBe(first.history.coordinationBytes + 33);
});
it('runs target/indefinite setup through the actual CLI and reports a protected-overage no-op honestly', async () => {
  const { execFile } = await import('node:child_process'), { promisify } = await import('node:util');
  const { createRequire } = await import('node:module'), { fileURLToPath, pathToFileURL } = await import('node:url');
  const f = await fixture(), cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href, run = (...args: string[]) => promisify(execFile)(process.execPath,
    ['--import', tsx, cli, 'cache', 'retention', ...args, '--json', '--quiet'], { cwd: f.parent, timeout: 30000 });
  const path = join(f.parent, 'cli.json'); await run('init', '--file', path, '--target-bytes', '0');
  const policy = JSON.parse(await readFile(path, 'utf8')); expect(policy.history).toEqual({ mode: 'target', maxBytes: 0 });
  // No declared profiles means all existing bytes are retained, even with a zero target.
  const prepared = JSON.parse((await run('prepare', '--root', f.root, '--policy', path)).stdout);
  expect(prepared.canApply).toBe(true); expect(prepared.history.root.protectedOverageBytes).toBeGreaterThan(0);
  const planPath = join(f.parent, 'cli-plan.json'); await writeFile(planPath, JSON.stringify(prepared));
  const result = JSON.parse((await run('apply', '--root', f.root, '--policy', path, '--plan', planPath, '--expect-plan', prepared.planId)).stdout);
  expect(result).toMatchObject({ status: 'complete', journalPath: null, deleted: [] });
  const indefinite = join(f.parent, 'cli-indefinite.json'); await run('init', '--file', indefinite, '--keep-indefinitely');
  expect(JSON.parse(await readFile(indefinite, 'utf8')).history).toEqual({ mode: 'indefinite' });
}, 120000);

it('releases the exact bookmark only when the last registered owner finishes, independently of graph retention', async () => {
  const f = await fixture(), scope = f.policy.activeScopes[0]!, store = f.stores.get('alpha')!;
  f.policy.history = { mode: 'target', maxBytes: Number.MAX_SAFE_INTEGER };
  f.policy.pins.push({ profile: 'alpha', snapshotId: 'current', owner: 'archive', reason: 'Replay' });
  await store.updateHead('peer', 'current');
  scope.additionalOwners = ['validation'];
  scope.completion = { snapshotId: 'current', finishedOwners: ['team'] };
  const shared = await prepareRetention(f);
  expect(shared.completions).toMatchObject([{ status: 'still-owned', remainingOwners: ['validation'], disposition: 'retain' }]);
  expect((await applyRetention(shared, shared.planId, f)).deleted).toEqual([]);

  scope.completion.finishedOwners.push('validation');
  const ready = await prepareRetention(f);
  expect(ready.canApply).toBe(true);
  expect(ready.completions).toMatchObject([{ status: 'eligible', disposition: 'candidate', remainingOwners: [],
    snapshots: expect.arrayContaining([expect.objectContaining({ path: 'alpha/snapshots/current.json', disposition: 'retain',
      retainedHeads: ['alpha/heads/peer.json'], reasons: expect.arrayContaining(['explicit-pin:archive']) })]) }]);
  expect(selected(ready)).toEqual(['alpha/heads/default.json']);
  const result = await applyRetention(ready, ready.planId, f);
  expect(result).toMatchObject({ completionReceipt: { planId: ready.planId, bookmarks: [{ snapshotId: 'current', retired: true }] } });
  expect(await store.headId('default')).toBeUndefined();
  expect(await store.headId('peer')).toBe('current');
  expect(await store.read('current')).toBeDefined();
  expect(await store.read('previous')).toBeDefined();
  expect((await prepareRetention(f)).canApply).toBe(false);
});

it('keeps advanced, physically shared and indefinite bookmarks and refuses stale completion plans', async () => {
  const f = await fixture(), scope = f.policy.activeScopes[0]!, store = f.stores.get('alpha')!;
  scope.completion = { snapshotId: 'current', finishedOwners: ['team'] };
  f.policy.history = { mode: 'indefinite' };
  expect((await prepareRetention(f)).completions).toMatchObject([{ disposition: 'retain' }]);
  f.policy.history = { mode: 'target', maxBytes: 0, repositories: [{ repositoryId: 'public/alpha', mode: 'indefinite' }] };
  expect((await prepareRetention(f)).completions).toMatchObject([{ disposition: 'retain' }]);
  f.policy.history = { mode: 'target', maxBytes: 0 };
  const ready = await prepareRetention(f);
  await store.updateHead('default', 'orphan');
  await expect(applyRetention(ready, ready.planId, f)).rejects.toThrow('stale');
  const advanced = await prepareRetention(f);
  expect(advanced.completions).toMatchObject([{ status: 'advanced', observedSnapshotId: 'orphan', disposition: 'retain' }]);
  expect(selected(advanced)).not.toContain('alpha/snapshots/orphan.json');
  scope.completion.snapshotId = 'orphan';
  await link(join(f.root, 'alpha/heads/default.json'), join(f.root, 'alias.json'));
  expect((await prepareRetention(f)).completions).toMatchObject([{ status: 'shared-file', disposition: 'retain' }]);
});

it('rejects unregistered or duplicate completion owners and excludes completion from recurring authority', async () => {
  const f = await fixture(), scope = f.policy.activeScopes[0]!;
  f.policy.history = { mode: 'target', maxBytes: 0 }; f.policy.releasedHeads = [];
  scope.completion = { snapshotId: 'current', finishedOwners: ['unregistered'] };
  expect(() => parseRetentionPolicy(f.policy)).toThrow('registered');
  scope.completion.finishedOwners = ['team', 'team'];
  expect(() => parseRetentionPolicy(f.policy)).toThrow('Duplicate');
  scope.additionalOwners = Array.from({ length: 100 }, (_, i) => 'owner-' + i);
  expect(() => parseRetentionPolicy(f.policy)).toThrow('100 registered owners');
  scope.additionalOwners.pop();
  scope.completion.finishedOwners = ['team', ...scope.additionalOwners];
  expect(() => parseRetentionPolicy(f.policy)).not.toThrow();
  const ready = await prepareRetention(f);
  expect(ready.completions).toMatchObject([{ status: 'eligible', remainingOwners: [] }]);
  await expect(maintainRetention({ ...f, expectedRoot: ready.rootId, expectedPolicy: ready.policyDigest })).rejects.toThrow('one-time');
});

it('keeps a completed bookmark in an active comparison workspace and reports the blocking lease', async () => {
  const f = await fixture();
  const profile = 'alpha/work/compare-live', repositoryId = 'public/active';
  const store = new FileSnapshotStore(join(f.root, profile));
  await store.write(snapshot('leased', repositoryId));
  await store.updateHead('active', 'leased');
  await writeFile(join(f.root, profile, 'lease.json'), '{"pid":123,"startedAt":"2000-01-01"}');
  f.policy.profiles.push({ path: profile, repositoryId, owner: 'team', reason: 'Active comparison' });
  f.policy.activeScopes.push({ profile, head: 'active', owner: 'team', reason: 'Public fixture',
    completion: { snapshotId: 'leased', finishedOwners: ['team'] } });
  f.policy.history = { mode: 'target', maxBytes: 0 };
  const report = await planRetention(f);
  expect(report.readyForReview).toBe(false);
  expect(report.completions).toMatchObject([{ status: 'leased', disposition: 'retain' }]);
  expect(report.issues).toContainEqual({ code: 'activity-requires-coordination', path: profile + '/lease.json' });
  expect(await store.headId('active')).toBe('leased');
});
