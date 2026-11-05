import type { GraphDiscoveryService } from '@weftlet/core';
import { catalogViews, parseGraphCatalogRequest, parseGraphFactRequest } from '../graph/discovery-request.js';
import { parseGraphQueryArgs } from './graph-query-args.js';

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const snapshot = { type: 'string', minLength: 1, maxLength: 256 };
export const graphCatalogTool = {
  name: 'graph.catalog',
  description: 'Discover intent, contracts, code or evidence across an exact saved snapshot, independently of impact pagination. Counts cover saved evidence only; intent-source assertions may be unreviewed. Follow exact node IDs with graph.neighbors and representative assertion IDs with graph.fact.',
  inputSchema: { type: 'object' as const, additionalProperties: false, required: ['snapshotId'], properties: {
    snapshotId: snapshot, view: { type: 'string', enum: [...catalogViews] }, search: { type: 'string', maxLength: 256 },
    maxNodes: { type: 'integer', minimum: 1, maximum: 100 }, continuation: { type: 'string', minLength: 1, maxLength: 2048 },
  } }, annotations,
};
export const graphFactTool = {
  name: 'graph.fact',
  description: 'Read one exact saved assertion, including unchanged citations, authority, review and code evidence. Absence is specific to this snapshot; this query neither approves assertions nor refreshes evidence.',
  inputSchema: { type: 'object' as const, additionalProperties: false, required: ['snapshotId', 'factId'], properties: {
    snapshotId: snapshot, factId: { type: 'string', minLength: 1, maxLength: 8192 },
  } }, annotations,
};
export function handleGraphDiscovery(service: GraphDiscoveryService, name: string, value: unknown) {
  if (name === graphCatalogTool.name) return service.catalog(parseGraphCatalogRequest(value));
  if (name === graphFactTool.name) return service.fact(parseGraphFactRequest(value));
  throw new Error('Unknown graph discovery tool');
}
export async function handleGraphDiscoveryTool(service: GraphDiscoveryService, name: string, value: unknown) {
  try {
    const result = await handleGraphDiscovery(service, name, value);
    return { content: [{ type: 'text' as const, text: result.markdown }, { type: 'text' as const, text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Discovery query failed' }] };
  }
}
export function graphCatalogRequestFromArgs(args: readonly string[]) {
  return parseGraphCatalogRequest(parseGraphQueryArgs(args, 'catalog', { '--snapshot': 'snapshotId', '--view': 'view',
    '--search': 'search', '--max-nodes': 'maxNodes', '--continuation': 'continuation' }));
}
export function graphFactRequestFromArgs(args: readonly string[]) {
  return parseGraphFactRequest(parseGraphQueryArgs(args, 'fact', { '--snapshot': 'snapshotId', '--fact': 'factId' }));
}
