import type { GraphNode } from './core.js';
import { sha256, stableJson } from './util.js';

import type { ObligationContract, ObligationDeclaration } from './obligation-types.js';
export type { ObligationContract, ObligationDeclaration, ContractObligation } from './obligation-types.js';

type RecordValue = Record<string, unknown>;
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      required.some(key => !Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => ![...required, ...optional].includes(key))) {
    throw new Error('Obligation declaration has missing or unsupported fields');
  }
  return value as RecordValue;
}
function text(value: unknown, maximum = 200): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > maximum || /[\x00-\x1f\x7f-\x9f]/.test(value)) {
    throw new Error('Obligation text must be nonempty, bounded and free of control characters');
  }
  return value;
}
function oneOf<const T extends string>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw new Error('Unsupported obligation enumeration value');
  return value as T;
}
function constraint(value: unknown): NonNullable<ObligationDeclaration['constraint']> {
  const item = record(value, ['metric', 'operator', 'value'], ['unit']);
  if (typeof item.value !== 'number' || !Number.isFinite(item.value)) throw new Error('Obligation constraint needs a finite numeric value');
  return { metric: text(item.metric), operator: oneOf(item.operator, ['at-most', 'at-least', 'equal']), value: item.value,
    ...(item.unit === undefined ? {} : { unit: text(item.unit) }) };
}

/** Shared strict contract for source declarations and same-fact RDF integrity checks. No interpretation or unit conversion. */
export function parseObligationDeclaration(value: unknown): ObligationDeclaration {
  const item = record(value, ['schemaVersion', 'id', 'role', 'endpoint', 'contract', 'statement'], ['domain', 'stage', 'constraint', 'revalidation']);
  if (item.schemaVersion !== 1) throw new Error('Obligation schemaVersion must be 1');
  const endpoint = text(item.endpoint, 1024);
  if (/[\\:*?\[\]{}%#]/.test(endpoint) || endpoint.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Obligation endpoint must be a canonical repository-relative file');
  }
  const contract = record(item.contract, ['scope', 'id', 'kind'], ['version']);
  const role = oneOf(item.role, ['guarantee', 'requirement']);
  if (item.revalidation !== undefined && role !== 'requirement') throw new Error('Only a consumer requirement may declare revalidation');
  return { schemaVersion: 1, id: text(item.id), role, endpoint,
    contract: { scope: text(contract.scope), id: text(contract.id), kind: oneOf(contract.kind, ['queue', 'stored-data']),
      ...(contract.version === undefined ? {} : { version: text(contract.version) }) },
    statement: text(item.statement, 4000),
    ...(item.domain === undefined ? {} : { domain: text(item.domain) }),
    ...(item.stage === undefined ? {} : { stage: text(item.stage) }),
    ...(item.constraint === undefined ? {} : { constraint: constraint(item.constraint) }),
    ...(item.revalidation === undefined ? {} : { revalidation: oneOf(item.revalidation, ['required', 'not-required']) }) };
}

export function obligationContractNode(repositoryId: string, contract: ObligationContract): GraphNode {
  return { id: `contract:obligation:${sha256(stableJson({ repositoryId, scope: contract.scope, id: contract.id,
    kind: contract.kind, version: contract.version ?? null }))}`, kind: 'Contract',
    label: `${contract.scope}/${contract.id} (${contract.kind}, version ${contract.version ?? 'unknown'})` };
}
