import { rm } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { indirectRetrievalProject } from './fixtures/indirect-retrieval-project.js';
import { measureIndirectRetrieval } from '../scripts/indirect-retrieval-study/measure.js';
import { evidenceBytes } from '../scripts/retrieval-study/preservation.js';
import { contextPackEvidenceAuthority } from '../src/graph/authority.js';

it('retrieves both exact second-hop assertions without call proof amid broad local competition', async () => {
  const fixture = await indirectRetrievalProject();
  try {
    // Real unchanged extractors and strict publication. No semantic/model calls.
    const first = await fixture.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(first.semanticExtracted).toBe(0);
    const snapshot = await fixture.app.snapshotStore.read(first.snapshot.manifest.snapshotId);
    expect(snapshot).toBeDefined();
    const before = await evidenceBytes(fixture.app.storageRoot);
    const result = await measureIndirectRetrieval(snapshot!, fixture.app.queryService);
    expect(result.budget).toEqual({ maxDepth: 3, maxFacts: 60, maxPages: 3 });
    expect(result.returned).toBe(180);
    expect(result.direct).toBeGreaterThan(100);
    expect(result.reachable).toBeGreaterThan(180);
    expect(result.targets.map(target => target.round)).toEqual([2, 2]);
    expect(result.targets.map(target => target.returned)).toEqual([true, true]);
    expect(result.noCallProof).toBe(true);
    for (const target of result.targets) {
      expect(contextPackEvidenceAuthority(target.fact)).toBe('implemented');
      expect(target.fact.extractor).toEqual({ id: 'scip-symbol-extractor', version: '2.1.0' });
      expect(target.fact).toEqual(snapshot!.facts.find(fact => fact.id === target.id));
    }
    expect(result.targets[0]!.fact).toMatchObject({ authority: 'implemented', extractionReview: 'deterministic' });
    // Legacy consumers omit these fields. Preserve that omission rather than
    // rewriting the saved assertion to satisfy a current metadata convention.
    expect(result.targets[1]!.fact.authority).toBeUndefined();
    expect(result.targets[1]!.fact.extractionReview).toBeUndefined();
    // Exact page IDs, provenance/authority and all saved bytes survive repetition.
    expect(await measureIndirectRetrieval(snapshot!, fixture.app.queryService)).toEqual(result);
    expect(await evidenceBytes(fixture.app.storageRoot)).toEqual(before);
  } finally { await rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}, 240_000);
