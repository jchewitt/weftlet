import type { ContractCompatibilityRequest } from '@weftlet/core';

/** No search, implicit current head, policy mutation or caller-supplied authority. */
export function parseContractCompatibilityRequest(value: unknown): ContractCompatibilityRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('graph.compatibility arguments must be an object');
  const item = value as Record<string, unknown>, fields = ['snapshotId', 'producerFactId', 'consumerFactId'];
  if (Object.keys(item).some(key => !fields.includes(key))) throw new Error('Unknown graph.compatibility field');
  const identifier = (key: string, maximum: number) => {
    const value = item[key];
    if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`${key} must be a nonempty string of at most ${maximum} characters`);
    return value;
  };
  const request = { snapshotId: identifier('snapshotId', 256), producerFactId: identifier('producerFactId', 8192), consumerFactId: identifier('consumerFactId', 8192) };
  if (request.producerFactId === request.consumerFactId) throw new Error('Select distinct producer and consumer assertion IDs');
  return request;
}
