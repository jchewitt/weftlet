import { expect, it } from 'vitest';
import { searchEvidencePaths, type PathEdge } from './path-search.js';

const options = { maxDepth: 8, maxPaths: 20, maxSteps: 1000 };
const edge = (id: string, from: string, to: string): PathEdge => ({ id, from, to });
const signatures = (paths: readonly { factIds: readonly string[] }[]) => paths.map(path => path.factIds.join(',')).sort();

it('returns a known direct edge before unrelated branches exhaust the unchanged work page', () => {
  const edges = Array.from({ length: 1500 }, (_, i) => [
    edge(`a-${i}`, 'start', `branch-${i}`),
    edge(`b-${i}`, `branch-${i}`, `deep-${i}`),
    edge(`c-${i}`, `deep-${i}`, `leaf-${i}`),
  ]).flat();
  edges.push(edge('zz-direct', 'start', 'target'));
  const page = searchEvidencePaths(edges, 'start', 'target', { maxDepth: 3, maxPaths: 3, maxSteps: 1000 });
  expect(page.paths[0]).toEqual({ nodeIds: ['start', 'target'], factIds: ['zz-direct'] });
  expect(page.search).toMatchObject({ examinedSteps: 1000, stopReason: 'work-page-limit', truncated: true });
  expect(page.frontier.pendingCount).toBe(1000);
  expect(page.frontier.pending).toHaveLength(32);
  expect(page.frontier.omittedPending).toBe(968);
  expect(searchEvidencePaths([...edges].reverse(), 'start', 'target', { maxDepth: 3, maxPaths: 3, maxSteps: 1000 }))
    .toEqual(page);
});

it('returns paths in nondecreasing length across work and output pages', () => {
  const edges = [edge('a', 's', 'a'), edge('b', 'a', 'b'), edge('c', 'b', 't'),
    edge('d', 's', 'c'), edge('e', 'c', 't'), edge('z', 's', 't')];
  const expected = [['z'], ['d', 'e'], ['a', 'b', 'c']];
  expect(searchEvidencePaths(edges, 's', 't', options).paths.map(path => path.factIds)).toEqual(expected);
  let offset = 0;
  const found: string[][] = [];
  for (;;) {
    const page = searchEvidencePaths(edges, 's', 't', { ...options, maxPaths: 1, maxSteps: 1, offset });
    found.push(...page.paths.map(path => [...path.factIds]));
    if (page.search.exhaustedWithinDepth) break;
    offset = page.search.totalSteps;
  }
  expect(found).toEqual(expected);
});

it('matches an independent exhaustive oracle on all 4096 directed four-node graphs', () => {
  const possible = Array.from({ length: 4 }, (_, from) => Array.from({ length: 4 }, (_, to) =>
    from === to ? [] : [edge(`${from}-${to}`, String(from), String(to))])).flat(2);
  for (let mask = 0; mask < 2 ** possible.length; mask++) {
    const edges = possible.filter((_, index) => mask & (1 << index));
    const expected: string[] = [];
    const visit = (nodes: string[], ids: string[]) => {
      if (nodes.at(-1) === '3') { expected.push(ids.join(',')); return; }
      for (const item of edges) if (item.from === nodes.at(-1) && !nodes.includes(item.to)) visit([...nodes, item.to], [...ids, item.id]);
    };
    visit(['0'], []);
    const actual = searchEvidencePaths([...edges].reverse(), '0', '3', { ...options, maxDepth: 3 });
    expect(signatures(actual.paths), `graph ${mask}`).toEqual(expected.sort());
    expect(actual.search.truncated).toBe(false);
  }
});

