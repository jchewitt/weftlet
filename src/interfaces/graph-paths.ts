import { parseGraphQueryArgs } from './graph-query-args.js';
import { graphPredicates, type GraphPathQueryService } from '@weftlet/core';
import { parseGraphPathsRequest } from '../graph/path-request.js';

export const graphPathsTool = {
  name: 'graph.paths',
  description: 'Explore simple cited paths between exact node IDs in an explicit saved snapshot. Depth-first assertion order, not shortest/causal paths. Follow continuation with identical selectors; inspect depth/work limits and unexplored frontier. No hydration or model calls.',
  inputSchema: {
    type: 'object' as const, additionalProperties: false, required: ['snapshotId', 'fromNodeId', 'toNodeId'],
    properties: {
      snapshotId: { type: 'string', minLength: 1, maxLength: 256 },
      fromNodeId: { type: 'string', minLength: 1, maxLength: 8192 },
      toNodeId: { type: 'string', minLength: 1, maxLength: 8192 },
      direction: { type: 'string', enum: ['incoming', 'outgoing', 'both'] },
      predicates: { type: 'array', maxItems: graphPredicates.length, items: { type: 'string', enum: [...graphPredicates] } },
      maxDepth: { type: 'integer', minimum: 1, maximum: 32 },
      maxPaths: { type: 'integer', minimum: 1, maximum: 20 },
      maxSteps: { type: 'integer', minimum: 1, maximum: 10000 },
      continuation: { type: 'string', minLength: 1, maxLength: 2048 },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

export function handleGraphPaths(service: GraphPathQueryService, value: unknown) {
  return service.paths(parseGraphPathsRequest(value));
}

export function graphPathsRequestFromArgs(args: readonly string[]) {
  const flags: Record<string, string> = { '--snapshot': 'snapshotId', '--from': 'fromNodeId', '--to': 'toNodeId',
    '--direction': 'direction', '--predicate': 'predicates', '--max-depth': 'maxDepth', '--max-paths': 'maxPaths',
    '--max-steps': 'maxSteps', '--continuation': 'continuation' };
  return parseGraphPathsRequest(parseGraphQueryArgs(args, 'paths', flags));
}
