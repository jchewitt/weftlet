import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, statfs, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GraphFact, SnapshotManifest } from '@weftlet/core';
import { SnapshotImpactQueryService } from '../../src/graph/query.js';
import { physicalArtifactKey } from '../../src/infrastructure/artifact-paths.js';
import { largeTypeScriptProject } from '../../tests/fixtures/large-typescript-project.js';

const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const file = 'src/module-0.ts';
function indexRef(m: SnapshotManifest) {
  return { repository: m.repositoryId, commit: m.commitSha, snapshotId: m.snapshotId,
    graphDigest: m.contentDigest, indexDigest: m.scipIndexDigest };
}
function deletedDefinition(f: GraphFact) {
  return f.predicate === 'definedBy' && f.object.id === 'component:file:' + file &&
    /\bstage1\b/.test(f.subject.label);
}
async function usage(paths: string[]) {
  const stats = await Promise.all(paths.map(p => stat(p)));
  return { files: paths.length, logicalBytes: stats.reduce((n, s) => n + s.size, 0),
    allocatedBytes: stats.reduce((n, s) => n + s.blocks * 512, 0) };
}
async function timed<T>(fn: () => Promise<T>) {
  const start = performance.now();
  const result = await fn();
  return { result, ms: Number((performance.now() - start).toFixed(2)) };
}

