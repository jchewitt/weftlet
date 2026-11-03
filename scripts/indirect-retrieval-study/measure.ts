import assert from 'node:assert/strict';
import type { GraphFact, GraphSnapshot, ImpactQueryService } from '@weftlet/core';
import { rankImpactFacts, factSearchText, IMPACT_RANKING_VERSION } from '../../src/graph/ranking.js';
import { contextPackLanes, contextPackLaneForFact } from '../../src/graph/coverage.js';
import { indirectAnchor, indirectTarget, indirectRetrievalBudget } from '../../tests/fixtures/indirect-retrieval-project.js';

/** Independent accounting of the fixed query's reachable set and page ordering.
 * Verify it against actual service pages before reporting calculated later ranks. */
export function indirectReachable(snapshot: GraphSnapshot) {
  const anchors = [indirectAnchor];
  const direct = snapshot.facts.filter(fact => anchors.some(term => factSearchText(fact).includes(term)));
  const expand = (node: GraphFact['subject']) => node.kind !== 'Project' &&
    !(node.kind === 'CodeSymbol' && node.codeSymbol?.resolution === 'no-indexed-definition');
  let frontier = new Set(direct.flatMap(fact => [fact.subject, fact.object].filter(expand).map(node => node.id)));
  const visited = new Set(frontier);
  const reached = new Map(direct.map(fact => [fact.id, fact]));
  const rounds = new Map(direct.map(fact => [fact.id, 0]));
  for (let depth = 0; depth < indirectRetrievalBudget.maxDepth && frontier.size; depth++) {
    const next = new Set<string>();
    for (const fact of snapshot.facts) {
      if (!frontier.has(fact.subject.id) && !frontier.has(fact.object.id)) continue;
      reached.set(fact.id, fact);
      if (!rounds.has(fact.id)) rounds.set(fact.id, depth + 1);
      for (const node of [fact.subject, fact.object]) if (expand(node) && !visited.has(node.id)) next.add(node.id);
    }
    for (const id of next) visited.add(id);
    frontier = next;
  }
  return { direct, reached, rounds };
}

export function indirectTargets(snapshot: GraphSnapshot) {
  const reference = snapshot.facts.find(fact => fact.predicate === 'references' &&
    fact.provenance.path === indirectTarget.path && fact.provenance.startLine === indirectTarget.line &&
    fact.object.label === indirectTarget.symbol);
  assert(reference, 'The exact method reference must already exist');
  const consumer = snapshot.facts.find(fact => fact.predicate === 'consumes' &&
    fact.provenance.path === indirectTarget.path && fact.object.label === reference.object.codeSymbol?.nativeSymbol);
  assert(consumer, 'The exact legacy consumer must already exist');
  assert(!snapshot.facts.some(fact => fact.codeCall?.targetOccurrences.some(proof => proof.factId === reference.id)),
    'This fixture must not acquire a saved call proof for the target reference');
  return [reference, consumer];
}

export async function measureIndirectRetrieval(snapshot: GraphSnapshot, query: ImpactQueryService) {
  const { direct, reached, rounds } = indirectReachable(snapshot);
  const ranked = rankImpactFacts([...reached.values()], direct, [indirectAnchor], []);
  const tiers = new Map<number, GraphFact[]>();
  for (const row of ranked) { const facts = tiers.get(row.score) ?? []; facts.push(row.fact); tiers.set(row.score, facts); }
  const balanced: GraphFact[] = [];
  for (const facts of tiers.values()) {
    const queues = contextPackLanes.map(lane => facts.filter(fact => contextPackLaneForFact(fact) === lane));
    while (queues.some(queue => queue.length)) for (const queue of queues) if (queue.length) balanced.push(queue.shift()!);
    balanced.push(...facts.filter(fact => contextPackLaneForFact(fact) === undefined));
  }
  assert.equal(balanced.length, reached.size);
  assert.deepEqual(new Set(balanced.map(fact => fact.id)), new Set(reached.keys()));
  let continuation: string | undefined;
  const returned: GraphFact[] = [];
  const pages = [];
  for (let page = 0; page < indirectRetrievalBudget.maxPages; page++) {
    const result = await query.scan({ snapshotId: snapshot.manifest.snapshotId, changedFiles: [indirectAnchor],
      maxDepth: indirectRetrievalBudget.maxDepth, maxFacts: indirectRetrievalBudget.maxFacts,
      ...(continuation ? { continuation } : {}) });
    assert.equal(result.facts.length, indirectRetrievalBudget.maxFacts);
    assert.equal(result.exploration?.reachableFacts, reached.size);
    assert(result.exploration?.truncated && result.exploration.continuation);
    returned.push(...result.facts);
    pages.push({ returned: result.facts.length, reachable: result.exploration.reachableFacts,
      truncated: result.exploration.truncated, depthLimitReached: result.exploration.depthLimitReached });
    continuation = result.exploration.continuation;
  }
  assert.deepEqual(returned, balanced.slice(0, 180), 'Calculated ordering must reproduce all actual bounded results, including provenance');
  return { rankingVersion: IMPACT_RANKING_VERSION, snapshotId: snapshot.manifest.snapshotId,
    contentDigest: snapshot.manifest.contentDigest, extractorVersions: snapshot.manifest.extractorVersions,
    factCount: snapshot.facts.length, direct: direct.length, reachable: reached.size, pages,
    budget: indirectRetrievalBudget, returned: returned.length, provenanceFiles: new Set(returned.map(fact => fact.provenance.path)).size,
    targets: indirectTargets(snapshot).map(fact => ({ id: fact.id, predicate: fact.predicate, round: rounds.get(fact.id),
      rank: balanced.findIndex(row => row.id === fact.id) + 1, returned: returned.some(row => row.id === fact.id), fact })),
    returnedFactIds: returned.map(fact => fact.id), noCallProof: true };
}
