import { copyFile, link, mkdir, mkdtemp, readFile, realpath, rename, rm, unlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { sha256, type GraphSnapshot } from '@weftlet/core';
import { physicalArtifactKey } from '../src/infrastructure/artifact-paths.js';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { emptyRetentionPolicy, parseRetentionPolicy } from '../src/storage/retention/policy.js';
import { planRetention } from '../src/storage/retention/plan.js';
import { prepareRetention } from '../src/storage/retention/prepared.js';
import { applyRetention } from '../src/storage/retention/apply.js';
import { maintainRetention } from '../src/storage/retention/maintenance.js';
import { removalJournal } from '../src/storage/retention/journal.js';
import { planRecovery } from '../src/storage/recovery/plan.js';
import { applyRecovery } from '../src/storage/recovery/apply.js';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5 });
});
const payload = Buffer.alloc(8192, 'i');
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'weftlet-index-')));
  roots.push(root);
  const profile = join(root, 'repo');
  await mkdir(join(profile, 'scip'), { recursive: true });
  const store = new FileSnapshotStore(profile);
  const policy = emptyRetentionPolicy();
  policy.profiles.push({ path: 'repo', repositoryId: 'public/study', owner: 'team', reason: 'fixture' });
  async function add(id: string, digest = sha256(payload)) {
    const manifest = { schemaVersion: 1, repositoryId: 'public/study', snapshotId: id, commitSha: 'a'.repeat(40),
      contentDigest: sha256(id), scipIndexDigest: digest };
    await store.write({ manifest, facts: [], invariants: [], unresolved: [], runtimeEvidence: [] } as unknown as GraphSnapshot);
    await writeFile(join(profile, 'scip', physicalArtifactKey(id) + '.scip'), payload);
  }
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  return { root, profile, store, policy, add };
}
type Plan = Awaited<ReturnType<typeof prepareRetention>>;
const candidates = (plan: Plan) => plan.objects.filter(o => o.disposition === 'candidate').map(o => o.path).sort();

it('selects a verified pair toward the byte target, preserving same-content protected and newer generations', async () => {
  const f = await fixture();
  vi.stubEnv('WEFTLET_SNAPSHOT_FORMAT', 'brotli-v1');
  for (const id of ['old', 'newer', 'previous', 'current', 'pinned']) await f.add(id);
  for (const id of ['previous', 'current']) await f.store.updateHead('default', id);
  await f.store.updateHead('retired', 'old');
  f.policy.activeScopes.push({ profile: 'repo', head: 'default', owner: 'team', reason: 'active scope' });
  f.policy.releasedHeads.push({ profile: 'repo', head: 'retired', snapshotId: 'old', owner: 'team', reason: 'closed' });
  f.policy.pins.push({ profile: 'repo', snapshotId: 'pinned', owner: 'team', reason: 'audit' });
  await utimes(join(f.profile, 'snapshots/old.json'), new Date(0), new Date(0));
  f.policy.history = { mode: 'target', maxBytes: Number.MAX_SAFE_INTEGER };
  const before = await prepareRetention(f);
  f.policy.history.maxBytes = before.history.root.observedBytes - payload.length;
  const legacy = await prepareRetention(f);
  expect(candidates(legacy)).toContain('repo/snapshots/newer.json');
  expect(candidates(legacy).some(path => path.endsWith('.scip'))).toBe(false);
  f.policy.retireCompanionIndexes = true;
  const plan = await prepareRetention(f);
  expect(plan.canApply).toBe(true);
  expect(candidates(plan)).toEqual(['repo/heads/retired.json', 'repo/scip/old.scip', 'repo/snapshots/old.json']);
  expect(plan.objects.find(o => o.path === 'repo/scip/old.scip')).toMatchObject({
    logicalBytes: payload.length, sha256: sha256(payload), removeBefore: ['repo/snapshots/old.json'],
  });
  expect((await planRetention(f)).history).toEqual(plan.history);
  const removal = await applyRetention(plan, plan.planId, f);
  expect(removal.deleted).toEqual(['repo/heads/retired.json', 'repo/snapshots/old.json', 'repo/scip/old.scip']);
  expect(removal.deletedLogicalBytes).toBe(plan.history.root.selectedBytes);
  for (const id of ['newer', 'previous', 'current', 'pinned']) {
    expect((await f.store.read(id))?.manifest.scipIndexDigest).toBe(sha256(payload));
    expect((await readFile(join(f.profile, 'scip', id + '.scip'))).equals(payload)).toBe(true);
  }
});

