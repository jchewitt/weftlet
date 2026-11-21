import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, truncate, copyFile, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { bytes, scipMigrationFixture } from './fixtures/scip-migration.js';
import { applyIndexMigration, prepareIndexMigration } from '../src/storage/retention/index-migration.js';
import { withSavedScipIndex } from '../src/storage/shared-scip.js';
import { withManagedCacheAccess } from '../src/storage/coordination/managed-access.js';
import { applyRecovery } from '../src/storage/recovery/apply.js';
import { planRecovery } from '../src/storage/recovery/plan.js';
import { previewIndexSharing } from '../src/storage/retention/index-sharing-preview.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5 }); });

it('migrates reviewed net-positive groups through the CLI while preserving current, previous and pinned graph and index bytes', async () => {
  const f = await scipMigrationFixture(roots);
  const a = await f.add('a', 'old'), b = await f.add('a', 'current'), c = await f.add('b', 'long'.repeat(40));
  const singleton = await f.add('b', 'unique', Buffer.from('one'));
  await a.store.updateHead('default', 'old'); await a.store.updateHead('default', 'current');
  f.policy.pins.push({ profile: 'b', snapshotId: c.manifest.snapshotId, owner: 'team', reason: 'audit' });
  const graphs = await Promise.all([a,b,c].map(m => readFile(m.graph)));
  const policy = join(f.parent, 'policy.json'), planPath = join(f.parent, 'review.json');
  await writeFile(policy, JSON.stringify(f.policy));
  const cli = async (op: string, ...args: string[]) => JSON.parse((await promisify(execFile)(process.execPath, [
    '--import', 'tsx', 'src/cli.ts', 'cache', 'retention', op, '--root', f.root, '--policy', policy, '--json', '--quiet', ...args])).stdout);
  const plan = await cli('prepare-index-migration');
  expect(plan.canApply).toBe(true);
  expect(plan.groups).toHaveLength(1);
  await writeFile(planPath, JSON.stringify(plan));
  const result = await cli('apply-index-migration', '--plan', planPath, '--expect-plan', plan.planId);
  expect(result).toMatchObject({ status: 'complete', legacyCopiesRemoved: 3, legacyLogicalBytesRemoved: bytes.length * 3 });
  expect(await readdir(join(f.root, 'scip-blobs-v1'))).toEqual([a.manifest.scipIndexDigest]);
  for (const [i,m] of [a,b,c].entries()) {
    await expect(readFile(m.index)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await withSavedScipIndex(m.path, m.manifest, h => h.readFile())).toEqual(bytes);
    expect(await readFile(m.graph)).toEqual(graphs[i]);
  }
  expect(await a.store.readHeadState('default')).toMatchObject({ snapshotId: 'current', previousSnapshotId: 'old' });
  expect(await readFile(singleton.index)).toEqual(Buffer.from('one'));
  expect((await prepareIndexMigration(f)).groups).toHaveLength(0);
  await expect(applyIndexMigration(plan, plan.planId, f)).rejects.toThrow('stale');
}, 60_000);

it('refuses stale, edited, observational and blocked plans and waits for active readers', async () => {
  const f = await scipMigrationFixture(roots);
  const a = await f.add('a', 'old'); await f.add('b', 'current');
  const review = await previewIndexSharing(f);
  await expect(applyIndexMigration(review, 'none', f)).rejects.toThrow('unsupported');
  const plan = await prepareIndexMigration(f);
  await expect(applyIndexMigration({ ...plan, groups: [] }, plan.planId, f)).rejects.toThrow('edited');
  await withManagedCacheAccess([f.root], async () => {
    await expect(applyIndexMigration(plan, plan.planId, { ...f, timeoutMs: 60 })).rejects.toMatchObject({ phase: 'drain' });
  });
  await writeFile(join(f.root, 'unknown.lock'), '');
  const blocked = await prepareIndexMigration(f);
  expect(blocked.canApply).toBe(false);
  await expect(applyIndexMigration(blocked, blocked.planId, f)).rejects.toThrow('blocked');
  await unlink(join(f.root, 'unknown.lock'));
  await copyFile(a.index, a.index + '.replacement');
  await unlink(a.index); await copyFile(a.index + '.replacement', a.index);
  await expect(applyIndexMigration(plan, plan.planId, f)).rejects.toThrow('stale');
  expect(await readFile(a.index)).toEqual(bytes);
  await expect(readdir(join(f.root,'scip-blobs-v1'))).rejects.toMatchObject({code:'ENOENT'});
});

