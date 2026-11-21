import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { largeTypeScriptProject } from '../../tests/fixtures/large-typescript-project.js';
import { createContextGraphApplication } from '../../src/application/application.js';
import { exportSnapshot } from '../../src/application/delivery/export.js';
import { importSnapshot } from '../../src/application/delivery/import.js';
import { SnapshotImpactQueryService } from '../../src/graph/query.js';
import { withManagedCacheAccess } from '../../src/storage/coordination/managed-access.js';
import { enableCacheCoordination } from '../../src/storage/coordination/managed-root.js';
import { prepareIndexMigration, applyIndexMigration } from '../../src/storage/retention/index-migration.js';
import { emptyRetentionPolicy } from '../../src/storage/retention/policy.js';
import { withSavedScipIndex } from '../../src/storage/shared-scip.js';
import { measureFiles } from './native-allocation.js';

const output = process.argv[2];
assert.ok(output, 'provide a new report filename');
const checkout = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const execute = promisify(execFile);
async function indexUsage(root: string) {
  const measurement = await measureFiles(root);
  const index = measurement.files.filter(file => file.path.startsWith('scip/') || file.path.startsWith('scip-blobs-v1/'));
  const totals = (files: typeof index) => ({
    count: files.length, logical: files.reduce((sum, f) => sum + f.bytes, 0),
    allocated: files.reduce((sum, f) => sum + f.allocated, 0),
  });
  return { ...measurement, index: totals(index), all: totals(measurement.files) };
}

