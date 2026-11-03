import { repositoryFileNode, sha256, type GraphFact, type GraphNode } from '@weftlet/core';

const sameExtraction = (a: GraphFact, b: GraphFact) => a.snapshotId === b.snapshotId &&
  a.provenance.commitSha === b.provenance.commitSha && a.extractor.id === b.extractor.id &&
  a.extractor.version === b.extractor.version;

const indexedName = (node: GraphNode) => node.kind === 'CodeSymbol' &&
  node.codeSymbol?.provider === 'scip-typescript' && node.codeSymbol.identityScope === 'repository' &&
  node.codeSymbol.resolution === 'indexed-definition' && !node.codeSymbol.nativeSymbol.endsWith('/');

// Keys describe corroborating saved evidence, never a new native/legacy identity edge.
const projectionKey = (fact: GraphFact, native: string) => JSON.stringify([fact.snapshotId,
  fact.provenance.commitSha, fact.provenance.digest, fact.provenance.path,
  fact.extractor.id, fact.extractor.version, native]);
const witnessKey = (fact: GraphFact) => JSON.stringify([fact.snapshotId, fact.provenance.commitSha,
  fact.extractor.id, fact.extractor.version, fact.object.id]);

/** Structural relevance from producer -> shared symbol <- other indexed symbol.
 * Smaller distinct production referrer counts are more specific, not more true.
 * File/module anchors, locations alone and unknown projections cannot supply this
 * signal. All assertions (including tests) remain in the baseline ordering. */
export function sharedSymbolAffinity(facts: readonly GraphFact[], direct: readonly GraphFact[],
  anchorTerms: readonly string[]): ReadonlyMap<string, number> {
  if (!anchorTerms.length) return new Map();
  const definitions = new Map<string, GraphFact[]>();
  for (const fact of facts) {
    if (fact.extractor.id !== 'scip-symbol-extractor' || fact.predicate !== 'definedBy' ||
      fact.codeOccurrence?.role !== 'definition' || fact.codeOccurrence.locationKind !== 'name' ||
      !indexedName(fact.subject) || fact.object.id !== repositoryFileNode(fact.provenance.path).id) continue;
    const group = definitions.get(fact.subject.id) ?? [];
    group.push(fact); definitions.set(fact.subject.id, group);
  }
  const eligible = (node: GraphNode, fact: GraphFact) => indexedName(node) &&
    definitions.get(node.id)?.some(def => sameExtraction(def, fact)) === true;
  const production = (node: GraphNode, fact: GraphFact) => definitions.get(node.id)?.some(def =>
    sameExtraction(def, fact) && repositoryFileNode(def.provenance.path).kind === 'Component') === true;
  const origins = new Set(direct.filter(fact => fact.predicate === 'definedBy' &&
    definitions.get(fact.subject.id)?.some(def => def.id === fact.id)).map(fact => fact.subject.id));
  if (!origins.size) return new Map();
  const references = facts.filter(fact => fact.predicate === 'references' &&
    fact.codeOccurrence?.role === 'reference' && fact.codeOccurrence.locationKind === 'name' &&
    fact.extractor.id === 'scip-symbol-extractor' && eligible(fact.subject, fact) && eligible(fact.object, fact) &&
    fact.subject.codeSymbol!.repositoryId === fact.object.codeSymbol!.repositoryId);
  const shared = new Map<string, { referrers: Set<string>; members: GraphFact[] }>();
  for (const fact of references) if (origins.has(fact.subject.id)) {
    shared.set(witnessKey(fact), { referrers: new Set(), members: [] });
  }
  for (const fact of references) {
    const group = shared.get(witnessKey(fact));
    if (!group) continue;
    if (production(fact.subject, fact)) group.referrers.add(fact.subject.id);
    if (!origins.has(fact.subject.id)) group.members.push(fact);
  }
  // Include the extraction scope: stale evidence cannot become a current witness.
  const subjectKey = (fact: GraphFact) => JSON.stringify([fact.snapshotId, fact.provenance.commitSha,
    fact.extractor.id, fact.extractor.version, fact.subject.id]);
  const affinity = new Map<string, number>();
  for (const group of shared.values()) for (const fact of group.members) {
    const key = subjectKey(fact), count = Math.max(1, group.referrers.size);
    affinity.set(key, Math.min(affinity.get(key) ?? Infinity, count));
  }
  const result = new Map<string, number>(), projections = new Map<string, number>();
  for (const fact of references) {
    const degree = affinity.get(subjectKey(fact));
    if (degree === undefined) continue;
    result.set(fact.id, degree);
    const key = projectionKey(fact, fact.object.codeSymbol!.nativeSymbol);
    projections.set(key, Math.min(projections.get(key) ?? Infinity, degree));
  }
  const legacyIds = new Map<string, string>();
  for (const fact of facts) {
    if (fact.predicate !== 'consumes' || fact.extractor.id !== 'scip-symbol-extractor' ||
      fact.subject.id !== repositoryFileNode(fact.provenance.path).id || fact.object.kind !== 'Contract') continue;
    const degree = projections.get(projectionKey(fact, fact.object.label));
    if (degree === undefined) continue;
    let id = legacyIds.get(fact.object.label);
    if (!id) { id = `symbol:scip:${sha256(fact.object.label)}`; legacyIds.set(fact.object.label, id); }
    if (fact.object.id === id) result.set(fact.id, degree);
  }
  return result;
}
