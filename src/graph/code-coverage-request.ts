import type { CodeCoverageRequest } from '@weftlet/core';

export function parseCodeCoverageRequest(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('graph.coverage arguments must be an object');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !['snapshotId', 'projectRoot', 'maxItems', 'continuation'].includes(key))) throw new Error('Unknown graph.coverage field');
  const text = (key: string, max: number) => {
    const s = item[key];
    if (typeof s !== 'string' || !s.trim() || s.length > max) throw new Error(`${key} must be a nonempty string of at most ${max} characters`);
    return s;
  };
  const maxItems = item.maxItems === undefined ? 50 : item.maxItems;
  if (!Number.isInteger(maxItems) || Number(maxItems) < 1 || Number(maxItems) > 200) throw new Error('maxItems must be an integer between 1 and 200');
  return { snapshotId: text('snapshotId', 256), maxItems: Number(maxItems),
    ...(item.projectRoot === undefined ? {} : { projectRoot: text('projectRoot', 8192) }),
    ...(item.continuation === undefined ? {} : { continuation: text('continuation', 2048) }) } satisfies CodeCoverageRequest;
}
