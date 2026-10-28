import { graphPredicates, type GraphExplorationService } from '@weftlet/core';
import { parseGraphNeighborsRequest } from '../graph/neighborhood-request.js';

export const graphNeighborsTool = {
  name: 'graph.neighbors',
  description: 'Look up an exact node ID in an explicit saved snapshot and page through its cited one-hop relationships. Follow returned neighbor IDs to explore further; no hydration or model calls.',
  inputSchema: {
    type: 'object' as const, additionalProperties: false, required: ['snapshotId', 'nodeId'],
    properties: {
      snapshotId: { type: 'string', minLength: 1, maxLength: 256 },
      nodeId: { type: 'string', minLength: 1, maxLength: 8192 },
      direction: { type: 'string', enum: ['incoming', 'outgoing', 'both'] },
      predicates: { type: 'array', maxItems: graphPredicates.length, items: { type: 'string', enum: [...graphPredicates] } },
      maxFacts: { type: 'integer', minimum: 1, maximum: 200 },
      continuation: { type: 'string', minLength: 1, maxLength: 2048 },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

export function handleGraphNeighbors(service: GraphExplorationService, value: unknown) {
  return service.neighbors(parseGraphNeighborsRequest(value));
}

export function graphNeighborsRequestFromArgs(args: readonly string[]) {
  const values: Record<string, unknown> = {};
  const flags: Record<string, string> = { '--snapshot': 'snapshotId', '--node': 'nodeId',
    '--direction': 'direction', '--predicate': 'predicates', '--max-facts': 'maxFacts', '--continuation': 'continuation' };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === '--json') continue;
    if (flag !== '--config' && !Object.hasOwn(flags, flag)) throw new Error(`Unknown graph neighbors argument: ${flag}`);
    const value = args[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--config') continue;
    const key = flags[flag]!;
    if (key === 'predicates') values[key] = [...(values[key] as string[] | undefined ?? []), value];
    else {
      if (Object.hasOwn(values, key)) throw new Error(`Repeated graph neighbors argument: ${flag}`);
      values[key] = key === 'maxFacts' ? Number(value) : value;
    }
  }
  return parseGraphNeighborsRequest(values);
}
