import type { GraphFact, GraphNode } from '@weftlet/core';
import { stableJson } from '../infrastructure/util.js';
import { impactRankingSignals } from './impact-signals.js';

/** Binds continuation offsets to the ordering policy; changing this requires restarting a scan. */
export const IMPACT_RANKING_VERSION = 'local-relationships-diversity-v2';

export function factSearchText(fact: GraphFact): string {
  return [fact.subject.id, fact.subject.label, fact.predicate, fact.object.id,
    fact.object.label, fact.provenance.path].join(' ').toLowerCase();
}

function edgeCost(fact: GraphFact, forward: boolean): number {
  // A shared unresolved import is context, not evidence that its co-importers consume this change.
  if ([fact.subject, fact.object].some((node) => node.id.startsWith('contract:module:'))) return 8;
  // Follow typed definitions towards consumers cheaply; upstream dependencies remain available.
  if (forward && fact.predicate === 'consumes' && fact.object.kind === 'Contract' &&
    ['Component', 'Evidence'].includes(fact.subject.kind)) return 4;
  return 1;
}

function stableTie(fact: GraphFact): string {
  // Unrelated commit hashes and input order must not decide which otherwise-equal file comes first.
  return stableJson({ subject: fact.subject.id, predicate: fact.predicate, object: fact.object.id,
    path: fact.provenance.path, start: fact.provenance.startLine, end: fact.provenance.endLine,
    extractor: fact.extractor, authority: fact.authority, sourceAuthority: fact.sourceAuthority,
    extractionReview: fact.extractionReview, confidence: fact.confidence });
}

export interface RankedImpactFact { readonly fact: GraphFact; readonly score: number }

/** Order an already bounded reachable set. No facts are pruned and no authority is changed. */
export function rankImpactFacts(
  facts: readonly GraphFact[], direct: readonly GraphFact[], anchorTerms: readonly string[],
  focus: readonly string[],
): readonly RankedImpactFact[] {
  const signals = impactRankingSignals(facts, anchorTerms);
  const costs = new Map(facts.map(fact => [fact, signals.penalty(fact)]));
  const cost = (fact: GraphFact, forward: boolean) => Math.max(edgeCost(fact, forward), costs.get(fact)!);
  const adjacent = new Map<string, { to: string; cost: number }[]>();
  const connect = (from: GraphNode, to: GraphNode, cost: number) => {
    if (from.kind === 'Project' || to.kind === 'Project') return;
    const edges = adjacent.get(from.id) ?? [];
    edges.push({ to: to.id, cost });
    adjacent.set(from.id, edges);
  };
  for (const fact of facts) {
    connect(fact.subject, fact.object, cost(fact, true));
    connect(fact.object, fact.subject, cost(fact, false));
  }
  const distance = new Map<string, number>();
  // Integer edge costs permit a bucket queue: O(edges + maximum path cost), without a heap dependency.
  const pending: string[][] = [];
  const enqueue = (id: string, cost: number) => {
    if (cost >= (distance.get(id) ?? Infinity)) return;
    distance.set(id, cost);
    (pending[cost] ??= []).push(id);
  };
  for (const fact of direct) {
    // Some adapters only identify an anchor through its citation. Keep those queries supported.
    for (const node of signals.seedNodes(fact)) enqueue(node.id, 0);
  }
  for (let cost = 0; cost < pending.length; cost++) {
    for (const id of pending[cost] ?? []) {
      if (distance.get(id) !== cost) continue;
      for (const edge of adjacent.get(id) ?? []) enqueue(edge.to, cost + edge.cost);
    }
  }
  const directIds = new Set(direct.map((fact) => fact.id));
  const rows = facts.map((fact) => {
    const text = factSearchText(fact);
    return {
      fact,
      proximity: costs.get(fact)! + (directIds.has(fact.id) ? 0 : Math.min(
        (distance.get(fact.subject.id) ?? Infinity) + cost(fact, true),
        (distance.get(fact.object.id) ?? Infinity) + cost(fact, false))),
      relationshipOrder: signals.relationshipOrder(fact),
      focus: focus.filter((term) => text.includes(term)).length,
      tie: stableTie(fact),
    };
  });
  const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const compare = (a: typeof rows[number], b: typeof rows[number]) =>
    a.relationshipOrder - b.relationshipOrder || b.focus - a.focus || lexical(a.tie, b.tie) || lexical(a.fact.id, b.fact.id);
  // Allocate each source's early slots to relationships before local occurrence
  // detail. Otherwise hundreds of nearer variable references consume a file's
  // diversity allowance before its file-to-symbol consumer can be considered.
  // Final ordering below still charges distance and shared-library penalties.
  rows.sort((a, b) => costs.get(a.fact)! - costs.get(b.fact)! ||
    a.relationshipOrder - b.relationshipOrder || a.proximity - b.proximity || compare(a, b));
  const counts = new Map<string, number>();
  const diverse = rows.map((row) => {
    const seen = counts.get(row.fact.provenance.path) ?? 0;
    counts.set(row.fact.provenance.path, seen + 1);
    // Each additional fact from one source costs one ordinary edge. Details stay on later pages.
    return { ...row, score: row.proximity + seen };
  });
  return diverse.sort((a, b) => a.score - b.score || compare(a, b))
    .map(({ fact, score }) => ({ fact, score }));
}
