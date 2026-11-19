import { compareSnapshotCodecs } from './codec.js';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { largeTypeScriptProject } from '../../tests/fixtures/large-typescript-project.js';
import { profileSnapshot } from '../../src/storage/inspection/profile.js';
import { inventoryCache } from '../../src/storage/inspection/inventory.js';
import { inspectFileDigest } from '../../src/storage/inspection/read.js';

/** Public real-SCIP corpus; deterministic prose fixture, no external model calls. */
export async function storageStudy(modules: number, functions: number, compareCodecs = false) {
  const fixture = await largeTypeScriptProject(modules, functions);
  const start = performance.now();
  try {
    const { app, files } = fixture;
    const hydrated = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    const hydrateMs = Math.round(performance.now() - start);
    const path = await app.snapshotStore.file(hydrated.snapshot.manifest.snapshotId);
    assert(path);
    const before = await inspectFileDigest(path, 8 * 1024 ** 3);
    const inventoryBefore = await inventoryCache({ roots: [app.storageRoot], verify: true });
    const profileStart = performance.now();
    const profile = await profileSnapshot(path);
    const profileMs = Math.round(performance.now() - profileStart);
    const codecs = compareCodecs ? await compareSnapshotCodecs(path) : undefined;
    if (codecs) assert.equal(codecs.sourceSha256, before.sha256);
    const inventoryAfter = await inventoryCache({ roots: [app.storageRoot], verify: true });
    assert.equal(profile.sections.facts!.records, hydrated.snapshot.facts.length);
    assert.equal(profile.sha256, before.sha256);
    assert.deepEqual(inventoryAfter.objects, inventoryBefore.objects);
    assert.equal(profile.physicalBytes, before.bytes);
    assert.equal((await app.snapshotStore.read(hydrated.snapshot.manifest.snapshotId))?.manifest.contentDigest,
      hydrated.snapshot.manifest.contentDigest);
    const sourceBytes = (predicate: (path: string) => boolean) => Object.entries(files)
      .filter(([path]) => predicate(path)).reduce((sum, [, content]) => sum + Buffer.byteLength(content), 0);
    // The full local inventory contains temporary absolute paths; retain aggregate public measurements only.
    const { snapshot: _identity, ...measurements } = profile;
    return { schemaVersion: 1, corpus: { modules, functionsPerModule: functions, documents: 18,
      selectedDocumentBytes: sourceBytes(path => path.startsWith('docs/')),
      codeBytes: sourceBytes(path => /^(src|test)\//.test(path)),
      facts: hydrated.snapshot.facts.length, semanticExtracted: hydrated.semanticExtracted },
      environment: { node: process.version, platform: process.platform, arch: process.arch },
      hydrateMs, profileMs, ...(codecs ? { codecs } : {}), byClass: inventoryAfter.byClass, measurements,
      checks: { realScip: true, strictHydrationPassed: true, savedSnapshotReadable: true,
        inventoryAndSnapshotPreserved: true, externalModelCalls: 0 },
      limitations: ['Generated public corpus, not the private consumer graph; repeated source patterns influence repetition.',
        'Timings are one run on this host, not a cross-platform performance guarantee.',
        'Peak hydration memory/disk and compact-format query latency are outside this study.'] };
  } finally { await rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
