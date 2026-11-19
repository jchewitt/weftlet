import assert from 'node:assert/strict';
import { stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { largeTypeScriptProject } from '../../tests/fixtures/large-typescript-project.js';
import { FileSnapshotStore } from '../../src/storage/storage.js';
import { SnapshotImpactQueryService } from '../../src/graph/query.js';

/** Fresh query services reload the same evidence. The operating-system page cache is warm. */
export async function compareSavedQueries(modules: number, functions: number) {
  const originalFormat = process.env.WEFTLET_SNAPSHOT_FORMAT;
  const fixture = await largeTypeScriptProject(modules, functions);
  try {
    process.env.WEFTLET_SNAPSHOT_FORMAT = 'brotli-v1';
    const { snapshot } = await fixture.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    const id = snapshot.manifest.snapshotId;
    const compact = fixture.app.snapshotStore;
    process.env.WEFTLET_SNAPSHOT_FORMAT = 'json';
    const json = new FileSnapshotStore(join(fixture.root, 'uncompressed'));
    await json.write(snapshot);
    await json.updateHead('default', id);
    const request = { changedFiles: ['src/module-0.ts'], maxFacts: 60, maxDepth: 3 };
    async function measure(store: FileSnapshotStore) {
      const bytes = (await stat((await store.file(id))!)).size;
      const start = performance.now();
      assert.equal((await store.readHeadManifest('default'))?.contentDigest, snapshot.manifest.contentDigest);
      const queryStart = performance.now();
      const page = await new SnapshotImpactQueryService(store, 'default').scan(request);
      return { page, measurement: { bytes, manifestMs: Math.round(queryStart - start), scanMs: Math.round(performance.now() - queryStart) } };
    }
    const baseline = await measure(json);
    const candidate = await measure(compact);
    assert(baseline.page.facts.length);
    assert.deepEqual(candidate.page, baseline.page);
    return { modules, functions, facts: snapshot.facts.length, pageFacts: baseline.page.facts.length,
      node: process.version, platform: process.platform, json: baseline.measurement, compact: candidate.measurement,
      identicalImpactPage: true };
  } finally {
    if (originalFormat === undefined) delete process.env.WEFTLET_SNAPSHOT_FORMAT;
    else process.env.WEFTLET_SNAPSHOT_FORMAT = originalFormat;
    await rm(fixture.root, { recursive: true, force: true, maxRetries: 5 });
  }
}
