import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { fetchReportJson, portablePage } from './portable-pages.js';

afterEach(() => vi.unstubAllGlobals());
it('checks exact shard bytes and bounds reads before JSON decoding', async () => {
  const original = JSON.stringify({ fact: 'public-citation' });
  const path = `data/${createHash('sha256').update(original).digest('hex')}.json`;
  const request = vi.fn(async () => new Response(original)); vi.stubGlobal('fetch', request);
  expect(await fetchReportJson(path)).toEqual({ fact: 'public-citation' });
  request.mockImplementation(async () => new Response(original + ' '));
  await expect(fetchReportJson(path)).rejects.toThrow('integrity check');
  request.mockImplementation(async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)); controller.close();
  } })));
  await expect(fetchReportJson(path)).rejects.toThrow('size limit');
});
it('rejects paths outside hashed data shards before making a request', async () => {
  const request = vi.fn(); vi.stubGlobal('fetch', request);
  for (const path of ['../config.json', 'https://example.invalid/data.json', 'data/../config.json', 'data/plain.json']) {
    await expect(fetchReportJson(path)).rejects.toThrow('data path');
  }
  expect(request).not.toHaveBeenCalled();
});
it('binds deterministic UTF-8 continuations to the report, query and page size', () => {
  const binding = { report: 'a'.repeat(64), search: 'réservation 🌱', max: 1 };
  const first = portablePage(undefined, binding, 3, 1);
  expect(portablePage(undefined, binding, 3, 1)).toEqual(first);
  expect(portablePage(first.continuation, binding, 3, 1).offset).toBe(1);
  expect(() => portablePage(first.continuation, { ...binding, report: 'other' }, 3, 1)).toThrow('continuation');
  expect(() => portablePage(first.continuation, { ...binding, max: 2 }, 3, 2)).toThrow('continuation');
  expect(portablePage(portablePage(first.continuation, binding, 3, 1).continuation, binding, 3, 1).continuation).toBeUndefined();
});
