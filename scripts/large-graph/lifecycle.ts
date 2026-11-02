import assert from 'node:assert/strict';
import { constants } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { StreamParser } from 'n3';
import { largeTypeScriptProject } from '../../tests/fixtures/large-typescript-project.js';
import { physicalArtifactKey } from '../../src/infrastructure/artifact-paths.js';
import { persistedJsonDigest, stableJsonDigest, stableJson, sha256 } from '@weftlet/core';
import { RdfEvidenceGraph, CG } from '../../src/graph/rdf.js';
import type { HydrationProgressEvent } from '../../src/application/hydrator.js';

async function fileDigest(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function corpusLifecycle(modules: number, functions: number, requireLarge = false,
  progress?: (event: unknown) => void) {
  const fixture = await largeTypeScriptProject(modules, functions), { app, root, files } = fixture;
  const onProgress = (event: HydrationProgressEvent) => progress?.({ ...event, heapUsed: process.memoryUsage().heapUsed });
  try {
    let first = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default', onProgress });
    const { snapshotId, contentDigest, extractorVersions, semanticArtifactKeys } = first.snapshot.manifest;
    assert.equal(first.semanticExtracted, 18);
    const factCount = first.snapshot.facts.length;
    const factDigest = persistedJsonDigest(first.snapshot.facts);
    const logicalFactsDigest = stableJsonDigest(first.snapshot.facts.map(({ snapshotId: _, ...fact }) => fact));
    let logicalCharacters = 2 + Math.max(0, factCount - 1);
    const expectedRecords = new Map<string, string>();
    const nodeCount = new Set(first.snapshot.facts.flatMap(fact => [fact.subject.id, fact.object.id])).size;
    assert.equal(extractorVersions.assembly, 'standalone-graph-v12');
    assert(first.snapshot.facts.some(fact => fact.predicate === 'calls'));
    assert(first.snapshot.facts.some(fact => fact.object.kind === 'Evidence' && fact.provenance.path.endsWith('.spec.ts')));
    for (const fact of first.snapshot.facts) {
      const { snapshotId: _, ...logicalFact } = fact;
      logicalCharacters += stableJson(logicalFact).length;
      expectedRecords.set(fact.id, sha256(stableJson(fact)));
      assert.equal(fact.provenance.commitSha, first.snapshot.manifest.commitSha);
      assert.equal(fact.provenance.digest, sha256(files[fact.provenance.path]!));
      if (fact.extractor.id.startsWith('public-corpus')) {
        assert.equal(fact.authority, 'inferred'); assert.equal(fact.extractionReview, 'unreviewed');
      }
    }
    const path = join(app.storageRoot, 'snapshots', physicalArtifactKey(snapshotId) + '.json');
    const bytes = (await stat(path)).size, immutableDigest = await fileDigest(path);
    if (requireLarge) {
      assert(bytes > constants.MAX_STRING_LENGTH, `Snapshot must cross V8's string ceiling; got ${bytes} bytes`);
      assert(logicalCharacters > constants.MAX_STRING_LENGTH, `Canonical logical facts must cross V8's string ceiling; got ${logicalCharacters} characters`);
    }
    const artifacts = async () => {
      const directory = join(app.storageRoot, 'artifacts', 'semantic');
      return Object.fromEntries(await Promise.all((await readdir(directory)).sort().map(async name => [name, await fileDigest(join(directory, name))])));
    };
    const beforeArtifacts = await artifacts();
    let loaded = await app.snapshotStore.read(snapshotId);
    assert(loaded); assert.equal(loaded.facts.length, factCount);
    assert.equal(persistedJsonDigest(loaded.facts), factDigest);
    assert.equal(loaded.manifest.contentDigest, contentDigest);
    progress?.({ phase: 'persist-read-verified', bytes, factCount, nodeCount });
    // Export without buffering the RDF serialization, and compare every projected record.
    let graph: RdfEvidenceGraph | undefined = new RdfEvidenceGraph(loaded);
    const bounded = await graph.select(`SELECT ?record WHERE { ?fact <${CG}record> ?record }`, 3);
    assert.equal(bounded.rows.length, 3); assert.equal(bounded.truncated, true);
    const exportPath = join(app.storageRoot, 'evidence.nq');
    await graph.serializeTo(createWriteStream(exportPath));
    assert.equal(persistedJsonDigest(await graph.facts()), factDigest);
    const rdfBytes = (await stat(exportPath)).size;
    graph = undefined; loaded = undefined;
    let recordCount = 0, quadCount = 0;
    await pipeline(createReadStream(exportPath), new StreamParser({ format: 'N-Quads' }), async quads => {
      for await (const quad of quads) {
        quadCount++;
        if (quad.predicate.value === CG + 'record') {
          recordCount++;
          const record = JSON.parse(quad.object.value);
          assert.equal(sha256(quad.object.value), expectedRecords.get(record.id));
          expectedRecords.delete(record.id);
        }
      }
    });
    assert.equal(recordCount, factCount);
    assert.equal(expectedRecords.size, 0);
    progress?.({ phase: 'rdf-export-projection-verified', rdfBytes });
    // Release prior copies before another real indexing/strict validation run.
    first = undefined!;
    let repeat = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default', onProgress });
    assert.equal(repeat.semanticExtracted, 0); assert.equal(repeat.semanticReused, 18);
    assert.equal(repeat.snapshot.manifest.snapshotId, snapshotId);
    assert.equal(repeat.snapshot.manifest.contentDigest, contentDigest);
    assert.equal(persistedJsonDigest(repeat.snapshot.facts), factDigest);
    assert.equal(await fileDigest(path), immutableDigest);
    const repeatReused = repeat.semanticReused; repeat = undefined!;
    const clean = await app.hydrator.compareClean({ ref: 'HEAD', headName: 'default', onProgress });
    assert.equal(clean.semanticExtracted, 0); assert.equal(clean.semanticReused, 18);
    assert.equal(clean.snapshot.manifest.contentDigest, contentDigest);
    assert.equal(stableJsonDigest(clean.snapshot.facts.map(({ snapshotId: _, ...fact }) => fact)), logicalFactsDigest);
    assert.deepEqual(clean.snapshot.manifest.extractorVersions, extractorVersions);
    assert.deepEqual(clean.snapshot.manifest.semanticArtifactKeys, semanticArtifactKeys);
    assert.equal(await fileDigest(path), immutableDigest);
    assert.deepEqual(await artifacts(), beforeArtifacts);
    const provider = await import(pathToFileURL(join(root, 'provider.mjs')).href);
    assert.equal(provider.calls, 18);
    assert.equal((await app.snapshotStore.readHead('default'))?.manifest.snapshotId, snapshotId);
    return { modules, functions, factCount, nodeCount, bytes, logicalCharacters, rdfBytes, quadCount, contentDigest, immutableDigest,
      providerCalls: 0, deterministicProviderExtractions: provider.calls, repeatReused,
      cleanReused: clean.semanticReused, extractorVersions };
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