it.each(['before', 'after'])('recovers after the migration process exits %s its first unlink', async point => {
  const f = await scipMigrationFixture(roots);
  const a = await f.add('a', 'first'); const b = await f.add('b', 'second');
  const plan = await prepareIndexMigration(f);
  // Terminate a disposable child at the real filesystem boundary after the journal's durable intent.
  const code = `
    import fs from 'node:fs/promises'; import { syncBuiltinESMExports } from 'node:module';
    const [point, index, payload] = process.argv.slice(1);
    const { plan, policy, root } = JSON.parse(await fs.readFile(payload,'utf8'));
    const original = fs.unlink;
    fs.unlink = async path => {
      if (path !== index) return original(path);
      if (point === 'after') await original(path);
      process.exit(71);
    };
    syncBuiltinESMExports();
    const { applyIndexMigration } = await import('./src/storage/retention/index-migration.ts');
    await applyIndexMigration(plan, plan.planId, { root, policy });
  `;
  const file = join(f.parent, 'child.json');
  await writeFile(file, JSON.stringify({ plan, root: f.root, policy: f.policy }));
  await expect(promisify(execFile)(process.execPath, ['--import','tsx','--input-type=module','-e',code,point,a.index,file]))
    .rejects.toMatchObject({code:71});
  const blob = join(f.root, 'scip-blobs-v1', a.manifest.scipIndexDigest, 'index.scip');
  const ref = join(a.path, 'scip', 'refs-v1', 'first.ref', 'reference.json');
  const savedReference = await readFile(ref);
  await writeFile(blob, Buffer.alloc(bytes.length, 'z'));
  expect((await planRecovery(f)).canApply).toBe(false);
  await writeFile(blob, bytes);
  await unlink(ref);
  expect((await planRecovery(f)).canApply).toBe(false);
  await writeFile(ref, savedReference);
  const recover = await planRecovery(f);
  expect(recover.canApply).toBe(true);
  expect(recover.journals[0]?.candidates).toContainEqual({path:'a/scip/first.scip',
    state: point === 'before' ? 'retained-matching' : 'absent', recordedUnlink:false});
  await applyRecovery(recover, recover.planId, { ...f, acknowledgeQuiescence:true });
  expect(await withSavedScipIndex(a.path, a.manifest, h => h.readFile())).toEqual(bytes);
  expect(await readFile(b.index)).toEqual(bytes);
  const next = await prepareIndexMigration(f);
  expect((await applyIndexMigration(next, next.planId, f)).legacyCopiesRemoved).toBe(point === 'before' ? 2 : 1);
}, 60_000);

it('reserves bookkeeping space for a future interrupted migration and offline recovery', async () => {
  const f = await scipMigrationFixture(roots);
  const a = await f.add('a', 'one'); await f.add('b', 'two');
  const dir = join(f.root, '.weftlet-coordination', 'removals'); await mkdir(dir);
  for (const id of ['a','b']) {
    const receipt = join(dir, id.repeat(36) + '.jsonl');
    await writeFile(receipt, ''); await truncate(receipt, 32 * 1024 ** 2 - 256);
  }
  const plan = await prepareIndexMigration(f);
  expect(plan.issues.map(i => i.code)).toContain('insufficient-recovery-capacity');
  await expect(applyIndexMigration(plan, plan.planId, f)).rejects.toThrow('blocked');
  expect(await readFile(a.index)).toEqual(bytes);
});
