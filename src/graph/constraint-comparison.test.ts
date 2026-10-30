import { describe, expect, it } from 'vitest';
import type { ObligationDeclaration } from '@weftlet/core';
import { compareDeclaredConstraints } from './constraint-comparison.js';

const producer: ObligationDeclaration = { schemaVersion: 1, id: 'p', role: 'guarantee', endpoint: 'p.ts',
  contract: { scope: 'sensor', id: 'reading', kind: 'queue', version: '1' }, statement: 'Published numeric limit.',
  domain: 'sensor', stage: 'handoff', constraint: { metric: 'age', operator: 'at-most', value: 20, unit: 'seconds' } };
const consumer: ObligationDeclaration = { ...producer, id: 'c', role: 'requirement', endpoint: 'c.ts',
  constraint: { ...producer.constraint!, value: 60 } };

describe('declared numeric sets, independent of implementation or approval', () => {
  it('agrees with a finite-set oracle across every operator/boundary combination', () => {
    const operators = ['at-most', 'at-least', 'equal'] as const, limits = [-1, 0, 1];
    const allowed = (op: typeof operators[number], v: number) => [-3, -2, -1, 0, 1, 2, 3]
      .filter(n => op === 'at-most' ? n <= v : op === 'at-least' ? n >= v : n === v);
    // Samples include each breakpoint and both exterior tails; exact for these half-line/singleton sets.
    for (const po of operators) for (const pv of limits) for (const co of operators) for (const cv of limits) {
      const p = allowed(po, pv), c = allowed(co, cv);
      const status = p.every(n => c.includes(n)) ? 'compatible-constraints'
        : p.every(n => !c.includes(n)) ? 'disjoint-constraints' : 'insufficient-guarantee';
      expect(compareDeclaredConstraints({ ...producer, constraint: { ...producer.constraint!, operator: po, value: pv } },
        { ...consumer, constraint: { ...consumer.constraint!, operator: co, value: cv } }).status).toBe(status);
    }
  });
  it('retains exact inclusive fractional boundaries and distinguishes revalidation from contradiction', () => {
    const p = { ...producer, constraint: { ...producer.constraint!, operator: 'equal' as const, value: 0.5 } };
    expect(compareDeclaredConstraints(p, { ...consumer, constraint: { ...consumer.constraint!, value: 0.5 } }).status).toBe('compatible-constraints');
    expect(compareDeclaredConstraints({ ...producer, constraint: { ...producer.constraint!, value: 600 } }, consumer).status).toBe('insufficient-guarantee');
    expect(compareDeclaredConstraints({ ...producer, constraint: { ...producer.constraint!, value: 600 } },
      { ...consumer, revalidation: 'required' }).status).toBe('revalidation-required');
    expect(compareDeclaredConstraints({ ...producer, constraint: { ...producer.constraint!, operator: 'at-least', value: 120 } },
      { ...consumer, revalidation: 'required' }).status).toBe('disjoint-constraints');
    expect(compareDeclaredConstraints(producer, { ...consumer, stage: 'execution' }).reasons).toEqual(['different-stage']);
    expect(compareDeclaredConstraints(producer, { ...consumer, stage: 'execution', revalidation: 'required' }).status).toBe('revalidation-required');
  });
  it.each([
    [{ domain: undefined }, 'missing-context'], [{ domain: 'billing' }, 'different-domain'],
    [{ constraint: { ...consumer.constraint!, metric: 'other' } }, 'different-metric'],
    [{ constraint: { ...consumer.constraint!, unit: 'minutes' } }, 'different-unit'],
    [{ constraint: { ...consumer.constraint!, value: Infinity } }, 'unsupported-number'],
    [{ constraint: { ...consumer.constraint!, value: Number.MAX_SAFE_INTEGER + 1 } }, 'unsupported-number'],
    [{ contract: { ...consumer.contract, version: '2' } }, 'different-contracts'],
    [{ role: 'guarantee' }, 'wrong-roles'],
  ] as const)('does not guess missing or incompatible context %j', (change, reason) => {
    expect(compareDeclaredConstraints(producer, { ...consumer, ...change })).toEqual({ status: 'unknown', reasons: [reason] });
  });
  it('keeps two unknown versions unknown rather than declaring equivalence', () => {
    expect(compareDeclaredConstraints({ ...producer, contract: { ...producer.contract, version: undefined } },
      { ...consumer, contract: { ...consumer.contract, version: undefined } }).reasons).toContain('unknown-version');
  });
});
