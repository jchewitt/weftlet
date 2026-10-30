import { expect, it } from 'vitest';
import { buildCodeInventory } from './code-inventory.js';
import type { GitTreeEntry } from '../repository/git.js';
import type { GraphSnapshot } from '@weftlet/core';
import { projectCodeCoverage } from '../graph/code-coverage-projection.js';

const entry = (path: string, mode = '100644'): GitTreeEntry => ({ path, mode, type: 'blob', objectId: `blob:${path}` });
const entries = ['package.json', 'services/api/package.json', 'services/api/src/entry.ts', 'services/api/src/empty.ts',
  'services/api/src/imported.ts', 'services/omitted/package.json', 'services/omitted/src/run.ts', 'types.d.ts', 'script.py'].map(path => entry(path));
const index = { path: '/unused', digest: 'scip', mode: 'full' as const, version: 'test',
  indexedPaths: ['services/api/src/entry.ts', 'services/api/src/imported.ts'] };
const project = { include: ['services/api/src/entry.ts', 'services/api/src/empty.ts'] };

it('separates code roots, requested entries, observed imports and omitted projects without inferring from facts', () => {
  const inventory = buildCodeInventory([...entries, entry('linked.ts', '120000')], ['services/api/src/empty.ts'], ['services/api'], project, index);
  expect(inventory.projects.map(p => p.root)).toEqual(['.', 'services/api', 'services/omitted']);
  expect(inventory.files).toHaveLength(5);
  expect(inventory.files.find(f => f.path.endsWith('empty.ts'))).toMatchObject({ codeRootSelected: true, requested: 'included', indexed: false });
  expect(inventory.files.find(f => f.path.endsWith('imported.ts'))).toMatchObject({ codeRootSelected: false, requested: 'excluded', indexed: true });
  expect(inventory.files.find(f => f.path.endsWith('run.ts'))).toMatchObject({ projectRoot: 'services/omitted', requested: 'excluded', indexed: false });
  expect(buildCodeInventory([...entries].reverse(), ['services/api/src/empty.ts'], ['services/api'], project, index)).toEqual(inventory);
});

it('records unknown request selection for arbitrary indexer commands and unknown observation for older indexers', () => {
  const inventory = buildCodeInventory(entries, [], [], undefined, { ...index, indexedPaths: undefined });
  expect(inventory.indexObservation).toBe('unavailable');
  expect(inventory.files.every(file => file.requested === 'unknown' && file.indexed === undefined)).toBe(true);
  const observed = buildCodeInventory(entries, [], [], undefined, index);
  expect(observed.files.find(f => f.path.endsWith('entry.ts'))).toMatchObject({ requested: 'unknown', indexed: true });
});

it('distinguishes absent and corrupted inventory from measured zeroes', () => {
  const inventory = buildCodeInventory(entries, [], [], project, index);
  const snapshot = { manifest: { scipIndexDigest: 'scip', codeInventory: inventory }, facts: [], diagnostics: [] } as unknown as GraphSnapshot;
  expect(projectCodeCoverage(snapshot).overview.totals).toMatchObject({ files: 5, indexed: 2, requestedNotIndexed: 1, indexedOutsideRequest: 1 });
  const absent = projectCodeCoverage({ ...snapshot, manifest: { ...snapshot.manifest, codeInventory: undefined } });
  expect(absent.overview).toMatchObject({ status: 'unavailable' }); expect(absent.overview.totals).toBeUndefined();
  const corrupt = projectCodeCoverage({ ...snapshot, manifest: { ...snapshot.manifest, codeInventory: { ...inventory, files: [] } } });
  expect(corrupt.overview.status).toBe('invalid-inventory'); expect(corrupt.overview.totals).toBeUndefined();
  expect(projectCodeCoverage({ ...snapshot, manifest: { ...snapshot.manifest, scipIndexDigest: 'other' } }).overview.status).toBe('invalid-inventory');
});
