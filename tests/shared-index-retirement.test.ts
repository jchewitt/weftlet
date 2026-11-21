import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { bytes, scipMigrationFixture } from './fixtures/scip-migration.js';
import { prepareRetention } from '../src/storage/retention/prepared.js';
import { applyRetention } from '../src/storage/retention/apply.js';
import { prepareIndexMigration, applyIndexMigration } from '../src/storage/retention/index-migration.js';
import { prepareSharedRetirement, applySharedRetirement } from '../src/storage/retention/shared-index-retirement.js';
import { planRecovery } from '../src/storage/recovery/plan.js';
import { applyRecovery } from '../src/storage/recovery/apply.js';
import { withSavedScipIndex, publishScipReference, storeScipBlob } from '../src/storage/shared-scip.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true, maxRetries: 5 })));
});
async function fixture() {
  const f = await scipMigrationFixture(roots);
  const a = await f.add('a', 'first'),
    b = await f.add('b', 'second');
  const migration = await prepareIndexMigration(f);
  await applyIndexMigration(migration, migration.planId, f);
  f.policy.retireCompanionIndexes = true;
  return { ...f, a, b };
}
async function removeGraphs(f: Awaited<ReturnType<typeof fixture>>) {
  const p = await prepareRetention(f);
  expect(p.canApply).toBe(true);
  expect((await applyRetention(p, p.planId, f)).status).toBe('complete');
}
it('keeps a blob protected across profiles and reclaims it once after the last reviewed graph retires', async () => {
  const f = await fixture();
  const second = f.policy.profiles.pop()!;
  await removeGraphs(f);
  const p = await prepareSharedRetirement(f);
  expect(p.issues).toEqual([]);
  expect(p.entries.map((e) => e.name)).toEqual(['reference.json']);
  await applySharedRetirement(p, p.planId, f);
  expect(await withSavedScipIndex(f.b.path, f.b.manifest, (h) => h.readFile())).toEqual(bytes);
  f.policy.profiles.push(second);
  await removeGraphs(f);
  const last = await prepareSharedRetirement(f);
  expect(last.entries.map((e) => e.name)).toEqual(['reference.json', 'index.scip']);
  await writeFile(join(f.root, 'unknown.lock'), '');
  await expect(applySharedRetirement(last, last.planId, f)).rejects.toThrow('blocked');
  await rm(join(f.root, 'unknown.lock'));
  const renewed = await prepareSharedRetirement(f);
  await applySharedRetirement(renewed, renewed.planId, f);
  expect(await readdir(join(f.root, 'scip-blobs-v1'))).toEqual([]);
  expect(await readdir(join(f.root, 'scip-retirements-v1'))).toEqual([]);
  expect((await prepareSharedRetirement(f)).entries).toEqual([]);
  await storeScipBlob(f.b.path, f.b.manifest.scipIndexDigest, bytes);
  await publishScipReference(f.b.path, f.b.manifest);
  expect(await withSavedScipIndex(f.b.path, f.b.manifest, (h) => h.readFile())).toEqual(bytes);
});
it.each([false, true])('recovers a partial retirement with republication=%s', async (republish) => {
  const f = await fixture();
  await removeGraphs(f);
  const p = await prepareSharedRetirement(f);
  expect(p.canApply).toBe(true);
  const input = join(f.parent, 'plan.json');
  await writeFile(input, JSON.stringify({ root: f.root, policy: f.policy, p }));
  const code = `
    import fs from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';
    const {root,policy,p}=JSON.parse(await fs.readFile(process.argv[1]));
    const original=fs.unlink; fs.unlink=async path=>{
      if(String(path).includes('.retiring-')) {await original(path);process.exit(83);}
      return original(path);
    };syncBuiltinESMExports();
    const {applySharedRetirement}=await import('./src/storage/retention/shared-index-retirement.ts');
    await applySharedRetirement(p,p.planId,{root,policy});
  `;
  await expect(
    promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, input]),
  ).rejects.toMatchObject({ code: 83 });
  const recovery = await planRecovery(f);
  expect(recovery.canApply).toBe(true);
  await applyRecovery(recovery, recovery.planId, { ...f, acknowledgeQuiescence: true });
  if (republish) {
    await f.add('a', 'first');
    await publishScipReference(f.a.path, f.a.manifest);
  }
  const fresh = await prepareSharedRetirement(f);
  expect(fresh.issues).toEqual([]);
  await applySharedRetirement(fresh, fresh.planId, f);
  if (republish) expect(await withSavedScipIndex(f.a.path, f.a.manifest, (h) => h.readFile())).toEqual(bytes);
  else expect(await readdir(join(f.root, 'scip-blobs-v1'))).toEqual([]);
});

