import type { ContextPack, GraphFact } from '@weftlet/core';
import { contextPackLaneForFact, isProductIntentEvidence } from './coverage-facts.js';

/** Repository paths, not host paths: keep case and do not resolve .. or roots. */
export function normalizeOwnerDocument(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\/(?=.)/, '');
}
export function citesOwner(fact: GraphFact, owner: string | undefined): boolean {
  return owner !== undefined && normalizeOwnerDocument(fact.provenance.path) === normalizeOwnerDocument(owner);
}

const generatedLinks = new Set(['document-linker', 'document-evidence-extractor']);
function isAssertion(fact: GraphFact): boolean {
  return !generatedLinks.has(fact.extractor.id);
}

export function ownerIntentDescription(exploration: ContextPack['exploration']): readonly string[] {
  const report = exploration?.ownerIntent;
  return report ? [
    `Owner intent evidence: ${report.returnedFacts}/${report.intentFacts} returned/reachable; ` +
      `assertions excluding generated document links: ${report.returnedAssertions}/${report.assertionFacts}.`,
    'Owner priority is a bounded selection, not proof of task relevance, completeness or assertion approval.',
  ] : [];
}

/** Reserve at most four leading slots for an explicitly requested owner's
 * evidence. Preserve every other fact's baseline order. Source approval never
 * changes assertion authority. This is a bounded overview, not full owner recall. */
export function prioritizeOwnerIntent(ranked: readonly GraphFact[], owner: string | undefined) {
  if (owner === undefined) return { facts: ranked, report: (_page: readonly GraphFact[]) => undefined };
  const cited = ranked.filter(fact => citesOwner(fact, owner));
  const intent = cited.filter(isProductIntentEvidence);
  const assertions = intent.filter(isAssertion);
  const priority: GraphFact[] = [];
  // Include conceptual relationships, business contracts and implementation
  // mappings before letting generated containment/reference links fill slots.
  for (const cohort of [assertions, intent.filter(fact => !isAssertion(fact))]) {
    const queues = ['productIntent', 'contractsAndInvariants', 'implementationAndConsumers']
      .map(lane => cohort.filter(fact => contextPackLaneForFact(fact) === lane));
    for (let i = 0; priority.length < 4 && queues.some(queue => i < queue.length); i++) {
      for (const queue of queues) {
        if (priority.length < 4 && queue[i]) priority.push(queue[i]!);
      }
    }
  }
  const selected = new Set(priority.map(fact => fact.id));
  const ids = new Set(intent.map(fact => fact.id)), assertionIds = new Set(assertions.map(fact => fact.id));
  return {
    facts: [...priority, ...ranked.filter(fact => !selected.has(fact.id))],
    report(page: readonly GraphFact[]): NonNullable<ContextPack['exploration']>['ownerIntent'] {
      return { policy: 'exact-owner-intent-v1', scope: 'reachable-evidence',
        ownerDocument: normalizeOwnerDocument(owner), citedFacts: cited.length,
        intentFacts: intent.length, assertionFacts: assertions.length, priorityFactIds: [...selected],
        returnedFacts: page.filter(fact => ids.has(fact.id)).length,
        returnedAssertions: page.filter(fact => assertionIds.has(fact.id)).length };
    },
  };
}
