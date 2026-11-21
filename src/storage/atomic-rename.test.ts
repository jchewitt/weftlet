import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { withHeadLock } from './head-lock.js';
import { atomicRename } from './atomic-rename.js';
import { FileSnapshotStore } from './storage.js';

const mocks = vi.hoisted(() => ({ open: vi.fn(), rename: vi.fn(), delay: vi.fn(), platform: 'win32' }));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, open: mocks.open.mockImplementation(actual.open), rename: mocks.rename.mockImplementation(actual.rename) };
});
vi.mock('node:process', () => ({ get platform() { return mocks.platform; } }));
vi.mock('node:timers/promises', () => ({ setTimeout: mocks.delay }));

const roots: string[] = [];
afterEach(async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  mocks.open.mockReset().mockImplementation(actual.open);
  mocks.rename.mockReset().mockImplementation(actual.rename);
  mocks.delay.mockReset();
  mocks.platform = 'win32';
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function files() {
  const root = await mkdtemp(join(tmpdir(), 'atomic-rename-'));
  roots.push(root);
  const source = join(root, 'pending');
  const target = join(root, 'head');
  await writeFile(source, 'new complete value');
  await writeFile(target, 'previous complete value');
  return { root, source, target };
}

it.each(['EPERM', 'EACCES', 'EBUSY'])('preserves the old value while retrying Windows %s', async (code) => {
  const { source, target } = await files();
  const error = Object.assign(new Error('temporary lock'), { code });
  mocks.rename.mockRejectedValueOnce(error).mockRejectedValueOnce(error);
  mocks.delay.mockImplementation(async () => {
    expect(await readFile(target, 'utf8')).toBe('previous complete value');
    expect(await readFile(source, 'utf8')).toBe('new complete value');
  });
  await atomicRename(source, target);
  expect(mocks.rename).toHaveBeenCalledTimes(3);
  expect(await readFile(target, 'utf8')).toBe('new complete value');
  await expect(readFile(source)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('bounds permanent Windows permission failures and leaves both files intact', async () => {
  const { source, target } = await files();
  const error = Object.assign(new Error('permission denied'), { code: 'EPERM' });
  mocks.rename.mockRejectedValue(error);
  await expect(atomicRename(source, target)).rejects.toBe(error);
  expect(mocks.rename).toHaveBeenCalledTimes(51);
  expect(mocks.delay).toHaveBeenCalledTimes(50);
  expect(mocks.delay.mock.calls.reduce((sum, args) => sum + args[0], 0)).toBe(4550);
  expect(await readFile(target, 'utf8')).toBe('previous complete value');
  expect(await readFile(source, 'utf8')).toBe('new complete value');
});

it.each([['win32', 'ENOSPC'], ['linux', 'EPERM']])('does not retry %s %s', async (platform, code) => {
  const { source, target } = await files();
  mocks.platform = platform;
  const error = Object.assign(new Error('I/O failure'), { code });
  mocks.rename.mockRejectedValue(error);
  await expect(atomicRename(source, target)).rejects.toBe(error);
  expect(mocks.rename).toHaveBeenCalledTimes(1);
  expect(mocks.delay).not.toHaveBeenCalled();
  expect(await readFile(target, 'utf8')).toBe('previous complete value');
});

it('preserves a queryable head and cleans its temporary file when publication cannot finish', async () => {
  const { root } = await files();
  const store = new FileSnapshotStore(root);
  const saved = {
    manifest: {
      schemaVersion: 1, repositoryId: 'example', ref: 'HEAD', commitSha: 'a'.repeat(40),
      snapshotId: 'saved', contentDigest: 'digest', configurationDigest: 'config', scope: [],
      ontologyVersion: '1', extractorVersions: {}, semanticModel: 'test', semanticPromptVersion: '1',
      generatedAt: '2026-01-01T00:00:00Z', semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '',
    },
    facts: [], invariants: [], runtimeEvidence: [], unresolved: [],
  } satisfies Parameters<FileSnapshotStore['write']>[0];
  await store.write(saved);
  await store.updateHead('default', 'saved');
  const next = { ...saved, manifest: { ...saved.manifest, snapshotId: 'next', contentDigest: 'next-digest' } };
  await store.write(next);
  const before = await readFile(join(root, 'heads/default.json'));
  const error = Object.assign(new Error('persistent lock'), { code: 'EPERM' });
  mocks.rename.mockRejectedValue(error);
  await expect(store.updateHead('default', 'next')).rejects.toBe(error);
  expect(await store.readHead('default')).toEqual(saved);
  expect(await readFile(join(root, 'heads/default.json'))).toEqual(before);
  expect(await store.read('next')).toEqual(next);
  expect(await readdir(join(root, 'heads'))).toEqual(['default.json']);
});


it('retries exclusive creation after NTFS denies a contended head lock', async () => {
  const {root} = await files();
  const lock = join(root,'shared.lock');
  mocks.open.mockRejectedValueOnce(Object.assign(Error('sharing violation'),{code:'EPERM'}));
  const write = vi.fn(async () => 17);
  await expect(withHeadLock(lock,write)).resolves.toBe(17);
  expect(write).toHaveBeenCalledTimes(1);
  expect(mocks.open.mock.calls).toEqual([[lock,'wx',0o600],[lock,'wx',0o600]]);
});

it('propagates persistent NTFS access denial without removing the existing lock', async () => {
  const {root} = await files();
  const lock=join(root,'shared.lock');
  await writeFile(lock,'prior writer');
  const error=Object.assign(Error('persistent denial'),{code:'EPERM'});
  mocks.open.mockRejectedValue(error);
  const write=vi.fn();
  await expect(withHeadLock(lock,write)).rejects.toBe(error);
  expect(write).not.toHaveBeenCalled();
  expect(mocks.open).toHaveBeenCalledTimes(201);
  expect(await readFile(lock,'utf8')).toBe('prior writer');
});
