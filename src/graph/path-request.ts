import type { GraphPathsRequest } from '@weftlet/core';
import { parseGraphNeighborsRequest } from './neighborhood-request.js';

const fields = new Set(['snapshotId', 'fromNodeId', 'toNodeId', 'direction', 'predicates', 'maxDepth', 'maxPaths', 'maxSteps', 'continuation']);

export function parseGraphPathsRequest(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('graph.paths arguments must be an object');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !fields.has(key))) throw new Error('Unknown graph.paths field');
  const common = { snapshotId: record.snapshotId, direction: record.direction === undefined ? 'outgoing' : record.direction,
    predicates: record.predicates, continuation: record.continuation };
  const from = parseGraphNeighborsRequest({ ...common, nodeId: record.fromNodeId });
  const to = parseGraphNeighborsRequest({ ...common, nodeId: record.toNodeId });
  const bound = (name: string, fallback: number, maximum: number) => {
    const item = record[name] === undefined ? fallback : record[name];
    if (!Number.isInteger(item) || Number(item) < 1 || Number(item) > maximum) {
      throw new Error(`${name} must be an integer between 1 and ${maximum}`);
    }
    return Number(item);
  };
  return { snapshotId: from.snapshotId, fromNodeId: from.nodeId, toNodeId: to.nodeId,
    direction: from.direction, predicates: from.predicates, maxDepth: bound('maxDepth', 8, 32),
    maxPaths: bound('maxPaths', 5, 20), maxSteps: bound('maxSteps', 1000, 10_000),
    ...(from.continuation ? { continuation: from.continuation } : {}) } satisfies GraphPathsRequest;
}
