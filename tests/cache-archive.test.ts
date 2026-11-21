import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { persistedJsonDigest } from '@weftlet/core';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { mkdtemp, mkdir, rm, readFile, writeFile, lstat, readdir } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { traversalFixture, traversalApplication } from './fixtures/traversal.js';
import { cacheInspectionRoots } from '../src/application/cache-inspection/context.js';
import { checkCutover, createArchive, restoreArchive } from '../src/application/cache-relocation/transfer.js';
import { planArchive } from '../src/application/cache-relocation/plan.js';
import { resolveStorageRoot, resolveSemanticStorageRoots } from '../src/configuration/cache.js';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { ContextGraphHydrator } from '../src/application/hydrator.js';
import { ScipTypeScriptIndexer } from '../src/extraction/static.js';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { publishScipReference, withSavedScipIndex } from '../src/storage/shared-scip.js';
import { emptyRetentionPolicy } from '../src/storage/retention/policy.js';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })));
});
it('verifies an exact cold restore, original heads, reused semantics and raw shared index before user-wide cutover', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'weftlet-relocate-'));
  roots.push(parent);
  const source = join(parent, 'source'),
    destination = join(parent, 'restored'),
    archive = join(parent, 'archive');
  await mkdir(source);
  const f = await traversalFixture();
  roots.push(f.root);
  const config = { ...f.config, storageScope: 'user' as const };
  await f.save(config);
  vi.stubEnv('WEFTLET_USER_CACHE_ROOT', source);
  vi.stubEnv('WEFTLET_SCIP_STORAGE', 'shared-v1');
  vi.stubEnv('WEFTLET_SNAPSHOT_FORMAT', 'brotli-v1');
  await enableCacheCoordination(source, { acknowledgeQuiescence: true });
  const app = traversalApplication(f, config, true);
  const hydrator = new ContextGraphHydrator({
    ...app.dependencies,
    staticIndexer: new ScipTypeScriptIndexer(config.scip, app.storage, 'shared-v1'),
  });
  const request = { ref: 'HEAD', headName: 'default' };
  const first = (await hydrator.hydrate(request)).snapshot.manifest;
  const second = (await hydrator.hydrate({ ...request, snapshotSuffix: 'another' })).snapshot.manifest;
  const policy = emptyRetentionPolicy();
  policy.profiles.push({
    path: basename(app.storage),
    repositoryId: config.repositoryId,
    owner: 'public',
    reason: 'cache migration',
  });
  await mkdir(join(source, 'empty-profile'));
  policy.profiles.push({
    path: 'empty-profile',
    repositoryId: 'another',
    owner: 'public',
    reason: 'previously retained',
  });
  policy.pins.push({ profile: basename(app.storage), snapshotId: first.snapshotId, owner: 'public', reason: 'audit' });
  const options = { root: source, policy, includeColdSemantic: true, configs: [f.configPath] };
  const plan = await planArchive(options);
  const unrelated = join(source, 'semantic-artifacts-v1', 'unrelated-partition', 'artifacts', 'semantic');
  const semanticFile = plan.files.find((f) => f.path.includes('/artifacts/semantic/'))!;
  const requiredFile = join(source, semanticFile.path);
  const semanticBytes = await readFile(requiredFile);
  await mkdir(unrelated, { recursive: true });
  await writeFile(join(unrelated, basename(requiredFile)), semanticBytes);
  const scoped = await planArchive(options);
  expect(scoped.files.some((f) => f.path.includes('unrelated-partition'))).toBe(false);
  expect(scoped.excluded).toContainEqual({ category: 'semantic-artifact', count: 1, bytes: semanticBytes.byteLength });
  await rm(requiredFile);
  await expect(planArchive(options)).rejects.toThrow('omit required semantic artifacts');
  await writeFile(requiredFile, semanticBytes);
  await rm(join(source, 'semantic-artifacts-v1', 'unrelated-partition'), { recursive: true });
  expect(plan.generations).toHaveLength(2);
  expect(plan.generations.every((g) => g.index === 'shared')).toBe(true);
  await createArchive(options, archive, plan.planId);
  const interrupted = join(parent, 'interrupted');
  const child = `
    import fs from 'node:fs/promises';
    import {syncBuiltinESMExports} from 'node:module';
    const [archive,target,id]=process.argv.slice(1);
    const rename=fs.rename;
    fs.rename=async (source,dest)=>{
      if (String(dest)===target) process.exit(84);
      return rename(source,dest);
    };
    syncBuiltinESMExports();
    const {restoreArchive}=await import('./src/application/cache-relocation/transfer.ts');
    await restoreArchive(archive,target,id);
  `;
  await expect(
    promisify(execFile)(process.execPath, [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      child,
      archive,
      interrupted,
      plan.planId,
    ]),
  ).rejects.toMatchObject({ code: 84 });
  await expect(lstat(interrupted)).rejects.toMatchObject({ code: 'ENOENT' });
  const heldLock = (await readdir(parent)).find((n) => n.startsWith('.weftlet-transfer-'))!;
  expect(JSON.parse(await readFile(join(parent, heldLock, 'owner.json'), 'utf8')).target).toEqual(interrupted);
  await expect(restoreArchive(archive, interrupted, plan.planId)).rejects.toThrow('Another transfer owns');
  const copied = await restoreArchive(archive, destination, plan.planId);
  expect(copied.restoredSnapshots).toBe(2);
  const cutover = await checkCutover(options, destination, plan.planId, true);
  expect(cutover.environment.WEFTLET_USER_CACHE_ROOT).toBe(destination);
  // Archived evidence is scoped. A detached shared reference still matters for whole-root routing.
  await publishScipReference(app.storage, { ...first, snapshotId: 'detached' });
  const detached = await planArchive(options);
  expect(detached.excluded.some((f) => f.category === 'unreconciled-lifecycle')).toBe(true);
  await expect(checkCutover(options, destination, detached.planId, true)).rejects.toThrow('Whole-cache cutover');
  const oldSemantic = resolveSemanticStorageRoots(f.root, config).primary;
  vi.stubEnv('WEFTLET_USER_CACHE_ROOT', destination);
  expect(await cacheInspectionRoots()).toEqual([destination]);
  const restoredProfile = resolveStorageRoot(f.root, config);
  expect(relative(destination, restoredProfile)).toBe(relative(source, app.storage));
  expect(relative(destination, resolveSemanticStorageRoots(f.root, config).primary)).toBe(
    relative(source, oldSemantic),
  );
  const restored = new FileSnapshotStore(restoredProfile);
  expect((await restored.readHead('default'))?.manifest.snapshotId).toBe(second.snapshotId);
  expect((await restored.read(first.snapshotId))?.manifest.contentDigest).toBe(first.contentDigest);
  expect(await withSavedScipIndex(restoredProfile, first, (h) => h.readFile())).toEqual(
    await withSavedScipIndex(app.storage, first, (h) => h.readFile()),
  );
  const replay = traversalApplication(f, config, true);
  expect((await replay.hydrate()).semanticExtracted).toBe(0);
  // A changed archived payload refuses a fresh destination; neither live root is evicted.
  const file = join(archive, 'data', plan.files[0]!.path);
  await writeFile(file, Buffer.concat([await readFile(file), Buffer.from('corrupt')]));
  await expect(restoreArchive(archive, join(parent, 'bad'), plan.planId)).rejects.toThrow();
  expect((await app.store.read(first.snapshotId))?.manifest.contentDigest).toBe(first.contentDigest);
}, 120_000);

it('rejects an archive manifest that changes the inspection root even when its plan hash matches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'weftlet-archive-manifest-'));
  roots.push(dir);
  const body = {
    format: 'weftlet-cache-archive-v1',
    policy: emptyRetentionPolicy(),
    files: [],
    generations: [],
    payloadBytes: 0,
    limits: { maxEntries: 1000, maxBytes: 1000, roots: [dir], verify: false },
  };
  const planId = persistedJsonDigest(body);
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ ...body, planId }));
  await expect(restoreArchive(dir, dir + '-restore', planId)).rejects.toThrow('Invalid archive inventory limits');
});