process.env.WEFTLET_SNAPSHOT_FORMAT = 'json';
process.env.WEFTLET_SCIP_STORAGE = 'per-snapshot';
const src = await largeTypeScriptProject(8, 40);
const temporary = await mkdtemp(join(tmpdir(), 'weftlet-migration-'));
try {
  const storage = src.app.storageRoot;
  await mkdir(storage, { recursive: true });
  await enableCacheCoordination(storage, { acknowledgeQuiescence: true });
  const hydrate = () => src.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
  const commit = (message: string) => src.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-qam', message);
  const first = (await hydrate()).snapshot, firstManifest = first.manifest;
  await appendFile(join(src.root, 'docs/rule-0.md'), '\nPublic migration study.\n');
  await commit('Edit an owner document');
  const second = (await hydrate()).snapshot.manifest;
  assert.equal(second.scipIndexDigest, firstManifest.scipIndexDigest);
  const module = join(src.root, 'src/module-0.ts');
  await writeFile(module, (await readFile(module, 'utf8')).replace(/^export function stage1\(.*\n/m, ''));
  await commit('Delete one exported function');
  const third = (await hydrate()).snapshot.manifest;
  assert.notEqual(third.scipIndexDigest, firstManifest.scipIndexDigest);

  const request = { snapshotId: firstManifest.snapshotId, changedFiles: ['src/module-0.ts'], maxDepth: 3, maxFacts: 60 };
  const page = (app: typeof src.app) => new SnapshotImpactQueryService(app.snapshotStore, 'default').scan(request);
  const graphBytes = (app: typeof src.app, id: string) => withManagedCacheAccess([app.storageRoot], async () =>
    readFile((await app.snapshotStore.file(id))!));
  const originalPage = await page(src.app);
  assert.equal(originalPage.facts.length, 60);
  const manifests = [firstManifest, second, third];
  const originalHashes = await Promise.all(manifests.map(async m => digest(await graphBytes(src.app, m.snapshotId))));
  const policy = emptyRetentionPolicy();
  policy.profiles.push({ path: '.', repositoryId: firstManifest.repositoryId, owner: 'public', reason: 'migration study' });
  const options = { root: storage, policy };
  const before = await indexUsage(storage);
  const plan = await prepareIndexMigration(options);
  assert.ok(plan.canApply, JSON.stringify(plan.issues));
  assert.equal(plan.groups.length, 1);
  const migrated = await applyIndexMigration(plan, plan.planId, options);
  assert.equal(migrated.status, 'complete');
  assert.equal(migrated.legacyCopiesRemoved, 2);
  const after = await indexUsage(storage);
  assert.equal(before.index.count, 3);
  assert.equal(after.index.count, 4); // one distinct legacy index, one shared blob and two references
  assert.equal(before.index.logical - after.index.logical, plan.projectedLogicalSavings);
  assert.ok(before.index.allocated > after.index.allocated, 'shared layout must reclaim measured index allocation');
  for (const [i, m] of manifests.entries()) {
    assert.equal(digest(await graphBytes(src.app, m.snapshotId)), originalHashes[i]);
    assert.equal(await withSavedScipIndex(storage, m, async h => digest(await h.readFile())), m.scipIndexDigest);
  }
  assert.deepEqual(await page(src.app), originalPage);

  const configName = 'context-graph.config.json', bundle = join(temporary, 'bundle');
  const exported = await exportSnapshot(join(src.root, configName), {
    snapshotId: firstManifest.snapshotId, output: bundle, includeSemantic: true,
  });
  assert.equal(digest(await readFile(join(bundle, 'snapshot.json'))), originalHashes[0]);
  const receiver = join(temporary, 'receiver');
  await execute('git', ['clone', '--quiet', '--no-hardlinks', src.root, receiver]);
  process.env.WEFTLET_SNAPSHOT_FORMAT = 'brotli-v1';
  process.env.WEFTLET_SCIP_STORAGE = 'shared-v1';
  const config = join(receiver, configName), destination = join(receiver, '.context-graph');
  await mkdir(destination);
  await enableCacheCoordination(destination, { acknowledgeQuiescence: true });
  const imported = await importSnapshot(config, { input: bundle, expectDigest: exported.manifestSha256, includeSemantic: true });
  assert.ok(imported.strictValidation && imported.evidenceState.stale && !imported.activated);
  assert.equal(imported.semanticArtifacts, firstManifest.semanticArtifactKeys.length);
  const recipient = await createContextGraphApplication(config);
  assert.deepEqual(await page(recipient), originalPage);
  assert.equal(await recipient.snapshotStore.headId('default'), undefined);
  assert.deepEqual(await recipient.snapshotStore.read(firstManifest.snapshotId), JSON.parse(JSON.stringify(first)));
  for (const name of ['scip', 'scip-blobs-v1']) await assert.rejects(lstat(join(destination, name)), { code: 'ENOENT' });
  const compact = await graphBytes(recipient, firstManifest.snapshotId);
  assert.equal(compact.subarray(0, 8).toString(), 'WEFTBR1\n');
  // Use only the disposable receiving checkout. A fresh adapter would fail on any cache miss.
  await execute('git', ['checkout', '--quiet', '--detach', firstManifest.commitSha], { cwd: receiver });
  await writeFile(join(receiver, 'provider.mjs'), "export function createSemanticExtractor(){return {identity:'public-corpus-prose:1',async extract(){throw Error('expected cache hit')}}}\n");
  const repeatApp = await createContextGraphApplication(config);
  const repeat = await repeatApp.hydrator.hydrate({ ref:'HEAD', headName:'default' });
  assert.equal(repeat.semanticExtracted, 0);
  assert.equal(repeat.semanticReused, firstManifest.semanticArtifactKeys.length);
  assert.equal(repeat.snapshot.manifest.snapshotId, firstManifest.snapshotId);
  assert.equal(repeat.snapshot.manifest.contentDigest, firstManifest.contentDigest);
  assert.equal(await withSavedScipIndex(destination, firstManifest, async h => digest(await h.readFile())), firstManifest.scipIndexDigest);
  assert.deepEqual(await page(repeatApp), originalPage);
  assert.deepEqual(await graphBytes(repeatApp, firstManifest.snapshotId), compact);

  await writeFile(resolve(output), JSON.stringify({ checkout, platform:process.platform, node:process.version,
    before, after, measuredIndexAllocationSaved:before.index.allocated - after.index.allocated,
    projectedLogicalSavings:plan.projectedLogicalSavings, historicalSnapshotDigest:firstManifest.contentDigest,
    snapshotHashes:originalHashes, strictImported:imported.strictValidation, historical:imported.evidenceState.stale,
    matchedQueryFacts:originalPage.facts.length, semanticReused:repeat.semanticReused, semanticExtracted:repeat.semanticExtracted,
  }, null, 2) + '\n', {flag:'wx'});
} finally { await Promise.all([src.root, temporary].map(dir => rm(dir, {recursive:true,force:true,maxRetries:5}))); }