it('retains mismatches, orphans, shared files and ambiguous legacy names; supports a unique legacy file', async () => {
  const f = await fixture(), legacy = 'long'.repeat(33), ambiguous = 'amb'.repeat(44);
  f.policy.retireCompanionIndexes = true;
  for (const id of ['shared', 'missing', legacy, ambiguous]) await f.add(id);
  await f.add('mismatch', sha256('another index'));
  await f.add('no-digest', '');
  const scip = join(f.profile, 'scip');
  await writeFile(join(scip, 'orphan.scip'), payload);
  await link(join(scip, 'shared.scip'), join(f.root, 'shared-copy'));
  await unlink(join(scip, 'missing.scip'));
  await rename(join(scip, physicalArtifactKey(legacy) + '.scip'), join(scip, legacy + '.scip'));
  await copyFile(join(scip, physicalArtifactKey(ambiguous) + '.scip'), join(scip, ambiguous + '.scip'));
  const alternate = 'case'.repeat(34);
  await f.add(alternate);
  await copyFile(join(scip, physicalArtifactKey(alternate) + '.scip'), join(scip, alternate.toUpperCase() + '.scip'));
  const duplicate = 'dup'.repeat(44);
  await f.add(duplicate);
  await copyFile(join(f.profile, 'snapshots', physicalArtifactKey(duplicate) + '.json'), join(f.profile, 'snapshots', duplicate + '.json'));
  const plan = await prepareRetention(f);
  expect(plan.canApply).toBe(true);
  expect(candidates(plan).filter(p => p.endsWith('.scip'))).toEqual(['repo/scip/' + legacy + '.scip']);
  const result = await applyRetention(plan, plan.planId, f);
  expect(result.status).toBe('complete');
  for (const name of ['shared', 'orphan', 'mismatch', 'no-digest', ambiguous, physicalArtifactKey(ambiguous), physicalArtifactKey(alternate), alternate.toUpperCase(), physicalArtifactKey(duplicate)]) {
    expect((await readFile(join(scip, name + '.scip'))).equals(payload)).toBe(true);
  }
});

it('requires fresh authorization for recurring cleanup and rejects changed index bytes before deleting a snapshot', async () => {
  const f = await fixture(); await f.add('old');
  f.policy.history = { mode: 'target', maxBytes: 0 };
  const prior = await prepareRetention(f);
  f.policy.retireCompanionIndexes = true;
  await expect(maintainRetention({ ...f, expectedRoot: prior.rootId, expectedPolicy: prior.policyDigest })).rejects.toThrow('expect-policy');
  const reviewed = await prepareRetention(f);
  const path = join(f.profile, 'scip/old.scip');
  await writeFile(path, Buffer.alloc(payload.length, 'x'));
  await expect(applyRetention(reviewed, reviewed.planId, f)).rejects.toThrow('stale');
  expect(await f.store.read('old')).toBeDefined();
  await writeFile(path, payload);
  f.policy.history = { mode: 'indefinite' };
  expect(candidates(await prepareRetention(f))).toEqual([]);
  f.policy.history = { mode: 'target', maxBytes: 0 };
  const run = () => maintainRetention({ ...f, expectedRoot: reviewed.rootId, expectedPolicy: reviewed.policyDigest });
  expect((await run()).removal.deleted).toEqual(['repo/snapshots/old.json', 'repo/scip/old.scip']);
  expect((await run()).removal.journalPath).toBeNull();
  expect(() => parseRetentionPolicy({ ...f.policy, retireCompanionIndexes: 'true' })).toThrow('boolean');
});

