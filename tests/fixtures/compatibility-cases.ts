import type { ContractCompatibilityStatus, ObligationDeclaration } from '@weftlet/core';
import { document } from './obligation-project.js';

interface Case { id: string; expected: ContractCompatibilityStatus; p?: Partial<ObligationDeclaration>;
  c?: Partial<ObligationDeclaration>; competitor?: boolean }
const limit = (value: number, operator: 'at-most' | 'at-least' = 'at-most', unit: string | undefined = 'seconds') =>
  ({ metric: 'reading-age', operator, value, unit });
// Public source cases and expected outcomes are declared before extraction. No graph relationships are injected.
export const compatibilityCases: readonly Case[] = [
  { id: 'queue-subset', expected: 'compatible-constraints' },
  { id: 'weaker-guarantee', expected: 'insufficient-guarantee', p: { constraint: limit(600) } },
  { id: 'disjoint', expected: 'disjoint-constraints', p: { constraint: limit(120, 'at-least') } },
  { id: 'stored-revalidation', expected: 'revalidation-required', p: { stage: 'collection', constraint: limit(600) },
    c: { stage: 'execution', revalidation: 'required' } },
  { id: 'unknown-stage-transition', expected: 'unknown', c: { stage: 'execution' } },
  { id: 'missing-unit', expected: 'unknown', c: { constraint: { ...limit(60), unit: undefined } } },
  { id: 'different-unit', expected: 'unknown', c: { constraint: limit(1, 'at-most', 'minutes') } },
  { id: 'unknown-version', expected: 'unknown' },
  { id: 'missing-endpoint', expected: 'unknown', c: { endpoint: 'services/absent.ts' } },
  { id: 'unrelated-domain', expected: 'unknown', c: { domain: 'billing', endpoint: 'services/billing.ts' } },
  { id: 'competing', expected: 'unknown', competitor: true },
];
export function declarations(item: Case): readonly [ObligationDeclaration, ObligationDeclaration] {
  const contract = { scope: 'sensors', id: item.id, kind: item.id === 'stored-revalidation' ? 'stored-data' as const : 'queue' as const,
    ...(item.id === 'unknown-version' ? {} : { version: '1' }) };
  const p: ObligationDeclaration = { schemaVersion: 1, id: 'producer', role: 'guarantee', endpoint: 'services/collector.ts', contract,
    statement: 'Producer declares this reading-age limit at the named stage.', domain: 'sensors', stage: 'handoff', constraint: limit(20), ...item.p };
  const c: ObligationDeclaration = { ...p, id: 'consumer', role: 'requirement', endpoint: 'services/executor.ts',
    statement: 'Consumer requires this reading-age limit at the named stage.', constraint: limit(60), stage: 'handoff', ...item.c,
    ...(item.id === 'unrelated-domain' ? { contract: { ...contract, scope: 'billing' } } : {}) };
  return [p, c];
}
export const compatibilityFiles: Readonly<Record<string, string>> = Object.fromEntries(compatibilityCases.flatMap(item => {
  const [p, c] = declarations(item);
  return [[`docs/${item.id}-producer.md`, document(p)], [`docs/${item.id}-consumer.md`, document(c)],
    ...(item.competitor ? [['docs/competing-other.md', document({ ...p, id: 'another-guarantee', constraint: limit(120, 'at-least') })]] : [])];
}));