it('keeps a retirement proof while a legacy-only graph still uses the same digest', async () => {
  const f = await fixture();
  const legacy = await f.add('b', 'legacy');
  f.policy.pins.push({ profile: 'b', snapshotId: 'legacy', reason: 'confirmed evidence', owner: 'fixture' });
  await removeGraphs(f);
  const p = await prepareSharedRetirement(f);
  expect(p.entries.map((e) => e.name)).toEqual(['reference.json', 'reference.json']);
  await applySharedRetirement(p, p.planId, f);
  expect(await withSavedScipIndex(legacy.path, legacy.manifest, (h) => h.readFile())).toEqual(bytes);
  expect(await readdir(join(f.root, 'scip-retirements-v1'))).toHaveLength(1);
  f.policy.pins = [];
  await removeGraphs(f);
  const last = await prepareSharedRetirement(f);
  expect(last.entries.map((e) => e.name)).toEqual(['index.scip']);
  await applySharedRetirement(last, last.planId, f);
  expect(await readdir(join(f.root, 'scip-retirements-v1'))).toEqual([]);
});

it('distinguishes two retirements of the same logical generation while a peer holds the blob', async () => {
  const f = await fixture(),
    other = f.policy.profiles.pop()!;
  for (let i = 0; i < 2; i++) {
    await removeGraphs(f);
    const p = await prepareSharedRetirement(f);
    expect(p.issues).toEqual([]);
    expect(p.entries.map((e) => e.name)).toEqual(['reference.json']);
    await applySharedRetirement(p, p.planId, f);
    if (!i) {
      await f.add('a', 'first');
      await publishScipReference(f.a.path, f.a.manifest);
    }
  }
  f.policy.profiles.push(other);
  await removeGraphs(f);
  const p = await prepareSharedRetirement(f);
  expect(p.issues).toEqual([]);
  expect(p.entries.map((e) => e.name)).toEqual(['reference.json', 'index.scip']);
  await applySharedRetirement(p, p.planId, f);
});

it('respects new indefinite root and repository policies for already retired generations', async () => {
  const f = await fixture();
  await removeGraphs(f);
  f.policy.history = { mode: 'indefinite' };
  expect((await prepareSharedRetirement(f)).entries).toEqual([]);
  f.policy.history = { mode: 'target', maxBytes: 1, repositories: [{ repositoryId: 'public/b', mode: 'indefinite' }] };
  const p = await prepareSharedRetirement(f);
  expect(p.issues).toEqual([]);
  expect(p.entries.map((e) => e.directory)).toEqual(['a/scip/refs-v1/first.ref']);
  await applySharedRetirement(p, p.planId, f);
  expect(await withSavedScipIndex(f.b.path, f.b.manifest, (h) => h.readFile())).toEqual(bytes);
});

it('a failed graph unlink cannot authorize collecting references when another removal later succeeds', async () => {
  const f = await fixture();
  const selected = await prepareRetention(f);
  let count = 0;
  const held = { ...f.policy, retireCompanionIndexes: false };
  const partial = await applyRetention(selected, selected.planId, {
    ...f,
    readPolicy: async () => (++count < 3 ? f.policy : held),
  });
  expect(partial.status).toBe('partial');
  expect(partial.deleted).toEqual([]);
  const normal = await prepareRetention({ ...f, policy: held });
  expect((await applyRetention(normal, normal.planId, { ...f, policy: held })).status).toBe('complete');
  const gc = await prepareSharedRetirement(f);
  expect(gc.entries).toEqual([]);
});

it('requires offline recovery evidence when the process exits after unlinking the original graph', async () => {
  const f = await fixture();
  const plan = await prepareRetention(f);
  const input = join(f.parent, 'interrupted.json');
  await writeFile(input, JSON.stringify({ root: f.root, policy: f.policy, plan }));
  const child = `
    import fs from 'node:fs/promises';
    import {syncBuiltinESMExports} from 'node:module';
    const {root,policy,plan}=JSON.parse(await fs.readFile(process.argv[1]));
    const unlink=fs.unlink;
    fs.unlink=async file=>{
      await unlink(file);
      if(String(file).endsWith('first.json')) process.exit(84);
    };
    syncBuiltinESMExports();
    const {applyRetention}=await import('./src/storage/retention/apply.ts');
    await applyRetention(plan,plan.planId,{root,policy});
  `;
  await expect(
    promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', child, input]),
  ).rejects.toMatchObject({ code: 84 });
  const recovery = await planRecovery(f);
  expect(recovery.canApply).toBe(true);
  await applyRecovery(recovery, recovery.planId, { ...f, acknowledgeQuiescence: true });
  const approved = await prepareSharedRetirement(f);
  expect(approved.issues).toEqual([]);
  expect(approved.entries.map((e) => e.directory)).toEqual(['a/scip/refs-v1/first.ref']);
  await applySharedRetirement(approved, approved.planId, f);
  expect(await withSavedScipIndex(f.b.path, f.b.manifest, (h) => h.readFile())).toEqual(bytes);
});