it('pages competing branches, parallel evidence, cycles and self-links without omissions or duplicates', () => {
  const edges = [edge('1', 'a', 'b'), edge('2', 'a', 'b'), edge('3', 'b', 't'), edge('4', 'a', 'c'),
    edge('5', 'c', 'b'), edge('6', 'b', 'c'), edge('7', 'c', 't'), edge('8', 'c', 'a'), edge('9', 'a', 'a')];
  const full = searchEvidencePaths(edges, 'a', 't', options);
  expect(signatures(full.paths)).toEqual(['1,3', '1,6,7', '2,3', '2,6,7', '4,5,3', '4,7']);
  for (const maxSteps of [1, 2, 10]) {
    let offset = 0;
    const collected = [];
    for (;;) {
      const page = searchEvidencePaths(edges, 'a', 't', { ...options, maxPaths: 1, maxSteps, offset });
      collected.push(...page.paths);
      expect(page.search.examinedSteps).toBeLessThanOrEqual(maxSteps);
      expect(page.search.replayedSteps).toBe(offset);
      if (page.search.exhaustedWithinDepth) break;
      expect(page.frontier.pending.length).toBeGreaterThan(0);
      expect(page.frontier.pending.every(item => edges.some(edge => edge.id === item.nextFactId))).toBe(true);
      offset = page.search.totalSteps;
    }
    expect(collected).toEqual(full.paths);
  }
});

it('exposes deep work and depth truncation, and does not confuse a blank work page with absence', () => {
  const chain = Array.from({ length: 12 }, (_, index) => edge(String(index).padStart(2, '0'), String(index), String(index + 1)));
  const limited = searchEvidencePaths(chain, '0', '12', { ...options, maxDepth: 3 });
  expect(limited.paths).toEqual([]);
  expect(limited.search).toMatchObject({ exhaustedWithinDepth: true, depthLimitReached: true, truncated: true });
  expect(limited.frontier.depthLimited).toEqual({ count: 1, omitted: 0,
    examples: [{ nodeId: '3', viaFactIds: ['00', '01', '02'], nextFactId: '03', nextNodeId: '4' }] });
  const blank = searchEvidencePaths(chain, '0', '12', { ...options, maxDepth: 12, maxSteps: 2 });
  expect(blank.paths).toEqual([]);
  expect(blank.search).toMatchObject({ stopReason: 'work-page-limit', truncated: true, totalSteps: 2 });
  expect(searchEvidencePaths(chain, '0', '12', { ...options, maxDepth: 12 }).paths[0]!.factIds).toEqual(chain.map(item => item.id));
  expect(() => searchEvidencePaths(chain, '0', '12', { ...options, offset: 1 })).toThrow('boundary');
  expect(searchEvidencePaths(chain, '3', '3', options).paths).toEqual([{ nodeIds: ['3'], factIds: [] }]);
  expect(searchEvidencePaths(chain, 'missing', 'missing', options).paths).toEqual([]);
});

it('bounds depth frontier examples and retains their omitted count', () => {
  const edges = [edge('start', 's', 'a'), ...Array.from({ length: 25 }, (_, i) => edge(String(i), 'a', 'n'+i)), edge('target', 'x', 't')];
  const result = searchEvidencePaths(edges, 's', 't', { ...options, maxDepth: 1 });
  expect(result.frontier.depthLimited.count).toBe(25);
  expect(result.frontier.depthLimited.examples).toHaveLength(20);
  expect(result.frontier.depthLimited.omitted).toBe(5);
});

it('enforces a total work ceiling even across repeated pages on an exponential search', () => {
  const edges = Array.from({ length: 10 }, (_, i) => Array.from({ length: 10 }, (_, j) => edge(`${i}-${j}`, String(i), String(j)))).flat();
  edges.push(edge('target', 'unreachable', 't'));
  let offset = 0;
  for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
    const page = searchEvidencePaths(edges, '0', 't', { ...options, maxDepth: 32, maxSteps: 10000, offset });
    offset = page.search.totalSteps;
    expect(page.paths).toEqual([]);
    expect(page.search.examinedSteps).toBe(10000);
    expect(page.frontier.pending.length).toBeLessThanOrEqual(33);
    if (pageIndex === 9) expect(page.search).toMatchObject({ totalSteps: 100000, stopReason: 'search-limit', truncated: true });
  }
  expect(() => searchEvidencePaths(edges, '0', 't', { ...options, offset })).toThrow('offset');
});
