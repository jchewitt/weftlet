import { expect, it } from 'vitest';
import { corpusLifecycle } from '../scripts/large-graph/lifecycle.js';

it('indexes public TypeScript through strict hydration, streamed persistence/RDF, reuse and clean comparison', async () => {
  const result = await corpusLifecycle(2, 20);
  expect(result.factCount).toBeGreaterThan(500);
  expect(result.repeatReused).toBe(18);
  expect(result.cleanReused).toBe(18);
}, 180_000);