// Single-process, disposable experiment. Each generation keeps its original graph and manifest.
async function study() {
  const { app, root, git } = await largeTypeScriptProject(8, 40);
  try {
    assert.equal(app.storageRoot, join(root, '.context-graph'));
    const candidate = await mkdtemp(join(tmpdir(), 'weftlet-index-sharing-'));
    try {
      const refs = join(candidate, 'refs'), blobs = join(candidate, 'blobs');
      await Promise.all([mkdir(refs), mkdir(blobs)]);
      const indexName = (m: SnapshotManifest) => physicalArtifactKey(m.snapshotId) + '.scip';
      const legacyDir = join(app.storageRoot, 'scip');
      const legacy = (m: SnapshotManifest) => join(legacyDir, indexName(m));
      const ref = (m: SnapshotManifest) => join(refs, physicalArtifactKey(m.snapshotId) + '.json');
      const blob = (m: SnapshotManifest) => join(blobs, m.scipIndexDigest + '.scip');
      async function sharedRead(m: SnapshotManifest) {
        assert.deepEqual(JSON.parse(await readFile(ref(m), 'utf8')), indexRef(m));
        const bytes = await readFile(blob(m));
        assert.equal(digest(bytes), m.scipIndexDigest, 'index integrity');
        return bytes;
      }
      function scan(m: SnapshotManifest) {
        return new SnapshotImpactQueryService(app.snapshotStore, 'default').scan({
          snapshotId: m.snapshotId, changedFiles: [file], maxDepth: 3, maxFacts: 60 });
      }
      const versions = [];
      for (const phase of ['initial', 'document-edit', 'delete-function']) {
        if (phase !== 'initial') {
          const path = phase === 'document-edit' ? 'docs/rule-0.md' : file;
          if (phase === 'document-edit') await appendFile(join(root, path), '\nPublic index sharing study.\n');
          else {
            const src = await readFile(join(root, file), 'utf8');
            const edited = src.replace(/^export function stage1\(.*\n/m, '');
            assert.notEqual(edited, src);
            await writeFile(join(root, file), edited);
          }
          await git('add', path);
          await git('-c', 'user.name=Public fixture', '-c', 'user.email=fixture@example.invalid',
            '-c', 'commit.gpgsign=false', 'commit', '-qm', phase);
        }
        const { snapshot } = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
        const m = snapshot.manifest;
        assert.equal(m.commitSha, await git('rev-parse', 'HEAD'));
        const oldRead = await timed(async () => {
          const bytes = await readFile(legacy(m));
          assert.equal(digest(bytes), m.scipIndexDigest);
          return bytes;
        });
        const baseline = await timed(() => scan(m));
        assert.equal(baseline.result.facts.length, 60);
        try { await writeFile(blob(m), oldRead.result, { flag: 'wx' }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        await writeFile(ref(m), JSON.stringify(indexRef(m)), { flag: 'wx' });
        const newRead = await timed(() => sharedRead(m));
        assert(oldRead.result.equals(newRead.result));
        const definitions = snapshot.facts.filter(deletedDefinition);
        assert.equal(definitions.length > 0, phase !== 'delete-function');
        versions.push({ phase, m, definitions, baseline, facts: snapshot.facts.length,
          oldReadMs: oldRead.ms, sharedReadMs: newRead.ms, snapshotHash: digest(await readFile((await app.snapshotStore.file(m.snapshotId))!)) });
      }
      const [first, second, last] = versions;
      assert(first && second && last);
      assert.equal(first.m.scipIndexDigest, second.m.scipIndexDigest);
      assert.notEqual(second.m.scipIndexDigest, last.m.scipIndexDigest);
      const names = async (dir: string) => (await readdir(dir)).map(name => join(dir, name));
      const blobCount = (await names(blobs)).length;
      assert.equal(blobCount, 2);
      const perVersion = await usage(versions.map(v => legacy(v.m)));
      const shared = await usage([...await names(blobs), ...await names(refs)]);
      assert.equal(new Set(versions.map(v => v.m.snapshotId)).size, 3);
      // Remove the original directory from the fixture cache for every replay.
      const offline = join(candidate, 'originals-outside-cache');
      await rename(legacyDir, offline);
      await assert.rejects(stat(legacyDir), { code: 'ENOENT' });
      const originalBytes = (m: SnapshotManifest) => readFile(join(offline, indexName(m)));
      const timings = [];
      for (const v of versions) {
        const replay = await timed(() => scan(v.m));
        assert.deepEqual(replay.result, v.baseline.result);
        timings.push({ phase: v.phase, facts: v.facts, boundedPageFacts: replay.result.facts.length,
          verifiedOriginalIndexMs: v.oldReadMs, verifiedSharedIndexMs: v.sharedReadMs,
          originalScanMs: v.baseline.ms, replayScanMs: replay.ms });
      }
      // Retire one experiment-owned reference. Sweep only the disposable, single-writer blob directory.
      async function retire(m: SnapshotManifest) {
        await unlink(ref(m));
        const live = new Set<string>();
        for (const p of await names(refs)) live.add(JSON.parse(await readFile(p, 'utf8')).indexDigest + '.scip');
        for (const name of await readdir(blobs)) if (!live.has(name)) await unlink(join(blobs, name));
      }
      await retire(first.m);
      await assert.rejects(sharedRead(first.m), { code: 'ENOENT' });
      for (const v of [second, last]) {
        assert((await sharedRead(v.m)).equals(await originalBytes(v.m)));
        const saved = await app.snapshotStore.read(v.m.snapshotId);
        assert.deepEqual(saved?.facts.filter(deletedDefinition), v.definitions);
        assert.deepEqual(await scan(v.m), v.baseline.result);
      }
      for (const v of versions) assert.equal(digest(await readFile((await app.snapshotStore.file(v.m.snapshotId))!)), v.snapshotHash);
      await retire(second.m);
      await assert.rejects(readFile(blob(first.m)), { code: 'ENOENT' });
      assert((await sharedRead(last.m)).equals(await originalBytes(last.m)));
      assert.deepEqual(await scan(last.m), last.baseline.result);
      // Check same-length corruption using the isolated prototype after measuring.
      const corrupt = await readFile(blob(last.m));
      corrupt[0] = corrupt[0]! ^ 1;
      await writeFile(blob(last.m), corrupt);
      await assert.rejects(sharedRead(last.m), /index integrity/);
      return { platform: process.platform, node: process.version, filesystemType: '0x' + (await statfs(candidate)).type.toString(16),
        modules: 8, functionsPerModule: 40,
        snapshots: versions.length, uniqueBlobs: blobCount, perVersion, shared, timings,
        historicalPagesEqual: true, survivingDefinitionAndCitationsPreserved: true, snapshotBytesUnchanged: true };
    } finally { await rm(candidate, { recursive: true, force: true }); }
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5 }); }
}
console.log(JSON.stringify(await study(), null, 2));
