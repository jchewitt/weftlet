import { graphPredicates, type GraphPredicate, type GraphNeighborsRequest } from '@weftlet/core';

const fields = new Set(['snapshotId', 'nodeId', 'direction', 'predicates', 'maxFacts', 'continuation']);

function identifier(value: unknown, name: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new Error(`${name} must be a non-empty string of at most ${maximum} characters`);
  }
  return value;
}

/** Shared validation/defaults for public API, CLI and MCP. Never interpret IDs as text search. */
export function parseGraphNeighborsRequest(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('graph.neighbors arguments must be an object');
  }
  const record = value as Record<string, unknown>;
  const unexpected = Object.keys(record).filter(field => !fields.has(field));
  if (unexpected.length) throw new Error(`Unknown graph.neighbors fields: ${unexpected.join(', ')}`);
  const snapshotId = identifier(record.snapshotId, 'snapshotId', 256);
  const nodeId = identifier(record.nodeId, 'nodeId', 8192);
  const direction = record.direction === undefined ? 'both' : record.direction;
  if (direction !== 'incoming' && direction !== 'outgoing' && direction !== 'both') {
    throw new Error('direction must be incoming, outgoing or both');
  }
  const predicates = record.predicates === undefined ? [] : record.predicates;
  if (!Array.isArray(predicates) || predicates.length > graphPredicates.length ||
      predicates.some(item => !graphPredicates.includes(item))) {
    throw new Error('predicates must be an array of supported graph predicates');
  }
  const maxFacts = record.maxFacts === undefined ? 60 : record.maxFacts;
  if (!Number.isInteger(maxFacts) || Number(maxFacts) < 1 || Number(maxFacts) > 200) {
    throw new Error('maxFacts must be an integer between 1 and 200');
  }
  const continuation = record.continuation === undefined ? undefined
    : identifier(record.continuation, 'continuation', 2048);
  return { snapshotId, nodeId, direction, predicates: [...new Set(predicates as GraphPredicate[])].sort(),
    maxFacts: Number(maxFacts), ...(continuation === undefined ? {} : { continuation }) } satisfies GraphNeighborsRequest;
}
