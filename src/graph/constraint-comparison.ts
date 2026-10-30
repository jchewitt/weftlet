import type { CompatibilityReason, ContractCompatibilityStatus, ObligationDeclaration } from '@weftlet/core';

export interface ConstraintComparison { readonly status: ContractCompatibilityStatus; readonly reasons: readonly CompatibilityReason[] }
const unknown = (...reasons: CompatibilityReason[]): ConstraintComparison => ({ status: 'unknown', reasons });
type Constraint = NonNullable<ObligationDeclaration['constraint']>;
function interval(constraint: Constraint): readonly [number, number] {
  if (constraint.operator === 'at-most') return [-Infinity, constraint.value];
  if (constraint.operator === 'at-least') return [constraint.value, Infinity];
  return [constraint.value, constraint.value];
}
function contextProblems(producer: ObligationDeclaration, consumer: ObligationDeclaration): readonly CompatibilityReason[] {
  const problems: CompatibilityReason[] = [];
  if (!producer.contract.version || !consumer.contract.version) problems.push('unknown-version');
  if (!producer.domain || !consumer.domain || !producer.stage || !consumer.stage ||
      !producer.constraint || !consumer.constraint || !producer.constraint.unit || !consumer.constraint.unit) return [...problems, 'missing-context'];
  if (producer.domain !== consumer.domain) problems.push('different-domain');
  if (producer.constraint.metric !== consumer.constraint.metric) problems.push('different-metric');
  if (producer.constraint.unit !== consumer.constraint.unit) problems.push('different-unit');
  for (const { value } of [producer.constraint, consumer.constraint]) {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) problems.push('unsupported-number');
  }
  return [...new Set(problems)];
}

/** Arithmetic on declared numeric sets only. No unit conversion, policy approval or implementation inference. */
export function compareDeclaredConstraints(producer: ObligationDeclaration, consumer: ObligationDeclaration): ConstraintComparison {
  if (producer.role !== 'guarantee' || consumer.role !== 'requirement') return unknown('wrong-roles');
  const keys = ['scope', 'id', 'kind', 'version'] as const;
  if (keys.some(key => producer.contract[key] !== consumer.contract[key])) return unknown('different-contracts');
  const problems = contextProblems(producer, consumer);
  if (problems.length) return unknown(...problems);
  if (producer.stage !== consumer.stage) return consumer.revalidation === 'required'
    ? { status: 'revalidation-required', reasons: ['different-stage', 'consumer-revalidation'] } : unknown('different-stage');
  const [pl, pu] = interval(producer.constraint!), [cl, cu] = interval(consumer.constraint!);
  if (pu < cl || cu < pl) return { status: 'disjoint-constraints', reasons: ['disjoint'] };
  if (cl <= pl && pu <= cu) return { status: 'compatible-constraints', reasons: ['subset'] };
  if (consumer.revalidation === 'required') return { status: 'revalidation-required', reasons: ['overlap-only', 'consumer-revalidation'] };
  return { status: 'insufficient-guarantee', reasons: ['overlap-only'] };
}
