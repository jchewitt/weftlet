import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, link, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { sha256, type GraphSnapshot } from '@weftlet/core';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { planRetention, checkRetentionPlan } from '../src/storage/retention/plan.js';
import { emptyRetentionPolicy, parseRetentionPolicy, type RetentionPolicy } from '../src/storage/retention/policy.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-retention-')); roots.push(root);
  const cache = join(root, 'cache'), store = new FileSnapshotStore(join(cache, 'profile'));
  const publish = async (id: string, head?: string) => {
    const snapshot: GraphSnapshot = { manifest: { schemaVersion: 1, repositoryId: 'public/demo', ref: 'HEAD', commitSha: 'a'.repeat(40),
      snapshotId: id, configurationDigest: 'b'.repeat(64), contentDigest: sha256(id), scope: ['src'],
      ontologyVersion: 'test', extractorVersions: {}, semanticModel: 'none', semanticPromptVersion: 'test',
      generatedAt: '2026-11-17T00:00:00.000Z', semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
      facts: [], invariants: [], runtimeEvidence: [], unresolved: [], diagnostics: [] };
    await store.write(snapshot); if (head) await store.updateHead(head, id);
  };
  for (const id of ['current', 'previous', 'pinned', 'expired', 'orphan', 'old', 'legacy']) await publish(id);
  await store.updateHead('default', 'current'); await store.updateHead('retired', 'old'); await store.updateHead('legacy', 'legacy');
  await mkdir(join(cache, 'profile/artifacts/semantic'), { recursive: true });
  await writeFile(join(cache, 'profile/artifacts/semantic/key.json'), '{"raw":"public retained artifact"}');
  await writeFile(join(cache, 'inventory.json'), '{"snapshots":["orphan"]}');
  const policy: RetentionPolicy = { schemaVersion: 1,
    profiles: [{ path: 'profile', repositoryId: 'public/demo', owner: 'maintainer', reason: 'Development cache' }],
    activeScopes: [{ profile: 'profile', head: 'default', previousSnapshotId: 'previous', owner: 'team', reason: 'Active development' }],
    releasedHeads: [{ profile: 'profile', head: 'retired', snapshotId: 'old', owner: 'team', reason: 'Closed scope' }],
    pins: [{ profile: 'profile', snapshotId: 'pinned', owner: 'reviewer', reason: 'Exact reproduction' },
      { profile: 'profile', snapshotId: 'expired', owner: 'reviewer', reason: 'Temporary investigation', expiresAt: '2026-11-16T00:00:00.000Z' }] };
  return { root, cache, store, publish, policy };
}
const now = new Date('2026-11-17T00:00:00.000Z');
async function fingerprints(root: string) {
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  return Object.fromEntries(await Promise.all(files.filter(f => f.isFile()).map(async f => {
    const path = join(f.parentPath, f.name); return [relative(root, path), sha256(await readFile(path))];
  })));
}
it('plans declared current/previous/pin protection, explicit head retirement and superseded graphs without changing files', async () => {
  const f = await fixture(), before = await fingerprints(f.cache);
  const unmanaged = await planRetention({ root: f.cache, policy: emptyRetentionPolicy(), now });
  expect(unmanaged.totals.candidateFiles).toBe(0);
  const plan = await planRetention({ root: f.cache, policy: f.policy, now });
  expect(plan.readyForReview).toBe(true); expect(plan.canApply).toBe(false);
  const candidates = plan.objects.filter(o => o.disposition === 'candidate').map(o => o.path);
  expect(candidates).toEqual(['profile/heads/retired.json', 'profile/snapshots/expired.json', 'profile/snapshots/old.json', 'profile/snapshots/orphan.json']);
  expect(plan.objects.find(o => o.path === 'profile/snapshots/old.json')!.removeBefore).toEqual(['profile/heads/retired.json']);
  for (const id of ['current', 'previous', 'pinned', 'legacy']) expect(plan.objects.find(o => o.path === `profile/snapshots/${id}.json`)!.disposition).toBe('retain');
  expect(plan.objects.find(o => o.path === 'inventory.json')!.disposition).toBe('retain');
  expect(plan.objects.find(o => o.category === 'semantic-artifact')!.disposition).toBe('retain');
  expect(plan.pins.map(p => p.state)).toEqual(['protected', 'expired']);
  expect(plan.totals.candidateLogicalBytes).toBe(plan.objects.filter(o => o.disposition === 'candidate').reduce((n, o) => n + o.logicalBytes, 0));
  expect(await fingerprints(f.cache)).toEqual(before);
  expect((await f.store.readHead('default'))!.manifest.snapshotId).toBe('current');
});
it('binds the entire saved report, policy, exact head bytes and filesystem observations in stale-plan checks', async () => {
  const f = await fixture();
  const options = { root: f.cache, policy: f.policy, now };
  const saved = JSON.parse(JSON.stringify(await planRetention(options)));
  expect((await checkRetentionPlan(saved, { ...options, now: new Date(now.getTime() + 1000) })).unchanged).toBe(true);
  await expect(checkRetentionPlan({ ...saved, canApply: true }, options)).rejects.toThrow('edited');
  const changed = structuredClone(f.policy); changed.profiles[0]!.reason = 'Reviewed again';
  expect((await checkRetentionPlan(saved, { ...options, policy: changed })).unchanged).toBe(false);
  // Same target, changed metadata bytes: the plan still becomes stale.
  await writeFile(join(f.cache, 'profile/heads/retired.json'), '{"snapshotId":"old","note":"changed"}');
  expect((await checkRetentionPlan(saved, options)).unchanged).toBe(false);
  await f.publish('new', 'retired');
  const advanced = await planRetention(options);
  expect(advanced.readyForReview).toBe(false);
  expect(advanced.issues).toContainEqual({ code: 'released-head-advanced', path: 'profile/heads/retired.json' });
  expect(advanced.objects.find(o => o.path === 'profile/heads/retired.json')!.disposition).toBe('retain');
});
it('retains hard links and unknown objects, refuses linked roots and blocks possible activity or incomplete scans', async () => {
  const f = await fixture();
  await link((await f.store.file('orphan'))!, join(f.root, 'outside-hardlink.json'));
  await link(join(f.cache, 'profile/heads/retired.json'), join(f.root, 'outside-head.json'));
  const plan = await planRetention({ root: f.cache, policy: f.policy, now });
  expect(plan.objects.find(o => o.path.endsWith('/orphan.json'))!.reasons).toContain('shared-file-links');
  expect(plan.objects.find(o => o.path.endsWith('/old.json'))!.reasons).toContain('retained-head-reference');
  expect(plan.readyForReview).toBe(false);
  await mkdir(join(f.cache, 'profile/work/compare-old'), { recursive: true });
  await writeFile(join(f.cache, 'profile/work/compare-old/lease.json'), '{"pid":999999,"startedAt":"2000-01-01"}');
  const leased = await planRetention({ root: f.cache, policy: f.policy, now });
  expect(leased.issues.some(i => i.code === 'activity-requires-coordination')).toBe(true);
  expect((await planRetention({ root: f.cache, policy: f.policy, now, maxEntries: 2 })).readyForReview).toBe(false);
  const linkRoot = join(f.root, 'linked'); await symlink(f.cache, linkRoot, process.platform === 'win32' ? 'junction' : 'dir');
  expect((await planRetention({ root: linkRoot, policy: f.policy, now })).readyForReview).toBe(false);
});
it('tracks explicit expiry transitions without treating every old object as disposable', async () => {
  const f = await fixture();
  f.policy.pins[1]!.expiresAt = '2026-11-18T00:00:00.000Z';
  const options = { root: f.cache, policy: f.policy, now };
  const saved = await planRetention(options);
  expect(saved.objects.find(o => o.path.endsWith('/expired.json'))!.disposition).toBe('retain');
  expect((await checkRetentionPlan(saved, { ...options, now: new Date('2026-11-19T00:00:00.000Z') })).unchanged).toBe(false);
  f.policy.pins[0]!.snapshotId = 'absent';
  expect((await planRetention(options)).readyForReview).toBe(false);
  await writeFile(join(f.cache, 'profile/snapshots/corrupt.json'), '{broken');
  expect((await planRetention(options)).issues.some(i => i.code === 'invalid-cache-object')).toBe(true);
});
it('rejects undeclared references, conflicting head dispositions, unsafe profiles, unknown fields and ambiguous expiry', async () => {
  const f = await fixture();
  for (const path of ['../escape', '/absolute', 'C:/other', 'a/../b', 'a\\b']) {
    const policy = structuredClone(f.policy); policy.profiles[0]!.path = path;
    expect(() => parseRetentionPolicy(policy)).toThrow();
  }
  expect(() => parseRetentionPolicy({ ...f.policy, budget: 10 })).toThrow('Unknown');
  expect(() => parseRetentionPolicy({ ...f.policy, profiles: [...f.policy.profiles, { ...f.policy.profiles[0]!, path: 'PROFILE' }] })).toThrow('Duplicate');
  const conflict = structuredClone(f.policy); conflict.releasedHeads[0]!.head = 'default';
  expect(() => parseRetentionPolicy(conflict)).toThrow('one active');
  const invalid = structuredClone(f.policy); invalid.pins[0]!.expiresAt = '2026-02-30T00:00:00.000Z';
  expect(() => parseRetentionPolicy(invalid)).toThrow('expiry');
  invalid.pins[0]!.expiresAt = undefined; invalid.activeScopes[0]!.profile = 'unknown';
  expect(() => parseRetentionPolicy(invalid)).toThrow('undeclared');
});
