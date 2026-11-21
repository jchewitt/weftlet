import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, openSync, statfsSync, writeSync } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ContextGraphHydrator } from '../../src/application/hydrator.js';
import { ScipTypeScriptIndexer } from '../../src/extraction/static.js';
import { withManagedCacheAccess } from '../../src/storage/coordination/managed-access.js';
import { enableCacheCoordination } from '../../src/storage/coordination/managed-root.js';
import { emptyRetentionPolicy } from '../../src/storage/retention/policy.js';
import { prepareRetention } from '../../src/storage/retention/prepared.js';
import { withSavedScipIndex } from '../../src/storage/shared-scip.js';
import { requireFreeSpace } from '../../src/storage/transfer-files.js';
import { traversalApplication, traversalFixture } from '../../tests/fixtures/traversal.js';

// The calling workflow creates this private disposable mount in a no-network container.
// Never allocate a filler on the checkout, host cache, general temp dir or shared memory.
const mount = '/weftlet-capacity-fixture';
assert.equal(process.platform, 'linux');
assert.equal(await realpath(mount), mount);
assert.ok((await readFile('/proc/self/mountinfo', 'utf8')).split('\n').some(line =>
  line.split(' ')[4] === mount && line.includes(' - tmpfs ')));
const initial = statfsSync(mount);
const capacity = initial.blocks * initial.bsize;
assert.equal(initial.type, 0x01021994);
assert.equal(capacity, 16 * 1024 ** 2);
const root = join(mount, 'cache'), filler = join(mount, 'filler');
await mkdir(root); // Require a fresh mount for this invocation.
const f = await traversalFixture();
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
try {
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  const config = { ...f.config, storageScope: 'workspace' as const, storagePath: join(root, 'pipeline') };
  const app = traversalApplication(f, config, true);
  const hydrator = new ContextGraphHydrator({ ...app.dependencies,
    staticIndexer: new ScipTypeScriptIndexer(config.scip, app.storage, 'shared-v1') });
  const first = await hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
  const m = first.snapshot.manifest;
  const snapshotSha = () => withManagedCacheAccess([root], async () =>
    digest(await readFile((await app.store.file(m.snapshotId))!)));
  const before = await snapshotSha();
  const policy = emptyRetentionPolicy();
  policy.profiles.push({path:'pipeline', repositoryId:config.repositoryId, owner:'fixture', reason:'capacity test'});
  policy.activeScopes.push({profile:'pipeline', head:'default', owner:'fixture', reason:'retained head'});
  policy.history = {mode:'target', maxBytes:1};
  const prepared = await prepareRetention({root,policy});
  assert.ok(prepared.canApply && prepared.history.root.protectedOverageBytes > 0);
  assert.equal(prepared.history.selectedSnapshotFiles, 0);
  await assert.rejects(requireFreeSpace(root, 1), /free-disk safety floor/);
  let availableAtPublish = -1, strictValidation = false;
  await assert.rejects(hydrator.hydrate({ref:'HEAD', headName:'default', snapshotSuffix:'actual-full-volume',
    onProgress(event) {
      if (event.phase === 'validate-shacl') strictValidation = true;
      if (event.phase !== 'publish-snapshot') return;
      assert.ok(strictValidation);
      const fd = openSync(filler, 'wx');
      try {
        // Allocate physical pages. A sparse truncate would leave the mount writable.
        const chunk = Buffer.alloc(initial.bsize);
        const free = statfsSync(mount).bavail;
        for (let i=0; i<free; i++) assert.equal(writeSync(fd, chunk), chunk.length);
      } finally { closeSync(fd); }
      const measured = statfsSync(mount);
      availableAtPublish = measured.bavail * measured.bsize;
      assert.equal(availableAtPublish, 0);
    } }), {code:'ENOSPC'});
  assert.equal(availableAtPublish, 0);
  await rm(filler);
  assert.deepEqual(await readdir(join(app.storage, 'work')), []);
  assert.deepEqual(await readdir(join(root, 'compiler-operations-v1')), []);
  assert.equal((await app.store.readHeadManifest('default'))?.snapshotId, m.snapshotId);
  assert.equal(await snapshotSha(), before);
  assert.equal(await withSavedScipIndex(app.storage, m, async h => digest(await h.readFile())), m.scipIndexDigest);
  process.stdout.write(JSON.stringify({ capacity, availableAtPublish, realEnospc:true, strictValidation,
    protectedOverage:prepared.history.root.protectedOverageBytes, preservedSnapshot:before,
    preservedIndex:m.scipIndexDigest, retainedFacts:first.snapshot.facts.length })+'\n');
} finally { await rm(f.root,{recursive:true,force:true}); }
