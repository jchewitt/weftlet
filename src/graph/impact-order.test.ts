import { expect, it } from 'vitest';
import type { GraphFact } from '@weftlet/core';
import { orderImpactRows, type ImpactOrderRow } from './impact-order.js';

function row(id: string, path: string, predicate: GraphFact['predicate'], proximity: number, detail = false): ImpactOrderRow {
  const fact: GraphFact = { id, subject: { id: `file:${path}`, label: path, kind: 'Component' }, predicate,
    object: { id: `target:${id}`, label: id, kind: 'Contract' }, provenance: { path, digest: 'source', commitSha: 'saved', startLine: 1, endLine: 1 },
    snapshotId: 'immutable', authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed',
    confidence: 0.7, extractor: { id: 'public-fixture', version: '1' } };
  return { fact, proximity, relationshipOrder: detail ? 2 : 0, contextOnly: false, focus: 0, tie: id };
}

it('gives second-hop references and consumers turns despite many closer local sources and setup details', () => {
  const noise = Array.from({ length: 256 }, (_, i) => [row(`use-${i}`, `local/${i}.ts`, 'references', 2),
    row(`consumer-${i}`, `local/${i}.ts`, 'consumes', 1), row(`definition-${i}`, `local/${i}.ts`, 'contains', 0, true)]).flat();
  const setup = Array.from({ length: 40 }, (_, i) => row(`setup-${i}`, 'secondary.ts', 'definedBy', 2, true));
  const targets = [row('target-reference', 'secondary.ts', 'references', 3), row('target-consumer', 'secondary.ts', 'consumes', 4)];
  const input = [...noise, ...setup, ...targets];
  const output = orderImpactRows(input);
  expect(output.slice(0, 180).map(item => item.fact.id)).toEqual(expect.arrayContaining(targets.map(item => item.fact.id)));
  expect(output).toHaveLength(input.length);
  expect(new Set(output.map(item => item.fact))).toEqual(new Set(input.map(item => item.fact)));
  expect(orderImpactRows([...input].reverse())).toEqual(output);
  expect(output.every((item, index) => index === 0 || output[index - 1]!.score <= item.score)).toBe(true);
  // Labels and identities are test data, never selectors understood by the scorer.
  const renamed = input.map((item, i) => ({ ...item, tie: `changed-${i}`, fact: { ...item.fact, id: `opaque-${i}`,
    provenance: { ...item.fact.provenance, path: `renamed/${item.fact.provenance.path}` } } }));
  expect(orderImpactRows(renamed).slice(0, 180).map(item => item.fact.id))
    .toEqual(expect.arrayContaining(renamed.slice(-2).map(item => item.fact.id)));
  expect(targets.map(item => item.fact)).toEqual(output.filter(item => targets.some(target => target.fact === item.fact))
    .sort((a, b) => targets.findIndex(target => target.fact === a.fact) - targets.findIndex(target => target.fact === b.fact)).map(item => item.fact));
});

it('retains context and repeated-source details to exhaustion and applies focus within a distance/family bucket', () => {
  const local = Array.from({ length: 25 }, (_, i) => row(String(i), `local/${i % 3}.ts`, 'references', 2));
  const focused = { ...row('focus', 'chosen.ts', 'references', 2), focus: 2 };
  const context = { ...row('context', 'context.ts', 'references', 2), contextOnly: true, focus: 100 };
  const input = [context, ...local, focused];
  const output = orderImpactRows(input);
  expect(output[0]!.fact).toBe(focused.fact);
  expect(output.at(-1)!.fact).toBe(context.fact);
  expect(new Set(output.map(item => item.fact.id)).size).toBe(input.length);
  expect(output.every(item => item.fact.authority === 'inferred' && item.fact.extractionReview === 'unreviewed')).toBe(true);
});
