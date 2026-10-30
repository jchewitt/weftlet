import type { ContractCompatibilityService } from '@weftlet/core';
import { parseContractCompatibilityRequest } from '../graph/compatibility-request.js';
import { parseGraphQueryArgs } from './graph-query-args.js';

export const graphCompatibilityTool = {
  name: 'graph.compatibility',
  description: 'Compare two exact cited producer/consumer numeric obligations from a saved snapshot. Reports subset, insufficient guarantee, disjoint constraints, required revalidation or unknown. Advisory only: never proves implementation, current-diff validity or a CI policy violation. Discover assertion IDs with graph.neighbors.',
  inputSchema: { type: 'object' as const, additionalProperties: false,
    required: ['snapshotId', 'producerFactId', 'consumerFactId'], properties: {
      snapshotId: { type: 'string', minLength: 1, maxLength: 256 },
      producerFactId: { type: 'string', minLength: 1, maxLength: 8192 },
      consumerFactId: { type: 'string', minLength: 1, maxLength: 8192 },
    } },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};
export function handleGraphCompatibility(service: ContractCompatibilityService, value: unknown) {
  return service.assess(parseContractCompatibilityRequest(value));
}
export function graphCompatibilityRequestFromArgs(args: readonly string[]) {
  return parseContractCompatibilityRequest(parseGraphQueryArgs(args, 'compatibility', {
    '--snapshot': 'snapshotId', '--producer-fact': 'producerFactId', '--consumer-fact': 'consumerFactId',
  }));
}
