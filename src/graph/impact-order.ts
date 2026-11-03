import type { GraphFact } from '@weftlet/core';

export interface ImpactOrderRow {
  readonly fact: GraphFact;
  readonly proximity: number;
  readonly relationshipOrder: number;
  readonly contextOnly: boolean;
  readonly focus: number;
  readonly tie: string;
}

/** Fixed distance bands prevent thousands of first-hop sources from exhausting
 * every page before any second-hop evidence gets a turn. They do not bound scope. */
function distanceBand(distance: number): number {
  return distance < 4 ? distance : distance < 8 ? 4 : 5;
}

function family(fact: GraphFact): string {
  if (fact.predicate === 'calls' || fact.predicate === 'references' || fact.predicate === 'consumes') return fact.predicate;
  return 'other';
}

const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const compare = (a: ImpactOrderRow, b: ImpactOrderRow) => b.focus - a.focus ||
  a.proximity - b.proximity || lexical(a.tie, b.tie) || lexical(a.fact.id, b.fact.id);

/** One source per turn within a distance/family bucket, without adding an
 * unbounded source ordinal to graph distance. Every input row is retained. */
export function sourceQueue(rows: ImpactOrderRow[]) {
  const sources = new Map<string, ImpactOrderRow[]>();
  for (const row of rows.sort(compare)) {
    const group = sources.get(row.fact.provenance.path) ?? [];
    group.push(row); sources.set(row.fact.provenance.path, group);
  }
  let active = [...sources.values()].map(rows => ({ rows, offset: 0 }));
  let cursor = 0;
  return () => {
    if (!active.length) return undefined;
    if (cursor === active.length) {
      active = active.filter(source => source.offset < source.rows.length); cursor = 0;
    }
    const source = active[cursor++];
    return source?.rows[source.offset++];
  };
}

/** Ordering waves preserve evidence-lane balancing in the query facade. Near
 * and indirect relationships each get turns (two slots for calls, references
 * and consumers, one for other relations); local detail also gets one slot
 * per wave. Unindexed/shared-import context follows local evidence unless it
 * was explicitly queried. No assertion, citation or authority is rewritten. */
export function orderImpactRows(rows: ImpactOrderRow[]) {
  const result: { fact: GraphFact; score: number }[] = [];
  let wave = 0;
  for (const contextOnly of [false, true]) {
    const selected = rows.filter(row => row.contextOnly === contextOnly);
    const buckets = new Map<string, ImpactOrderRow[]>();
    const details: ImpactOrderRow[] = [];
    for (const row of selected) {
      if (row.relationshipOrder > 0) { details.push(row); continue; }
      const key = `${distanceBand(row.proximity)}:${family(row.fact)}`;
      const bucket = buckets.get(key) ?? []; bucket.push(row); buckets.set(key, bucket);
    }
    const queues = [...buckets].sort(([a], [b]) => lexical(a, b))
      .map(([key, group]) => ({ next: sourceQueue(group), slots: key.endsWith(':other') ? 1 : 2 }));
    if (details.length) queues.push({ next: sourceQueue(details), slots: 1 });
    let remaining = selected.length;
    while (remaining > 0) {
      for (const { next, slots } of queues) {
        for (let slot = 0; slot < slots; slot++) {
          const row = next();
          if (row) { result.push({ fact: row.fact, score: wave }); remaining--; }
        }
      }
      wave++;
    }
  }
  return result;
}
