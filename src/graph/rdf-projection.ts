import type { GraphFact } from '@weftlet/core';
import { stableJson } from '../infrastructure/util.js';

/**
 * Equivalent to SELECT cg:record JOIN cg:ordinal ORDER BY ordinal. The record
 * literal uses the canonical RDF encoder, not a separate interpretation of facts.
 * Preserve duplicate-ID join multiplicity too; callers can reject corrupt IDs.
 */
export function projectRdfFacts(facts: readonly GraphFact[]): readonly GraphFact[] {
  const counts = new Map<string, number>();
  for (const fact of facts) counts.set(fact.id, (counts.get(fact.id) ?? 0) + 1);
  const duplicates = new Map<string, Set<string>>();
  for (const fact of facts) if (counts.get(fact.id)! > 1) {
    const records = duplicates.get(fact.id) ?? new Set();
    records.add(stableJson(fact)); duplicates.set(fact.id, records);
  }
  const result: GraphFact[] = [];
  for (const fact of facts) {
    if (duplicates.has(fact.id)) for (const record of duplicates.get(fact.id)!) result.push(JSON.parse(record));
    else result.push(JSON.parse(stableJson(fact)));
  }
  return result;
}
