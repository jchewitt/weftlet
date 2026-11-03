import assert from 'node:assert/strict';
import type { GraphFact, GraphSnapshot, ImpactQueryService } from '@weftlet/core';
import { rankImpactFacts, IMPACT_RANKING_VERSION } from '../../src/graph/ranking.js';
import { sharedSymbolAffinity } from '../../src/graph/impact-affinity.js';
import { contextPackLaneForFact, contextPackLanes } from '../../src/graph/coverage.js';
import { factSearchText, v3Rank, v3Rows } from './v3-rows.js';
import { sameGroupAnchor, sameGroupBudget, sameGroupTarget } from '../../tests/fixtures/same-group-project.js';

export function sameGroupReachable(snapshot: GraphSnapshot) {
  const direct = snapshot.facts.filter(fact => factSearchText(fact).includes(sameGroupAnchor));
  const expand = (node: GraphFact['subject']) => node.kind !== 'Project' &&
    !(node.kind === 'CodeSymbol' && node.codeSymbol?.resolution === 'no-indexed-definition');
  let frontier = new Set(direct.flatMap(fact => [fact.subject, fact.object].filter(expand).map(node => node.id)));
  const visited = new Set(frontier), reached = new Map(direct.map(fact => [fact.id, fact]));
  const rounds = new Map(direct.map(fact => [fact.id, 0]));
  for (let depth = 0; depth < sameGroupBudget.maxDepth && frontier.size; depth++) {
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

export function balance(rows: readonly { fact: GraphFact; score: number }[]) {
  const tiers = new Map<number, GraphFact[]>();
  for (const { fact, score } of rows) { const group = tiers.get(score) ?? []; group.push(fact); tiers.set(score, group); }
  return [...tiers.values()].flatMap(facts => {
    const queues = contextPackLanes.map(lane => facts.filter(fact => contextPackLaneForFact(fact) === lane));
    const result: GraphFact[] = [];
    while (queues.some(queue => queue.length)) for (const queue of queues) if (queue.length) result.push(queue.shift()!);
    return [...result, ...facts.filter(fact => contextPackLaneForFact(fact) === undefined)];
  });
}

function groupKey(row: ReturnType<typeof v3Rows>[number]) {
  const distance = row.proximity < 4 ? row.proximity : row.proximity < 8 ? '4-7' : '8+';
  const family = ['calls', 'references', 'consumes'].includes(row.fact.predicate) ? row.fact.predicate : 'other';
  return `${row.contextOnly ? 'context' : 'local'}:${row.relationshipOrder ? 'detail' : `${distance}:${family}`}`;
}

export async function measureSameGroup(snapshot: GraphSnapshot, query: ImpactQueryService) {
  const { direct, reached, rounds } = sameGroupReachable(snapshot), facts = [...reached.values()];
  const args = [facts, direct, [sameGroupAnchor], []] as const;
  const referenceRows = v3Rows(...args), frozen = v3Rank(...args), current = rankImpactFacts(...args);
  if (IMPACT_RANKING_VERSION === 'local-relationship-waves-v3') assert.deepEqual(current, frozen);
  const ordered = balance(current), baseline = balance(frozen), byId = new Map(referenceRows.map(row => [row.fact.id, row]));
  assert.equal(ordered.length, reached.size);
  assert.deepEqual(new Set(ordered.map(fact => fact.id)), new Set(reached.keys()));
  const reference = snapshot.facts.find(fact => fact.predicate === 'references' && fact.object.label === sameGroupTarget.symbol &&
    fact.provenance.path === sameGroupTarget.path && fact.provenance.startLine === sameGroupTarget.line);
  assert(reference, 'The predeclared exact reference must exist');
  const consumer = snapshot.facts.find(fact => fact.predicate === 'consumes' &&
    fact.provenance.path === sameGroupTarget.path && fact.object.label === reference.object.codeSymbol?.nativeSymbol);
  assert(consumer, 'The corresponding legacy file consumer must exist');
  const callProofs = new Set(snapshot.facts.flatMap(fact => fact.codeCall?.targetOccurrences.map(proof => proof.factId) ?? []));
  assert(!callProofs.has(reference.id), 'The target must not acquire saved call proof');
  const pages = [], returned: GraphFact[] = [];
  let continuation: string | undefined;
  for (let i = 0; i < sameGroupBudget.maxPages; i++) {
    const page = await query.scan({ snapshotId: snapshot.manifest.snapshotId, changedFiles: [sameGroupAnchor],
      maxDepth: sameGroupBudget.maxDepth, maxFacts: sameGroupBudget.maxFacts, ...(continuation ? { continuation } : {}) });
    assert.equal(page.facts.length, 60); assert.equal(page.exploration?.reachableFacts, reached.size);
    assert(page.exploration?.truncated && page.exploration.continuation);
    returned.push(...page.facts); continuation = page.exploration.continuation;
    pages.push({ returned: page.facts.length, reachable: page.exploration.reachableFacts, truncated: page.exploration.truncated,
      depthLimitReached: page.exploration.depthLimitReached });
  }
  assert.deepEqual(returned, ordered.slice(0, 180));
  const ids = new Set(returned.map(fact => fact.id));
  const affinity = sharedSymbolAffinity(facts, direct, [sameGroupAnchor]);
  const targets = [reference, consumer].map(fact => {
    const row = byId.get(fact.id)!; assert(row);
    const key = groupKey(row), group = frozen.filter(item => groupKey(byId.get(item.fact.id)!) === key);
    const own = group.filter(item => item.fact.provenance.path === fact.provenance.path);
    return { fact, round: rounds.get(fact.id), rank: ordered.findIndex(item => item.id === fact.id) + 1, returned: ids.has(fact.id),
      sharedProductionReferrers: affinity.get(fact.id), groupSlotsReturned: returned.filter(item => groupKey(byId.get(item.id)!) === key).length,
      v3: { group: key, distance: row.proximity, assertions: group.length, sources: new Set(group.map(item => item.fact.provenance.path)).size,
        groupRank: group.findIndex(item => item.fact.id === fact.id) + 1, sourceOrdinal: own.findIndex(item => item.fact.id === fact.id) + 1,
        slots: baseline.slice(0, 180).filter(item => groupKey(byId.get(item.id)!) === key).length,
        wave: frozen.find(item => item.fact.id === fact.id)!.score, rank: baseline.findIndex(item => item.id === fact.id) + 1 } };
  });
  const peers = snapshot.facts.filter(fact => fact.predicate === 'references' && fact.object.id === reference.object.id &&
    fact.provenance.startLine === sameGroupTarget.line && fact.provenance.path.startsWith('src/consumers/'));
  const pairs = peers.map(ref => {
    const fileConsumer = facts.find(fact => fact.predicate === 'consumes' && fact.object.id === consumer.object.id &&
      fact.provenance.path === ref.provenance.path); assert(fileConsumer);
    return { reference: ref.id, consumer: fileConsumer.id, bothReturned: ids.has(ref.id) && ids.has(fileConsumer.id) };
  });
  return { rankingVersion: IMPACT_RANKING_VERSION, snapshotId: snapshot.manifest.snapshotId, contentDigest: snapshot.manifest.contentDigest,
    factCount: snapshot.facts.length, direct: direct.length, reachable: reached.size, budget: sameGroupBudget,
    pages, returned: returned.length, provenanceFiles: new Set(returned.map(fact => fact.provenance.path)).size,
    targets, returnedFactIds: returned.map(fact => fact.id), noCallProof: true,
    peerPairs: { eligible: pairs.length, eligibleAssertions: new Set(pairs.flatMap(pair => [pair.reference, pair.consumer])).size,
      bothReturned: pairs.filter(pair => pair.bothReturned).length, pairs } };
}
