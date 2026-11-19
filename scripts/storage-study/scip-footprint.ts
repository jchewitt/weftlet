import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { appendFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { largeTypeScriptProject } from '../../tests/fixtures/large-typescript-project.js';
import { physicalArtifactKey } from '../../src/infrastructure/artifact-paths.js';
import { inspectFileDigest } from '../../src/storage/inspection/read.js';

const intervalMs = 20;
async function measured<T>(cache: string, scratch: string, operation: () => Promise<T>) {
  const worker = new Worker(new URL('./disk-sampler.mjs', import.meta.url), { workerData: { cache, scratch, intervalMs }, execArgv: [] });
  try {
    await once(worker, 'message');
    // Wait for both writer and observer before disposing either directory on failure.
    const [observer, build] = await Promise.allSettled([
      once(worker, 'message'), operation().finally(() => worker.postMessage('stop')),
    ]);
    if (build.status === 'rejected') throw build.reason;
    if (observer.status === 'rejected') throw observer.reason;
    return { value: build.value, disk: observer.value[0] };
  } finally { await worker.terminate(); }
}

async function run(modules: number, functions: number) {
  // Use the toolkit checkout, not the temporary consumer repository, for study provenance.
  const cwd = fileURLToPath(new URL('../../', import.meta.url));
  const checkout = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const fixture = await largeTypeScriptProject(modules, functions);
  const { app, root, git } = fixture;
  const scratch = await mkdtemp(join(tmpdir(), 'weftlet-footprint-'));
  const env = { TMP: scratch, TEMP: scratch, TMPDIR: scratch, WEFTLET_SNAPSHOT_FORMAT: 'brotli-v1' };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, env);
    assert.equal(tmpdir(), scratch);
    assert.equal(app.storageRoot, join(root, '.context-graph'));
    const options = { ref: 'HEAD', headName: 'default' };
    const phases = [];
    const ids = new Set<string>();
    const indexById = new Map<string, { sha256: string; bytes: number }>();
    let original = '', docOnly = '';
    for (const phase of ['initial', 'unchanged', 'document-edit', 'code-edit', 'clean-comparison']) {
      if (phase === 'document-edit' || phase === 'code-edit') {
        const edit = phase === 'document-edit' ? 'docs/rule-0.md' : 'src/module-0.ts';
        await appendFile(join(root, edit), phase === 'document-edit' ? '\nPublic indexing measurement.\n'
          : '\nexport function extraStage(value: number) { return normalize(value); }\n');
        await git('add', edit);
        await git('-c', 'user.name=Public corpus', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', phase);
      }
      const clean = phase === 'clean-comparison';
      const previousHead = await app.snapshotStore.headId('default');
      const workDir = join(app.storageRoot, 'work');
      const beforeClean = clean ? (await readdir(workDir)).sort() : [];
      const { value: result, disk } = await measured(app.storageRoot, scratch, () => clean
        ? app.hydrator.compareClean(options) : app.hydrator.hydrate(options));
      const manifest = result.snapshot.manifest;
      if (!clean) ids.add(manifest.snapshotId);
      const finalId = await app.snapshotStore.headId('default');
      assert(finalId);
      if (phase === 'unchanged' || clean) assert.equal(finalId, previousHead);
      else assert.notEqual(finalId, previousHead);
      if (!clean) assert.equal(finalId, manifest.snapshotId);
      else {
        assert.equal(result.comparison?.originalSnapshotId, finalId);
        assert.equal(result.comparison?.temporaryOutputRemoved, true);
        assert.equal(result.semanticExtracted, 0);
        assert.deepEqual((await readdir(workDir)).sort(), beforeClean);
      }
      const indexDir = join(app.storageRoot, 'scip');
      const names = await readdir(indexDir);
      assert.deepEqual(names.sort(), [...ids].map(id => physicalArtifactKey(id) + '.scip').sort());
      const digests = new Map<string, number>();
      let indexBytes = 0;
      for (const id of ids) {
        const file = await inspectFileDigest(join(indexDir, physicalArtifactKey(id) + '.scip'), Number.MAX_SAFE_INTEGER);
        if (indexById.has(id)) assert.deepEqual(file, indexById.get(id));
        indexById.set(id, file);
        digests.set(file.sha256, file.bytes);
        indexBytes += file.bytes;
      }
      const current = indexById.get(finalId)!;
      assert.equal(current.sha256, manifest.scipIndexDigest);
      if (phase === 'initial') original = current.sha256;
      if (phase === 'unchanged') assert.equal(ids.size, 1);
      if (phase === 'document-edit') docOnly = current.sha256;
      assert.equal(disk.after.bytes.scip, indexBytes);
      assert.equal(disk.after.bytes.scratch, 0);
      assert.equal(disk.after.bytes.staging, 0);
      const uniqueBytes = [...digests.values()].reduce((a, b) => a + b, 0);
      phases.push({ phase, facts: result.snapshot.facts.length, semanticExtracted: result.semanticExtracted,
        semanticReused: result.semanticReused, retainedIndexes: names.length, uniqueIndexes: digests.size,
        indexSha256: current.sha256, indexBytes, duplicateIndexBytes: indexBytes - uniqueBytes, disk });
    }
    return { checkout, node: process.version, platform: process.platform,
      modules, functionsPerModule: functions, format: 'brotli-v1', sampleIntervalMs: intervalMs,
      documentEditIndexByteIdentical: original === docOnly, phases };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all([root, scratch].map(path => rm(path, { recursive: true, force: true, maxRetries: 5 })));
  }
}
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || !args.every(value => /^[1-9]\d*$/.test(value) && Number(value) <= 200))) {
  throw Error('Usage: tsx scripts/storage-study/scip-footprint.ts [modules 1..200 functions 1..200]');
}
console.log(JSON.stringify(await run(Number(args[0] ?? 16), Number(args[1] ?? 80)), null, 2));