it('reconciles an interruption between a bounded-name snapshot and its index without replaying the unlink', async () => {
  const f = await fixture(), id = 'generation-'.repeat(16);
  await f.add(id); f.policy.retireCompanionIndexes = true;
  const plan = await prepareRetention(f);
  const snapshot = plan.objects.find(o => o.category === 'snapshot' && o.disposition === 'candidate')!;
  const index = plan.objects.find(o => o.category === 'scip-index' && o.disposition === 'candidate')!;
  const journal = await removalJournal(plan, async () => {});
  await journal.append({ event: 'unlink-intent', path: snapshot.path, sha256: snapshot.sha256 });
  await unlink(join(f.root, snapshot.path));
  await journal.append({ event: 'unlinked', path: snapshot.path });
  await journal.close();
  const recovery = await planRecovery(f);
  expect(recovery.canApply).toBe(true);
  expect(recovery.journals[0]!.candidates).toEqual(expect.arrayContaining([
    { path: snapshot.path, state: 'absent', recordedUnlink: true },
    { path: index.path, state: 'retained-matching', recordedUnlink: false },
  ]));
  await applyRecovery(recovery, recovery.planId, { ...f, acknowledgeQuiescence: true });
  expect(candidates(await prepareRetention(f))).toEqual([]);
  expect((await readFile(join(f.root, index.path))).equals(payload)).toBe(true);
});

it('blocks removal on ambiguous manifest ownership even when the last digest matches', async () => {
  const f = await fixture(); await f.add('old');
  f.policy.retireCompanionIndexes = true;
  const path = join(f.profile, 'snapshots/old.json');
  const json = (await readFile(path, 'utf8')).replace('"scipIndexDigest":', '"scipIndexDigest":"conflict","scipIndexDigest":');
  await writeFile(path, json);
  const plan = await prepareRetention(f);
  expect(plan.issues).toContainEqual({ code: 'invalid-cache-object', path: 'repo/snapshots/old.json' });
  expect(plan.canApply).toBe(false);
  await expect(applyRetention(plan, plan.planId, f)).rejects.toThrow('blocked');
  expect(await readFile(path, 'utf8')).toBe(json);
});

it('preserves a legacy index alias potentially owned by a pinned case-variant generation', async () => {
  const f = await fixture(), id = 'scope'.repeat(28), variant = id.toUpperCase();
  await f.add(id); await f.add(variant);
  f.policy.retireCompanionIndexes = true;
  f.policy.pins.push({ profile: 'repo', snapshotId: variant, owner: 'team', reason: 'audit' });
  const scip = join(f.profile, 'scip');
  await rename(join(scip, physicalArtifactKey(id) + '.scip'), join(scip, id + '.scip'));
  await unlink(join(scip, physicalArtifactKey(variant) + '.scip'));
  const plan = await prepareRetention(f);
  expect(candidates(plan)).toEqual(['repo/snapshots/' + physicalArtifactKey(id) + '.json']);
  expect((await applyRetention(plan, plan.planId, f)).status).toBe('complete');
  expect(await f.store.read(variant)).toBeDefined();
  expect((await readFile(join(scip, id + '.scip'))).equals(payload)).toBe(true);
});

it('reconciles an index unlinked after durable intent and blocks a changed surviving file', async () => {
  const f = await fixture();
  await f.add('retired'); f.policy.retireCompanionIndexes = true;
  const plan = await prepareRetention(f);
  const snapshot = plan.objects.find(o => o.category === 'snapshot' && o.disposition === 'candidate')!;
  const index = plan.objects.find(o => o.category === 'scip-index' && o.disposition === 'candidate')!;
  const journal = await removalJournal(plan, async () => {});
  await journal.append({ event: 'unlink-intent', path: snapshot.path, sha256: snapshot.sha256 });
  await unlink(join(f.root, snapshot.path));
  await journal.append({ event: 'unlinked', path: snapshot.path });
  await journal.append({ event: 'unlink-intent', path: index.path, sha256: index.sha256 });
  await journal.close();
  await writeFile(join(f.root, index.path), 'changed');
  expect((await planRecovery(f)).canApply).toBe(false);
  await unlink(join(f.root, index.path));
  const recovery = await planRecovery(f);
  expect(recovery.canApply).toBe(true);
  expect(recovery.journals[0]!.candidates).toContainEqual({ path: index.path, state: 'absent', recordedUnlink: false });
  await applyRecovery(recovery, recovery.planId, { ...f, acknowledgeQuiescence: true });
  expect(candidates(await prepareRetention(f))).toEqual([]);
});
