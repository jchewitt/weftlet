import type { GraphCatalogRequest, GraphCatalogView, GraphFactRequest } from '@weftlet/core';

export const catalogViews: readonly GraphCatalogView[] = ['intent', 'contracts', 'implementation', 'evidence', 'all'];
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Graph discovery arguments must be an object');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !fields.includes(key))) throw new Error('Unknown graph discovery fields');
  return record;
}
function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${field} must be a non-empty string of at most ${max} characters`);
  return value;
}
export function parseGraphCatalogRequest(value: unknown) {
  const record = object(value, ['snapshotId', 'view', 'search', 'maxNodes', 'continuation']);
  const snapshotId = text(record.snapshotId, 'snapshotId', 256);
  const view = record.view === undefined ? 'intent' : record.view;
  if (!catalogViews.includes(view as GraphCatalogView)) throw new Error('Invalid catalog view');
  const search = record.search === undefined ? '' : record.search;
  if (typeof search !== 'string' || search.length > 256) throw new Error('search must be a string of at most 256 characters');
  const maxNodes = record.maxNodes === undefined ? 24 : record.maxNodes;
  if (!Number.isInteger(maxNodes) || Number(maxNodes) < 1 || Number(maxNodes) > 100) throw new Error('maxNodes must be an integer between 1 and 100');
  const continuation = record.continuation === undefined ? undefined : text(record.continuation, 'continuation', 2048);
  return { snapshotId, view: view as GraphCatalogView, search: search.trim().toLowerCase(), maxNodes: Number(maxNodes),
    ...(continuation === undefined ? {} : { continuation }) } satisfies GraphCatalogRequest;
}
export function parseGraphFactRequest(value: unknown): GraphFactRequest {
  const record = object(value, ['snapshotId', 'factId']);
  return { snapshotId: text(record.snapshotId, 'snapshotId', 256), factId: text(record.factId, 'factId', 8192) };
}
