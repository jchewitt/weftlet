import type { GraphFact } from '@weftlet/core';
import { codeEvidenceDescription } from './code-description.js';

/** Display the same structured assertion returned by queries; unknown values are never inferred. */
export function factEvidenceDescription(fact: GraphFact): string | undefined {
  const obligation = fact.contractObligation?.declaration;
  if (!obligation) return codeEvidenceDescription(fact);
  const constraint = obligation.constraint;
  return `declared ${obligation.role}: ${obligation.statement}; ${obligation.contract.kind} contract ` +
    `${obligation.contract.scope}/${obligation.contract.id}; version ${obligation.contract.version ?? 'unknown'}; ` +
    `domain ${obligation.domain ?? 'unknown'}; stage ${obligation.stage ?? 'unknown'}; ` +
    (constraint ? `${constraint.metric} ${constraint.operator} ${constraint.value}; unit ${constraint.unit ?? 'unknown'}; ` : 'constraint unknown; ') +
    `consumer revalidation ${obligation.revalidation ?? 'unknown'}; fulfillment, delivery and compatibility not evaluated`;
}
