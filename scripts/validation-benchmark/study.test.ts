import { describe, expect, it } from 'vitest';
import { RdfEvidenceGraph, CG } from '../../src/graph/rdf.js';
import { syntheticSnapshot } from '../benchmark-shacl.mjs';
import { scenarioSnapshot, syntheticFixture, scenarios, expectedConformance, normalized } from './inputs.mjs';
import { options, runBoundedCase, compareModes } from './run.mjs';

describe('validation lifecycle study', () => {
  it('keeps complete public edits and original evidence separate, including deletion of an invalid shared identity', async () => {
    const base = syntheticSnapshot(12, 'shared');
    const before = JSON.stringify(base);
    for (const scenario of scenarios) {
      const input = scenarioSnapshot(base, scenario);
      expect((await new RdfEvidenceGraph(input).validate()).conforms).toBe(expectedConformance(scenario));
      expect(JSON.stringify(base)).toBe(before);
    }
    expect(scenarioSnapshot(base, 'repair-delete')).toEqual(base);
    const renamed = scenarioSnapshot(base, 'rename');
    const physical = base.facts[0].object.id;
    expect(renamed.facts.flatMap((f: any) => [f.subject.id, f.object.id])).not.toContain(physical);
    expect(renamed.facts[0].object.kind).toBe(base.facts[0].object.kind);
    expect(renamed.facts[0].provenance).toEqual(base.facts[0].provenance);
  });

  it('includes all new document ownership shapes and conservative manifest invalidation', async () => {
    const rich = syntheticFixture(12, 'document-rich');
    // An actual extractor may use a different content-digest algorithm from this synthetic harness.
    rich.manifest.contentDigest = 'existing-extractor-content-digest';
    expect(rich.facts.every((f: any) => f.sourceRole && f.sourceOwnership && f.sourcePolicyDigest)).toBe(true);
    const graph = new RdfEvidenceGraph(rich);
    expect((await graph.validate()).conforms).toBe(true);
    const timestampOnly = scenarioSnapshot(rich, 'manifest-only');
    expect(timestampOnly.manifest.contentDigest).toBe(rich.manifest.contentDigest);
    expect(timestampOnly.facts).toEqual(rich.facts);
    const changed = new RdfEvidenceGraph(timestampOnly);
    expect(await changed.validate()).toEqual(await graph.validate());
    expect(await changed.serialize()).not.toBe(await graph.serialize());
    rich.facts[0].sourceOwnership.ownerDocuments = [];
    expect((await new RdfEvidenceGraph(rich).validate()).conforms).toBe(false);
  });

  it('proves changed-facts-only validation misses a violation spanning unchanged producers', async () => {
    const base = syntheticSnapshot(8, 'shared');
    const inserted = scenarioSnapshot(base, 'invalid-shared-kind');
    const delta = { ...inserted, facts: inserted.facts.slice(base.facts.length) };
    expect((await new RdfEvidenceGraph(delta).validate()).conforms).toBe(true);
    const full = await new RdfEvidenceGraph(inserted).validate();
    expect(full.conforms).toBe(false);
    expect(full.issues.some(issue => issue.path === `${CG}kind`)).toBe(true);
    // The affected shared node needs all producers, not merely the newly added record.
    const node = delta.facts[0].subject.id;
    const affected = { ...inserted, facts: inserted.facts.filter((fact: any) =>
      fact.subject.id === node || fact.object.id === node) };
    expect(normalized(await new RdfEvidenceGraph(affected).validate())).toEqual(normalized(full));
    // Removing an unchanged producer changes the violation, even with no newly added assertions.
    const repaired = { ...inserted, facts: inserted.facts.filter((fact: any) =>
      fact.id === delta.facts[0].id || fact.subject.id !== node) };
    expect((await new RdfEvidenceGraph(repaired).validate()).conforms).toBe(true);
  });

  it('rejects invalid bounds and repeat measurements without the exact preceding cold case', () => {
    for (const args of [['--samples', '0'], ['--counts', '10001'], ['--fixtures', 'private'],
      ['--deadline-ms', '50000'], ['--modes', 'native'], ['--unknown', '1'], ['--samples'],
      ['--scenarios', 'repeat'], ['--scenarios', 'cold,insert,repeat']]) expect(() => options(args)).toThrow();
    expect(options(['--counts', '20', '--samples', '1', '--scenarios', 'cold,repeat']).scenarios).toEqual(['cold', 'repeat']);
  });

  it('compares actual direct/worker verdicts and data for the full edit sequence without timing gates', async () => {
    const spec = { fixture: 'shared', count: 12, sample: 1, scenarios };
    const direct = await runBoundedCase({ ...spec, mode: 'direct' }, 30_000);
    const worker = await runBoundedCase({ ...spec, mode: 'worker' }, 30_000);
    expect(direct.status, direct.error).toBe('complete');
    expect(worker.status, worker.error).toBe('complete');
    expect(compareModes([direct, worker])[0].status).toBe('exact-verdict-and-data-match');
    expect(direct.cases.find((c: any) => c.scenario === 'repeat').reusedGraphInstance).toBe(true);
    expect(direct.cases.find((c: any) => c.scenario === 'rebuild').reusedGraphInstance).toBe(false);
    const cold = direct.cases[0];
    for (const result of direct.cases) {
      expect(result.serializationPreserved).toBe(true);
      expect(result.validationPhases.map((p: any) => p.status)).toEqual(['started', 'completed', 'started', 'completed']);
      expect(result.exactKey === cold.exactKey).toBe(['cold', 'repeat', 'rebuild', 'repair-delete'].includes(result.scenario));
    }
    const bad = { ...worker, cases: worker.cases.map((value: any, index: number) => index ? value : { ...value, verdictDigest: 'different' }) };
    expect(compareModes([direct, bad])[0].status).toBe('mismatch');
  }, 60_000);

  it('reports process timeout with no invented conformance verdict', async () => {
    const result = await runBoundedCase({ fixture: 'shared', count: 12, sample: 1,
      mode: 'direct', scenarios: ['cold'] }, 1);
    expect(result.status).toBe('timeout');
    expect(compareModes([result])[0].status).toBe('incomplete');
    expect(result).not.toHaveProperty('conforms');
  });
});
