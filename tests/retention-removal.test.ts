import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, mkdir, mkdtemp, readFile, readdir, rm, writeFile, link, symlink, access, rename, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, parse } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { sha256, type GraphSnapshot } from '@weftlet/core';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { prepareRetention } from '../src/storage/retention/prepared.js';
import { applyRetention } from '../src/storage/retention/apply.js';
import { planRetention } from '../src/storage/retention/plan.js';
import { emptyRetentionPolicy } from '../src/storage/retention/policy.js';
import { coordinatedRetentionOperation } from '../src/application/retention/operations.js';

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
afterEach(async () => { hooks.unlink = undefined; hooks.sync = undefined; await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
function snapshot(id: string): GraphSnapshot {
  return { manifest: { schemaVersion: 1, repositoryId: 'public/removal', ref: 'HEAD', commitSha: 'a'.repeat(40),
    snapshotId: id, configurationDigest: 'b'.repeat(64), contentDigest: sha256(id), scope: ['src'], ontologyVersion: 'test',
    extractorVersions: {}, semanticModel: 'none', semanticPromptVersion: 'test', generatedAt: '2026-11-19T00:00:00.000Z',
    semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' }, facts: [], invariants: [], runtimeEvidence: [], unresolved: [] };
}
async function fixture() {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'weftlet-remove-'))); roots.push(parent);
  const root = join(parent, 'cache'); await mkdir(root);
  const store = new FileSnapshotStore(root);
  for (const id of ['current', 'previous', 'pinned', 'old0', 'old1', 'orphan']) await store.write(snapshot(id));
  await store.updateHead('default', 'previous'); await store.updateHead('default', 'current');
  await store.updateHead('retired', 'old0'); await store.updateHead('retired', 'old1');
  await mkdir(join(root, 'artifacts/semantic'), { recursive: true }); await mkdir(join(root, 'scip'));
  await writeFile(join(root, 'artifacts/semantic/reuse.json'), '{"expensive":"public artifact"}');
  await writeFile(join(root, 'scip/index.scip'), 'public index'); await writeFile(join(root, 'unknown'), 'retained');
  const policy = emptyRetentionPolicy();
  policy.profiles.push({ path: '.', repositoryId: 'public/removal', owner: 'team', reason: 'Development' });
  policy.activeScopes.push({ profile: '.', head: 'default', owner: 'team', reason: 'Active' });
  policy.releasedHeads.push({ profile: '.', head: 'retired', snapshotId: 'old1', owner: 'team', reason: 'Closed scope' });
  policy.pins.push({ profile: '.', snapshotId: 'pinned', owner: 'team', reason: 'Historical evidence' });
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  return { parent, root, store, policy };
}
async function evidenceBytes(root: string) {
  const paths = (await readdir(root, { recursive: true, withFileTypes: true })).filter(e => e.isFile() && !join(e.parentPath, e.name).includes('.weftlet-coordination'));
  return Object.fromEntries(await Promise.all(paths.map(async e => { const path = join(e.parentPath, e.name); return [path, sha256(await readFile(path))]; })));
}
it('prepares stable plans and permanently removes only reviewed heads/history with durable intents and retained queryable evidence', async () => {
  const f = await fixture(), before = await evidenceBytes(f.root);
  const plan = await prepareRetention(f);
  expect(plan.canApply).toBe(true); expect(plan.totals.candidateFiles).toBe(4);
  expect((await prepareRetention(f)).planId).toBe(plan.planId);
  expect(await evidenceBytes(f.root)).toEqual(before);
  const seen: string[] = [];
  hooks.unlink = async path => {
    if (!path.includes(`${join(f.root, 'heads')}`) && !path.includes(`${join(f.root, 'snapshots')}`)) return;
    const journal = (await readdir(join(f.root, '.weftlet-coordination/removals'))).find(p => p.endsWith('.jsonl'))!;
    const events = (await readFile(join(f.root, '.weftlet-coordination/removals', journal), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({ event: 'unlink-intent' }); seen.push(path);
  };
  const result = await applyRetention(plan, plan.planId, f);
  expect(result.status).toBe('complete'); expect(result.deleted).toEqual(['heads/retired.json', 'snapshots/old0.json', 'snapshots/old1.json', 'snapshots/orphan.json']);
  expect(seen[0]).toBe(join(f.root, 'heads/retired.json'));
  expect(result.deletedLogicalBytes).toBe(plan.totals.candidateLogicalBytes);
  expect(await f.store.readHead('default')).toEqual(snapshot('current'));
  expect(await f.store.read('orphan')).toBeUndefined();
  const after = await evidenceBytes(f.root);
  for (const [path, digest] of Object.entries(after)) expect(digest).toBe(before[path]);
  expect(Object.keys(after)).toHaveLength(Object.keys(before).length - 4);
  expect((await readdir(join(f.root, '.weftlet-coordination/removals'))).some(p => p.endsWith('.pending'))).toBe(false);
  await expect(applyRetention(plan, plan.planId, f)).rejects.toThrow('stale');
});
const compilerWorkspace = 'work/ontology-8c622c42-2c7c-43d2-acce-dab66402f17b/.gradle';
const gradleLocks = ['8.10.2/checksums/checksums.lock', '8.10.2/executionHistory/executionHistory.lock',
  '8.10.2/fileHashes/fileHashes.lock', 'buildOutputCleanup/buildOutputCleanup.lock']
  .map(name => compilerWorkspace + '/' + name);

async function scratchFile(root: string, name: string) {
  const path = join(root, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, 'preserved lock bytes');
  return path;
}

it('keeps the observational planner conservative and blocks unknown scratch and unresolved ownership', async () => {
  const f = await fixture();
  const paths = [gradleLocks[0]!, 'unknown-profile/' + gradleLocks[0], compilerWorkspace + '/other.LOCK',
    'work/ontology-unrecognized/.gradle/buildOutputCleanup/buildOutputCleanup.lock'];
  for (const path of paths) await scratchFile(f.root, path);
  const shared = await scratchFile(f.root, gradleLocks[1]!);
  await link(shared, join(f.root, 'additional-hardlink'));
  if (process.platform === 'win32') {
    // An undeclared historical profile may be identified through its verified snapshots.
    const history = new FileSnapshotStore(join(f.root, 'history'));
    await history.write(snapshot('one'));
    await scratchFile(f.root, 'history/' + gradleLocks[0]);
    const conflicting = snapshot('two');
    conflicting.manifest.repositoryId = 'public/other';
    await history.write(conflicting);
    paths.push('history/' + gradleLocks[0]);
  }
  paths.push(gradleLocks[1]!);
  const review = await planRetention(f);
  expect(review.issues.filter(i => i.code === 'activity-requires-coordination').map(i => i.path))
    .toEqual(expect.arrayContaining(paths));
  const held = await prepareRetention(f);
  expect(held.canApply).toBe(false);
  const blockers = held.issues.filter(i => i.code === 'activity-requires-coordination').map(i => i.path);
  expect(blockers.sort()).toEqual(paths.slice(process.platform === 'win32' ? 1 : 0).sort());
}, 30_000);

it.runIf(process.platform === 'win32')('probes idle Gradle scratch on NTFS and rechecks a real open writer before removal', async () => {
  const f = await fixture();
  const control = await prepareRetention(f);
  for (const path of gradleLocks) await scratchFile(f.root, path);
  const plan = await prepareRetention(f);
  expect(plan).toMatchObject({ canApply: true, verifiedIdleGradleLocks: 4, totals: control.totals });
  for (const path of gradleLocks) expect(plan.objects.find(o => o.path === path)).toMatchObject({
    disposition: 'retain', reasons: expect.arrayContaining(['verified-idle-gradle-scratch']),
  });
  const before = await evidenceBytes(f.root);
  const writer = await open(join(f.root, gradleLocks[0]!), 'r+');
  try {
    const active = await prepareRetention(f);
    expect(active).toMatchObject({ canApply: false, verifiedIdleGradleLocks: 3,
      issues: [{ code: 'activity-requires-coordination', path: gradleLocks[0] }] });
    expect(active.objects.find(o => o.path === gradleLocks[0])?.reasons).toContain('lock-held');
    await expect(applyRetention(plan, plan.planId, f)).rejects.toThrow('stale or blocked');
  } finally { await writer.close(); }
  expect(await evidenceBytes(f.root)).toEqual(before);
  expect((await applyRetention(plan, plan.planId, f)).status).toBe('complete');
  for (const path of gradleLocks) expect(await readFile(join(f.root, path), 'utf8')).toBe('preserved lock bytes');
}, 60_000);

it('binds historical compiler parents to unique verified snapshots in their own profile', async () => {
  const f = await fixture();
  const store = new FileSnapshotStore(f.root);
  const commit = 'a'.repeat(40), id = commit + '-graph-v2-' + 'p'.repeat(156), op = '8c622c42-2c7c-43d2-acce-dab66402f17b';
  await store.write(snapshot(commit));
  await store.write(snapshot(id));
  const lockPath = (parent: string) => 'work/ontology-' + parent + '/.gradle/' + '8.10.2/checksums/checksums.lock';
  const known = [lockPath(commit), lockPath(id + '-' + op)];
  const missing = lockPath(commit + '-unknown');
  const wrongProfile = 'missing-owner/' + lockPath(id);
  for (const path of [...known, missing, wrongProfile]) await scratchFile(f.root, path);
  const plan = await prepareRetention(f);
  const reasons = (path: string) => plan.objects.find(o => o.path === path)?.reasons;
  for (const path of known) {
    expect(reasons(path)).toContain(process.platform === 'win32' ? 'verified-idle-gradle-scratch' : 'exclusive-probe-unavailable');
    expect(await readFile(join(f.root, path), 'utf8')).toBe('preserved lock bytes');
  }
  expect(join(f.root, known[1]!).length).toBeGreaterThan(260);
  expect(reasons(missing)).toContain('unverified-historical-workspace');
  expect(reasons(wrongProfile)).toContain('unresolved-profile-owner');
  expect(plan.canApply).toBe(false);
  await store.write(snapshot(id + '-' + op));
  const ambiguous = await prepareRetention(f);
  expect(ambiguous.objects.find(o => o.path === known[1])?.reasons).toContain('ambiguous-historical-workspace');
}, 60_000);

it('keeps an explicitly attested legacy workspace recognizable when its snapshot is retired', async () => {
  const f = await fixture(), id = 'a'.repeat(40) + '-profile';
  await f.store.write(snapshot(id));
  const directory = 'ontology-' + id;
  const path = 'work/' + directory;
  const lock = path + '/.gradle/buildOutputCleanup/buildOutputCleanup.lock';
  await scratchFile(f.root, lock);
  const initial = await prepareRetention(f);
  const physicalIdentity = initial.objects.find(o => o.path === path)!.revision;
  f.policy.historicalCompilerWorkspaces = [{ profile: '.', rootId: initial.rootId, physicalIdentity, directory,
    owner: 'build-team', reason: 'Independently reviewed compiler history' }];
  const modern = structuredClone(f.policy);
  modern.historicalCompilerWorkspaces![0]!.directory = 'ontology-8c622c42-2c7c-43d2-acce-dab66402f17b';
  await expect(prepareRetention({ ...f, policy: modern })).rejects.toThrow('only for commit-derived');
  const approved = await prepareRetention(f);
  if (process.platform === 'win32') {
    expect(approved.canApply).toBe(true);
    const result = await applyRetention(approved, approved.planId, f);
    expect(result.deleted).toContain('snapshots/' + id + '.json');
  } else {
    await rm(join(f.root, 'snapshots', id + '.json'));
  }
  const after = await prepareRetention(f);
  expect(after.objects.find(o => o.path === lock)?.reasons)
    .toContain(process.platform === 'win32' ? 'verified-idle-gradle-scratch' : 'exclusive-probe-unavailable');
  expect(await readFile(join(f.root, lock), 'utf8')).toBe('preserved lock bytes');
  await rename(join(f.root, path), join(f.root, path + '-original'));
  await scratchFile(f.root, lock);
  const replaced = await prepareRetention(f);
  expect(replaced.objects.find(o => o.path === lock)?.reasons).toContain('historical-workspace-identity-changed');
}, 60_000);

it('refuses old reports, wrong acknowledgement, changed policy, altered bytes and new references before deletion', async () => {
  const f = await fixture(), before = await evidenceBytes(f.root), old = await planRetention(f), plan = await prepareRetention(f);
  await expect(applyRetention(old, old.planId, f)).rejects.toThrow('unsupported');
  await expect(applyRetention(plan, 'wrong', f)).rejects.toThrow('expect-plan');
  await expect(applyRetention({ ...plan, objects: [] }, plan.planId, f)).rejects.toThrow('edited');
  const pinned = structuredClone(f.policy); pinned.pins.push({ profile: '.', snapshotId: 'orphan', owner: 'team', reason: 'New requirement' });
  await expect(applyRetention(plan, plan.planId, { ...f, policy: pinned })).rejects.toThrow('stale');
  expect(await evidenceBytes(f.root)).toEqual(before);
  await writeFile(join(f.root, 'snapshots/orphan.json'), JSON.stringify(snapshot('orphan')) + ' ');
  await expect(applyRetention(plan, plan.planId, f)).rejects.toThrow('stale');
  const next = await prepareRetention(f); await f.store.updateHead('new-scope', 'orphan');
  await expect(applyRetention(next, next.planId, f)).rejects.toThrow('stale');
  expect(await f.store.read('orphan')).toEqual(snapshot('orphan'));
});
it('waits for an actual independent reader and refuses bounded admission without removing anything', async () => {
  const f = await fixture(), plan = await prepareRetention(f), before = await evidenceBytes(f.root);
  const module = new URL('../src/storage/coordination/managed-access.ts', import.meta.url).href;
  const ready = join(f.parent, 'ready'), release = join(f.parent, 'release');
  const child = promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `
    import { withManagedCacheAccess } from ${JSON.stringify(module)};
    import { writeFile, access } from 'node:fs/promises';
    import { setTimeout } from 'node:timers/promises';
    await withManagedCacheAccess([${JSON.stringify(f.root)}], async () => {
      await writeFile(${JSON.stringify(ready)}, 'ready');
      while (!(await access(${JSON.stringify(release)}).then(() => true, () => false))) await setTimeout(10);
    });
  `], { cwd: process.cwd(), timeout: 20_000, windowsHide: true });
  try {
    for (let i = 0; ; i++) { if (await access(ready).then(() => true, () => false)) break; if (i > 200) throw Error('Reader did not start'); await delay(10); }
    await expect(applyRetention(plan, plan.planId, { ...f, timeoutMs: 40 })).rejects.toThrow('blocked');
    expect(await evidenceBytes(f.root)).toEqual(before);
  } finally { await writeFile(release, 'done'); await child; }
  expect((await applyRetention(plan, plan.planId, f)).status).toBe('complete');
});
it('stops at head retirement failure, then safely retries the unchanged plan', async () => {
  const f = await fixture(), plan = await prepareRetention(f), before = await evidenceBytes(f.root);
  hooks.unlink = async path => { if (path.endsWith('retired.json')) throw Object.assign(Error('fixture'), { code: 'EACCES' }); };
  expect(await applyRetention(plan, plan.planId, f)).toMatchObject({ status: 'partial', deleted: [], failure: 'EACCES' });
  expect(await evidenceBytes(f.root)).toEqual(before);
  hooks.unlink = undefined;
  expect((await prepareRetention(f)).planId).toBe(plan.planId);
  expect((await applyRetention(plan, plan.planId, f)).status).toBe('complete');
});
it('records partial cancellation after retiring a head without deleting its still-present snapshots', async () => {
  const f = await fixture(), plan = await prepareRetention(f), controller = new AbortController();
  hooks.unlink = async path => { if (path.endsWith('retired.json')) controller.abort(); };
  const result = await applyRetention(plan, plan.planId, { ...f, signal: controller.signal });
  expect(result).toMatchObject({ status: 'partial', deleted: ['heads/retired.json'], failure: 'cancelled' });
  expect(await f.store.readHead('default')).toEqual(snapshot('current'));
  expect(await f.store.read('old0')).toEqual(snapshot('old0')); expect(await f.store.read('old1')).toEqual(snapshot('old1'));
});
it('keeps journal initialization/sync failure as a blocker and never unlinks without a durable intent', async () => {
  const f = await fixture(), plan = await prepareRetention(f), before = await evidenceBytes(f.root);
  hooks.sync = async path => { if (path.endsWith('.jsonl')) throw Object.assign(Error('fixture disk'), { code: 'ENOSPC' }); };
  await expect(applyRetention(plan, plan.planId, f)).rejects.toMatchObject({ code: 'ENOSPC' });
  expect(await evidenceBytes(f.root)).toEqual(before);
  hooks.sync = undefined;
  await expect(prepareRetention(f)).rejects.toThrow('incomplete removal journal');
});
it('rechecks a candidate after journaling and preserves a replaced file', async () => {
  const f = await fixture(), plan = await prepareRetention(f); let syncs = 0;
  hooks.sync = async path => { if (path.endsWith('.jsonl') && ++syncs === 2) await writeFile(join(f.root, 'heads/retired.json'), JSON.stringify({ snapshotId: 'pinned' })); };
  const result = await applyRetention(plan, plan.planId, f);
  expect(result).toMatchObject({ status: 'partial', deleted: [] });
  expect(await f.store.readHead('retired')).toEqual(snapshot('pinned'));
  expect(await f.store.read('old1')).toEqual(snapshot('old1'));
});
it('rejects unmarked roots, nested owners, external aliases and hard-link changes; retains unknown data', async () => {
  const f = await fixture(), plan = await prepareRetention(f);
  await expect(prepareRetention({ ...f, root: f.parent })).rejects.toThrow('activated');
  const alias = join(f.parent, 'alias'); await symlink(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(prepareRetention({ ...f, root: alias })).rejects.toThrow('links');
  await expect(coordinatedRetentionOperation('prepare', { root: alias, policyPath: join(f.parent, 'not-read.json') })).rejects.toThrow('links');
  await link(join(f.root, 'snapshots/orphan.json'), join(f.parent, 'outside.json'));
  await expect(applyRetention(plan, plan.planId, f)).rejects.toThrow('stale');
  const linked = await prepareRetention(f);
  expect(linked.objects.find(o => o.path === 'snapshots/orphan.json')!.disposition).toBe('retain');
  await mkdir(join(f.root, 'nested/.weftlet-coordination'), { recursive: true });
  await writeFile(join(f.root, 'nested/.weftlet-coordination/root.json'), await readFile(join(f.root, '.weftlet-coordination/root.json')));
  const nested = await prepareRetention(f); expect(nested.canApply).toBe(false);
  expect(nested.issues.some(i => i.code === 'nested-managed-owner')).toBe(true);
});
it('reads the current external policy again after admission and requires outside-cache inputs', async () => {
  const f = await fixture(), policyPath = join(f.parent, 'policy.json'), planPath = join(f.parent, 'plan.json');
  await writeFile(policyPath, JSON.stringify(f.policy));
  const plan = await prepareRetention(f); await writeFile(planPath, JSON.stringify(plan));
  const changed = structuredClone(f.policy); changed.pins.push({ profile: '.', snapshotId: 'orphan', owner: 'team', reason: 'New pin' });
  await expect(applyRetention(plan, plan.planId, { ...f, readPolicy: async () => changed })).rejects.toThrow('stale');
  const internal = join(f.root, 'policy.json'); await writeFile(internal, JSON.stringify(f.policy));
  await expect(coordinatedRetentionOperation('prepare', { root: f.root, policyPath: internal })).rejects.toThrow('outside');
});

it('refuses changed pin expiry and incomplete inventory without deleting any file', async () => {
  const f = await fixture(); f.policy.pins[0]!.expiresAt = new Date(Date.now() + 60_000).toISOString();
  const plan = await prepareRetention(f), before = await evidenceBytes(f.root);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(f.policy.pins[0]!.expiresAt!) + 1);
  try { await expect(applyRetention(plan, plan.planId, f)).rejects.toThrow('stale'); } finally { clock.mockRestore(); }
  const limited = await prepareRetention({ ...f, maxEntries: 2 });
  expect(limited.canApply).toBe(false);
  await expect(applyRetention(limited, limited.planId, f)).rejects.toThrow('blocked');
  expect(await evidenceBytes(f.root)).toEqual(before);
});
it('reports uncertain journal completion after an unlink and preserves pending state for explicit recovery', async () => {
  const f = await fixture(), plan = await prepareRetention(f); let syncs = 0;
  hooks.sync = async path => { if (path.endsWith('.jsonl') && ++syncs >= 3) throw Error('fixture journal failure'); };
  await expect(applyRetention(plan, plan.planId, f)).rejects.toThrow('outcome requires inspection');
  hooks.sync = undefined;
  expect(await f.store.readHead('retired')).toBeUndefined();
  expect(await f.store.read('old1')).toEqual(snapshot('old1'));
  expect(await f.store.readHead('default')).toEqual(snapshot('current'));
  await expect(prepareRetention(f)).rejects.toThrow('incomplete removal journal');
});
it('runs prepare/apply through the actual CLI with an external policy and explicit plan identity', async () => {
  const f = await fixture(), policyPath = join(f.parent, 'policy.json'), planPath = join(f.parent, 'prepared.json');
  await writeFile(policyPath, JSON.stringify(f.policy));
  const cli = new URL('../src/cli.ts', import.meta.url);
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const { createRequire } = await import('node:module');
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  const run = (...args: string[]) => promisify(execFile)(process.execPath, ['--import', tsx, fileURLToPath(cli), 'cache', 'retention', ...args, '--json', '--quiet'], { cwd: f.parent, timeout: 30_000 });
  const plan = JSON.parse((await run('prepare', '--root', f.root, '--policy', policyPath, '--wait-ms', '5000')).stdout);
  expect(plan.canApply).toBe(true); await writeFile(planPath, JSON.stringify(plan));
  const result = JSON.parse((await run('apply', '--root', f.root, '--policy', policyPath, '--plan', planPath, '--expect-plan', plan.planId)).stdout);
  expect(result.status).toBe('complete'); expect(result.deleted).toHaveLength(4);
  expect(await f.store.readHead('default')).toEqual(snapshot('current'));
}, 90_000);

it('removes hashed physical names without shortening logical identities or replacing absent historical IDs', async () => {
  const f = await fixture(), id = 'history-'.repeat(32);
  await f.store.write(snapshot(id));
  const plan = await prepareRetention(f);
  expect(plan.objects.some(o => o.disposition === 'candidate' && /^snapshots\/~[a-f0-9]{64}\.json$/.test(o.path))).toBe(true);
  expect((await applyRetention(plan, plan.planId, f)).status).toBe('complete');
  expect(await f.store.read(id)).toBeUndefined();
  expect(await f.store.readHead('default')).toEqual(snapshot('current'));
});
it('binds root ownership and directory identity while refusing filesystem-wide roots', async () => {
  const f = await fixture(); await mkdir(join(f.root, 'unknown-directory'));
  const plan = await prepareRetention(f), before = await evidenceBytes(f.root);
  await expect(prepareRetention({ ...f, root: parse(f.root).root })).rejects.toThrow('filesystem root');
  const descriptor = join(f.root, '.weftlet-coordination/root.json');
  const owner = JSON.parse(await readFile(descriptor, 'utf8'));
  owner.rootId = '00000000-0000-0000-0000-000000000000'; await writeFile(descriptor, JSON.stringify(owner));
  await expect(applyRetention(plan, plan.planId, f)).rejects.toThrow('stale');
  const next = await prepareRetention(f);
  await rename(join(f.root, 'unknown-directory'), join(f.parent, 'original-directory'));
  await mkdir(join(f.root, 'unknown-directory'));
  await expect(applyRetention(next, next.planId, f)).rejects.toThrow('stale');
  expect(await evidenceBytes(f.root)).toEqual(before);
});
