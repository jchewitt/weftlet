import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createComparisonWorkspace, writeComparisonReceipt } from './comparison-workspace.js';

const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), 'weftlet-comparison-')); roots.push(path); return path; }
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
it('preserves unrelated abandoned work and does not follow child links during owned cleanup', async () => {
  const storage = await root(), outside = await root();
  await mkdir(join(storage, 'work/compare-old'), { recursive: true });
  await writeFile(join(storage, 'work/compare-old/lease.json'), 'old lease is not permission to delete');
  await writeFile(join(outside, 'retained'), 'evidence');
  const operation = await createComparisonWorkspace(storage);
  await symlink(outside, join(operation.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await operation.dispose();
  expect(await readFile(join(outside, 'retained'), 'utf8')).toBe('evidence');
  expect(await readdir(join(storage, 'work'))).toEqual(['compare-old']);
});
it('refuses linked cache parents and swapped operation roots', async () => {
  const storage = await root(), outside = await root();
  await symlink(outside, join(storage, 'work'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(createComparisonWorkspace(storage)).rejects.toThrow('symbolic links or junctions');
  await rm(join(storage, 'work'));
  const operation = await createComparisonWorkspace(storage);
  await rename(operation.root, `${operation.root}-retained`);
  await symlink(outside, operation.root, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(operation.dispose()).rejects.toThrow('symbolic links or junctions');
  expect(await readdir(outside)).toEqual([]);
});
it('publishes bounded immutable receipts and refuses altered ownership', async () => {
  const storage = await root(), operation = await createComparisonWorkspace(storage);
  const path = await writeComparisonReceipt(storage, operation.operationId, { status: 'passed' });
  await expect(writeComparisonReceipt(storage, operation.operationId, { status: 'changed' })).rejects.toThrow();
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ status: 'passed' });
  await expect(writeComparisonReceipt(storage, operation.operationId, 'x'.repeat(262_144))).rejects.toThrow('256 KiB');
  await writeFile(join(operation.root, 'lease.json'), '{}');
  await expect(operation.dispose()).rejects.toThrow('ownership changed');
  expect(await readdir(join(storage, 'comparison-receipts'))).toHaveLength(1);
});
