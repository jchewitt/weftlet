import { expect, it, vi } from 'vitest';
import { createGraphReadClient } from './graph-read-client.js';

it('keeps the deployment prefix and rejects responses from a different snapshot', async () => {
  const snapshotId = 'pinned', params = { nodeId: 'workflow:reserve', maxFacts: 3, continuation: 'page-two' };
  const send = vi.fn<typeof fetch>(async () => Response.json({ snapshot: { snapshotId: 'another' } }));
  const client = createGraphReadClient({ baseUrl: 'https://example.test/projects/store', snapshotId, fetch: send });
  await expect(client.neighbors(params)).rejects.toThrow('pinned snapshot');
  const [url, init] = send.mock.calls[0]!;
  expect(url).toBe('https://example.test/projects/store/api/v1/query');
  expect(JSON.parse(String(init?.body))).toEqual({ method: 'graph.neighbors', params: { ...params, snapshotId } });
  await expect(client.neighbors({ ...params, snapshotId: 'different' })).rejects.toThrow('pinned snapshot');
  expect(send).toHaveBeenCalledTimes(1);
});

it('reports the HTTP status when a proxy returns a non-JSON error', async () => {
  const client = createGraphReadClient({ baseUrl: 'https://example.test/', snapshotId: 'pinned',
    fetch: async () => new Response('Unavailable', { status: 503 }) });
  await expect(client.catalog()).rejects.toThrow('HTTP 503');
});
