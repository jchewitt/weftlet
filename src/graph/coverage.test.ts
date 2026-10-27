import { describe, expect, it } from 'vitest';
import { repositoryFileNode, type GraphFact } from '@weftlet/core';
import { contextPackLaneForFact, coverageForFacts, isImplementationEvidence } from './coverage.js';

function consumer(path = 'src/worker.ts', changes: Partial<GraphFact> = {}): GraphFact {
  return { id: 'public-consumer', snapshotId: 'public-snapshot',
    subject: repositoryFileNode(path), predicate: 'consumes',
    object: { id: 'contract:work', kind: 'Contract', label: 'Work' },
    provenance: { path, startLine: 2, endLine: 2, digest: 'public-digest', commitSha: 'a'.repeat(40) },
    extractor: { id: 'public-framework-adapter', version: '1' }, confidence: 1, ...changes };
}

describe('reported evidence coverage', () => {
  it('counts one legacy code consumer in both coverage categories while retaining its primary lane and evidence', () => {
    const fact = consumer();
    const before = structuredClone(fact);
    expect(contextPackLaneForFact(fact)).toBe('contractsAndInvariants');
    expect(coverageForFacts([fact])).toMatchObject({ scope: 'returned-page', countsAreNonExclusive: true,
      counts: { productIntent: 0, contractsAndInvariants: 1, implementationAndConsumers: 1, validationEvidence: 0 } });
    expect(fact).toEqual(before);
    expect(fact.authority).toBeUndefined();
  });

  it.each(['declared', 'inferred', 'draft', 'validated', 'observed'] as const)(
    'does not promote %s authority merely because the fact cites a physical code file', authority => {
      expect(isImplementationEvidence(consumer('src/worker.ts', { authority }))).toBe(false);
    });

  it.each(['docs/owner.md', 'docs/owner.MDX', 'notes.txt', 'src/worker.spec.ts', 'src/worker.test.py',
    'tests/helper.ts', 'src/TESTING/helper.ts', 'src/__tests__/worker.ts', 'src/__mocks__/worker.ts',
    'src/validation/check.ts', 'src/evidence/check.ts', 'tests\\helper.ts'])(
    'does not count document or validation source %s as production implementation', path => {
      expect(isImplementationEvidence(consumer(path))).toBe(false);
      expect(isImplementationEvidence(consumer(path, { authority: 'implemented' }))).toBe(false);
    });

  it('keeps unreviewed model output and runtime facts out even when they name physical files', () => {
    expect(isImplementationEvidence(consumer('src/worker.ts', { extractionReview: 'unreviewed' }))).toBe(false);
    expect(isImplementationEvidence(consumer('src/worker.ts', { extractor: { id: 'codex-cli:fixture', version: '1' } }))).toBe(false);
    expect(isImplementationEvidence(consumer('src/worker.ts', { extractor: { id: 'otlp-runtime-evidence', version: '1' } }))).toBe(false);
  });

  it('does not mistake an unapproved document in the legacy implementation display group for code', () => {
    const fact = consumer('docs/owner.md', { predicate: 'references',
      object: repositoryFileNode('src/worker.ts'), authority: 'inferred', extractionReview: 'deterministic' });
    expect(contextPackLaneForFact(fact)).toBe('implementationAndConsumers');
    expect(coverageForFacts([fact]).counts.implementationAndConsumers).toBe(0);
  });

  it('requires the cited physical file for legacy adapters and explicit authority for logical components', () => {
    const logical = consumer('src/worker.ts', { subject: { id: 'component:worker', kind: 'Component', label: 'Worker' } });
    expect(isImplementationEvidence(logical)).toBe(false);
    expect(isImplementationEvidence({ ...logical, authority: 'implemented' })).toBe(true);
    expect(isImplementationEvidence(consumer('src/caller.ts', { subject: repositoryFileNode('src/worker.ts') }))).toBe(false);
  });

  it('reports absent evidence only for the supplied returned page', () => {
    const coverage = coverageForFacts([]);
    expect(coverage.scope).toBe('returned-page');
    expect(coverage.gaps).toHaveLength(4);
    expect(coverage.gaps.every(gap => gap.includes('on this returned page'))).toBe(true);
  });
});
