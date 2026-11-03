import type { GraphFact } from '@weftlet/core';
import { sourceQueue, type ImpactOrderRow } from './impact-order.js';

/** Balance reference/consumer families and sources within a specificity cohort.
 * A later occurrence can surface without waiting for every unrelated local file. */
function affinityQueue(rows: ImpactOrderRow[], affinity: ReadonlyMap<string, number>) {
  const cohorts = new Map<number, ImpactOrderRow[]>();
  for (const row of rows) {
    const degree = affinity.get(row.fact.id);
    if (degree === undefined || row.contextOnly || !['references', 'consumes'].includes(row.fact.predicate)) continue;
    const group = cohorts.get(degree) ?? []; group.push(row); cohorts.set(degree, group);
  }
  const ordered: GraphFact[] = [];
  for (const [, cohort] of [...cohorts].sort(([a], [b]) => a - b)) {
    const queues = ['references', 'consumes'].map(predicate => sourceQueue(cohort.filter(row => row.fact.predicate === predicate)));
    let remaining = cohort.length;
    while (remaining > 0) for (const next of queues) {
      const row = next();
      if (row) { ordered.push(row.fact); remaining--; }
    }
  }
  return ordered;
}

/** Interleave specificity with baseline waves, retaining every assertion exactly
 * once and preserving evidence-lane balancing. No affinity means exact v3 order. */
export function interleaveAffinity(rows: ImpactOrderRow[], baseline: readonly { fact: GraphFact; score: number }[],
  affinity: ReadonlyMap<string, number>) {
  if (!affinity.size) return baseline;
  const queue = affinityQueue(rows, affinity), emitted = new Set<string>();
  const result: { fact: GraphFact; score: number }[] = [];
  let cursor = 0;
  const push = (fact: GraphFact, score: number) => {
    if (!emitted.has(fact.id)) { result.push({ fact, score }); emitted.add(fact.id); }
  };
  for (const { fact, score } of baseline) {
    if (emitted.has(fact.id)) continue;
    while (cursor < queue.length && emitted.has(queue[cursor]!.id)) cursor++;
    if (cursor < queue.length) push(queue[cursor++]!, score);
    push(fact, score);
  }
  return result;
}
