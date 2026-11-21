import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, statfs, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import type { SnapshotManifest } from '@weftlet/core';
import { ContextGraphHydrator } from '../../src/application/hydrator.js';
import { DirectRdfOntologyCompiler, OpenCaesarOntologyCompiler } from '../../src/extraction/ontology.js';
import { ScipTypeScriptIndexer } from '../../src/extraction/static.js';
import { enableCacheCoordination } from '../../src/storage/coordination/managed-root.js';
import { withManagedCacheAccess } from '../../src/storage/coordination/managed-access.js';
import { emptyRetentionPolicy } from '../../src/storage/retention/policy.js';
import { prepareRetention } from '../../src/storage/retention/prepared.js';
import { maintainRetention } from '../../src/storage/retention/maintenance.js';
import { withSavedScipIndex } from '../../src/storage/shared-scip.js';
import { requireFreeSpace } from '../../src/storage/transfer-files.js';
import { traversalApplication, traversalFixture } from '../../tests/fixtures/traversal.js';
import { measureFiles } from './native-allocation.js';

const [backend, output] = process.argv.slice(2);
assert.ok(backend === 'rdf' || backend === 'opencaesar', 'select rdf or opencaesar');
assert.ok(output, 'provide a new report filename');
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const checkout = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const parent = await mkdtemp(join(tmpdir(), 'weftlet-storage-study-'));
const f = await traversalFixture();
try {
  const root = join(parent, 'cache'), profile = 'pipeline';
  await mkdir(root);
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  const ontology = backend === 'rdf' ? f.config.ontology : {
    backend: 'opencaesar' as const, toolVersion: 'oml2owl-gradle-2.13.1', projectPath: 'ontology',
    containerImage: 'gradle:8.10.2-jdk21@sha256:963d59f7f22767da4efbcf46b661361b61af5fb88b0309da1071c4234c647eba',
  };
  if (backend === 'opencaesar') await cp(new URL('../../examples/generic-typescript/ontology', import.meta.url),
    join(f.root, 'ontology'), { recursive: true });
  const config = { ...f.config, ontology, storageScope: 'workspace' as const, storagePath: join(root, profile) };
  const app = traversalApplication(f, config, true);
  async function checkCompilerCleanup() {
    assert.deepEqual(await readdir(join(app.storage, 'work')), []);
    assert.deepEqual(await readdir(join(root, 'compiler-operations-v1')), []);
  }
  const fingerprint = (id: string) => withManagedCacheAccess([app.storage], async () => {
    const file = await app.store.file(id);
    return file && digest(await readFile(file));
  });
  const compiler = backend === 'rdf' ? new DirectRdfOntologyCompiler(app.storage)
    : new OpenCaesarOntologyCompiler(ontology, f.root, app.storage);
  const hydrator = new ContextGraphHydrator({ ...app.dependencies, ontologyCompiler: compiler,
    staticIndexer: new ScipTypeScriptIndexer(config.scip, app.storage, 'shared-v1') });
  const policy = emptyRetentionPolicy();
  policy.profiles.push({ path: profile, repositoryId: config.repositoryId, owner: 'public', reason: 'qualification' });
  policy.activeScopes.push({ profile, head: 'default', owner: 'public', reason: 'current and previous generations' });
  policy.history = {mode: 'target', maxBytes: 1};
  policy.retireCompanionIndexes = true;
  const generations: SnapshotManifest[] = [], checkpoints = [];
  const hashes = new Map<string, string>();
  let semanticHashes: string[] | undefined;
  for (let generation = 0; generation < 6; generation++) {
    await writeFile(join(f.root, 'src/generation.ts'), 'export const generation' + generation + ' = 1;\n');
    const commit = await f.commit();
    const phases: string[] = [];
    const result = await hydrator.hydrate({ ref: commit, headName: 'default', onProgress: event => phases.push(event.phase) });
    await checkCompilerCleanup();
    assert.ok(phases.includes('validate-shacl') && phases.includes('publish-snapshot'));
    assert.ok(result.snapshot.facts.length > 0 && result.snapshot.facts.some(fact => fact.provenance));
    const manifest = result.snapshot.manifest;
    assert.equal(manifest.commitSha, commit);
    assert.ok(!generations.some(g => g.scipIndexDigest === manifest.scipIndexDigest));
    assert.equal(result.semanticExtracted, generation === 0 ? manifest.semanticArtifactKeys.length : 0);
    assert.equal(result.semanticReused, generation === 0 ? 0 : manifest.semanticArtifactKeys.length);
    assert.ok(manifest.semanticArtifactKeys.length > 0);
    generations.push(manifest);
    hashes.set(manifest.snapshotId, (await fingerprint(manifest.snapshotId))!);
    if (!generation) policy.pins.push({profile, snapshotId: manifest.snapshotId, owner: 'public', reason: 'pin first generation'});
    const plan = await prepareRetention({ root, policy });
    assert.ok(plan.canApply, JSON.stringify(plan.issues));
    const maintained = await maintainRetention({ root, policy, expectedRoot: plan.rootId, expectedPolicy: plan.policyDigest });
    assert.equal(maintained.status, 'complete');
    assert.ok(maintained.history.root.protectedOverageBytes > 0);
    assert.equal((await app.store.readHeadManifest('default'))?.contentDigest, manifest.contentDigest);
    const retained = new Set([generations[0], ...generations.slice(-2)]);
    for (const graph of generations) {
      const hash = await fingerprint(graph.snapshotId);
      if (!retained.has(graph)) { assert.equal(hash, undefined); continue; }
      assert.equal(hash, hashes.get(graph.snapshotId));
      assert.equal(await withSavedScipIndex(app.storage, graph, async h => digest(await h.readFile())), graph.scipIndexDigest);
    }
    const { fileSystem, files } = await measureFiles(root);
    const semantics = await Promise.all(files.filter(f => f.path.includes('/artifacts/semantic/')).map(async f =>
      f.path + ':' + digest(await readFile(join(root, f.path)))));
    assert.equal(semantics.length, manifest.semanticArtifactKeys.length);
    if (semanticHashes) assert.deepEqual(semantics, semanticHashes); else semanticHashes = semantics;
    const snapshots = files.filter(f => f.path.includes('/snapshots/'));
    const references = files.filter(f => f.path.endsWith('.ref/reference.json'));
    const blobs = files.filter(f => f.path.startsWith('scip-blobs-v1/'));
    for (const group of [snapshots, references, blobs]) assert.equal(group.length, retained.size);
    assert.equal(files.filter(f => f.path.includes('/work/')).length, 0);
    const payload = [...snapshots, ...references, ...blobs];
    const totals = (group: typeof files) => ({
      logical: group.reduce((n, f) => n + f.bytes, 0), allocated: group.reduce((n, f) => n + f.allocated, 0),
    });
    checkpoints.push({ generation, commit, fileSystem, retainedGraphs: retained.size, facts: result.snapshot.facts.length,
      strictValidated: true, semanticExtracted: result.semanticExtracted, semanticReused: result.semanticReused,
      protectedOverage: maintained.history.root.protectedOverageBytes, payload: totals(payload), total: totals(files), files });
  }
  // Fixed-size source edits continue for three generations after crossing the pin/current/previous window.
  const plateau = checkpoints.slice(2);
  assert.equal(plateau.length, 4);
  for (const field of ['logical', 'allocated'] as const) {
    const bytes = plateau.map(row => row.payload[field]);
    assert.ok(Math.min(...bytes) > 0 && Math.max(...bytes) <= 1.05 * Math.min(...bytes), 'retained payload exceeds 5% steady-state band');
  }
  // Exercise the production disk floor against this volume without filling the runner.
  const disk = await statfs(root);
  await assert.rejects(requireFreeSpace(root, disk.bavail * disk.bsize), /free-disk safety floor/);
  assert.equal((await app.store.readHeadManifest('default'))?.contentDigest, generations.at(-1)!.contentDigest);
  // Inject one allocation failure at the immutable publication syscall, in this standalone process.
  const link = fs.link;
  let failures = 0;
  try {
    fs.link = async (from, to) => {
      if (typeof to === 'string' && dirname(to) === join(app.storage, 'snapshots')) {
        failures++;
        throw Object.assign(new Error('qualification: no space left on device'), { code: 'ENOSPC' });
      }
      return link(from, to);
    };
    syncBuiltinESMExports();
    await assert.rejects(hydrator.hydrate({ref:'HEAD', headName:'default', snapshotSuffix:'disk-full'}),
      { code:'ENOSPC' });
    assert.equal(failures, 1);
  } finally { fs.link = link; syncBuiltinESMExports(); }
  assert.equal((await app.store.readHeadManifest('default'))?.contentDigest, generations.at(-1)!.contentDigest);
  for (const graph of [generations[0]!, ...generations.slice(-2)]) {
    assert.equal(await fingerprint(graph.snapshotId), hashes.get(graph.snapshotId));
  }
  await checkCompilerCleanup();
  const afterFailure = await measureFiles(root);
  assert.deepEqual(afterFailure.files, checkpoints.at(-1)!.files);
  await writeFile(resolve(output), JSON.stringify({ checkout, node: process.version, platform: process.platform,
    backend, allocation: process.platform === 'win32' ? 'FILE_STANDARD_INFO.AllocationSize' : 'st_blocks * 512',
    transferFloorRefusedRequest: true, simulatedPublicationEnospcPropagated: true, checkpoints }, null, 2) + '\n', {flag:'wx'});
} finally { await Promise.all([f.root,parent].map(dir => rm(dir,{recursive:true,force:true,maxRetries:5}))); }
