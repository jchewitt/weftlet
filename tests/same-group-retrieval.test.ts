import { rm } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { sameGroupAnchor, sameGroupProject } from './fixtures/same-group-project.js';
import { measureSameGroup, sameGroupReachable } from '../scripts/same-group-study/measure.js';
import { evidenceBytes } from '../scripts/retrieval-study/preservation.js';
import { rankImpactFacts } from '../src/graph/ranking.js';
import { sharedSymbolAffinity } from '../src/graph/impact-affinity.js';

it.each(['specific', 'symmetric'] as const)('measures exact same-group relationships with %s saved witnesses', async mode => {
  const fixture = await sameGroupProject(mode);
  try {
    // Actual unchanged SCIP/contract extractors; publication requires full strict SHACL.
    const first = await fixture.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(first.semanticExtracted).toBe(0);
    const snapshot = (await fixture.app.snapshotStore.read(first.snapshot.manifest.snapshotId))!;
    const before = await evidenceBytes(fixture.app.storageRoot);
    const report = await measureSameGroup(snapshot, fixture.app.queryService);
    expect(report.budget).toEqual({ maxDepth: 3, maxFacts: 60, maxPages: 3 });
    expect(report.returned).toBe(180);
    expect(report.direct).toBeGreaterThan(100);
    expect(report.peerPairs.eligible).toBe(136);
    expect(report.peerPairs.eligibleAssertions).toBe(272);
    expect(report.targets.map(target => target.round)).toEqual([2, 2]);
    expect(report.targets.map(target => target.v3.distance)).toEqual([2, 3]);
    expect(report.targets[0]!.v3.sourceOrdinal).toBeGreaterThan(1);
    expect(report.targets[1]!.v3.sourceOrdinal).toBe(1);
    for (const target of report.targets) {
      expect(target.v3.sources).toBeGreaterThanOrEqual(136);
      expect(target.v3.assertions).toBeGreaterThan(180);
      expect(target.v3.rank).toBeGreaterThan(180);
      expect(target.fact).toEqual(snapshot.facts.find(fact => fact.id === target.fact.id));
    }
    expect(report.noCallProof).toBe(true);
    expect(report.targets.map(target => target.fact.predicate)).toEqual(['references', 'consumes']);
    expect(report.targets[0]!.fact).toMatchObject({ authority: 'implemented', extractionReview: 'deterministic' });
    expect(report.targets[1]!.fact.authority).toBeUndefined(); // Preserve legacy omissions too.
    const { direct, reached } = sameGroupReachable(snapshot), facts = [...reached.values()];
    const affinity = sharedSymbolAffinity(facts, direct, [sameGroupAnchor]);
    expect(report.targets.map(target => affinity.get(target.fact.id))).toEqual(mode === 'specific' ? [3, 3] : [137, 137]);
    if (mode === 'specific') {
      expect(report.targets.map(target => target.returned)).toEqual([true, true]);
      expect(report.peerPairs.bothReturned).toBe(2);
    } else {
      // Symmetric evidence does not justify a universal first-180 recall promise.
      expect(report.targets.map(target => target.returned)).toEqual([false, false]);
      expect(report.peerPairs.bothReturned).toBeLessThan(report.peerPairs.eligible);
    }
    const order = rankImpactFacts(facts, direct, [sameGroupAnchor], []);
    expect(rankImpactFacts([...facts].reverse(), [...direct].reverse(), [sameGroupAnchor], [])).toEqual(order);
    expect(await measureSameGroup(snapshot, fixture.app.queryService)).toEqual(report);
    expect(await evidenceBytes(fixture.app.storageRoot)).toEqual(before);
    // Unchanged hydration still has the same identity/content and immutable artifacts.
    const repeat = await fixture.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeat.snapshot.manifest.snapshotId).toBe(snapshot.manifest.snapshotId);
    expect(repeat.snapshot.manifest.contentDigest).toBe(snapshot.manifest.contentDigest);
    expect(repeat.semanticExtracted).toBe(0);
    const afterRepeat = await evidenceBytes(fixture.app.storageRoot);
    for (const [path, digest] of Object.entries(before)) expect(afterRepeat[path]).toBe(digest);
    // The unchanged RDF compiler creates a new work directory on each hydration.
    // It must contain identical bytes; no snapshot/index/head/cache is added or rewritten.
    const added = Object.keys(afterRepeat).filter(path => !(path in before));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^work\/rdf-[a-f0-9-]+\/semantic\.nt$/);
    const priorRdf = Object.keys(before).find(path => path.endsWith('/semantic.nt'))!;
    expect(afterRepeat[added[0]!]).toBe(before[priorRdf]);
  } finally { await rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}, 240_000);
