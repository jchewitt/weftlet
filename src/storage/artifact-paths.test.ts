import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { GraphSnapshot, SemanticArtifact } from '@weftlet/core';
import { physicalArtifactKey, temporaryArtifactPath } from '../infrastructure/artifact-paths.js';
import { FileSnapshotStore, SemanticArtifactStore } from './storage.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function root() { const value = await mkdtemp(join(tmpdir(), 'weftlet-path-')); roots.push(value); return value; }
function snapshot(id: string, digest = 'public-digest'): GraphSnapshot {
  return { manifest: { schemaVersion: 1, repositoryId: 'public/paths', ref: 'HEAD', commitSha: 'a'.repeat(40),
    snapshotId: id, contentDigest: digest, ontologyVersion: '1', extractorVersions: {}, semanticModel: 'none',
    semanticPromptVersion: 'none', generatedAt: '2026-01-01T00:00:00Z', semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
    facts: [], invariants: [], runtimeEvidence: [], unresolved: [] };
}
function artifact(key: string): SemanticArtifact {
  return { key, stableSemanticId: 'public:paths', source: { path: 'docs/source.md', startLine: 1, endLine: 1,
    digest: 'source-digest', commitSha: 'a'.repeat(40) }, sourceDigest: 'source-digest', promptVersion: '1',
    extractorVersion: '1', modelIdentity: 'none', adapterVersion: '1', ontologyVersion: '1', facts: [],
    oml: '', unresolvedMappings: [], rawModelOutput: '{}', outputDigest: 'output-digest' };
}

it('keeps physical names bounded and disjoint from literal keys, with independent same-directory temporary names', () => {
  expect(physicalArtifactKey('short-id')).toBe('short-id');
  for (const key of ['a'.repeat(129), 'a'.repeat(256), 'CON', 'nul.txt', 'COM1']) {
    expect(physicalArtifactKey(key)).toMatch(/^~[a-f0-9]{64}$/);
  }
  expect(physicalArtifactKey('a'.repeat(256))).not.toBe(physicalArtifactKey('a'.repeat(255) + 'b'));
  const path = join('artifacts', `${'a'.repeat(256)}.json`);
  const first = temporaryArtifactPath(path);
  expect(dirname(first)).toBe(dirname(path));
  expect(basename(first)).toHaveLength(41);
  expect(temporaryArtifactPath(path)).not.toBe(first);
});

it('publishes full-length snapshot/artifact/head identities atomically and preserves immutable winners', async () => {
  const directory = await root();
  const store = new FileSnapshotStore(directory);
  const id = 's'.repeat(256);
  const results = await Promise.allSettled([store.write(snapshot(id)), store.write(snapshot(id, 'conflicting'))]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const saved = (await store.read(id))!;
  expect(saved.manifest.snapshotId).toBe(id);
  await Promise.all(Array.from({ length: 5 }, () => store.write(saved)));
  const head = 'h'.repeat(256);
  await Promise.all(Array.from({ length: 5 }, () => store.updateHead(head, id)));
  expect(await store.readHead(head)).toEqual(saved);
  expect(JSON.parse(await readFile(join(directory, 'heads', `${physicalArtifactKey(head)}.json`), 'utf8'))).toEqual({ snapshotId: id });
  const artifacts = new SemanticArtifactStore(directory);
  const value = artifact('k'.repeat(256));
  await artifacts.write(value);
  expect(await artifacts.read(value.key)).toEqual(value);
  await expect(artifacts.write({ ...value, outputDigest: 'different' })).rejects.toThrow('differs');
  for (const path of await readdir(directory, { recursive: true })) {
    expect(path.split(/[\\/]/).every(part => part.length <= 133)).toBe(true);
    expect(path.endsWith('.tmp')).toBe(false);
  }
  expect(() => store.read('../escape')).toThrow('safe storage identifier');
  expect(() => store.read(physicalArtifactKey(id))).toThrow('safe storage identifier');
  await expect(artifacts.read('../escape')).rejects.toThrow('Unsafe');
});

it('reads legacy names without rewriting them or admitting a conflicting immutable replacement', async () => {
  const directory = await root();
  const id = 'legacy-'.repeat(25);
  const value = snapshot(id);
  const head = 'head-'.repeat(30);
  const entry = artifact('artifact-'.repeat(20));
  for (const path of ['snapshots', 'heads', 'artifacts/semantic']) await mkdir(join(directory, path), { recursive: true });
  const oldPath = join(directory, 'snapshots', `${id}.json`);
  const bytes = JSON.stringify(value, null, 2);
  await writeFile(oldPath, bytes);
  await writeFile(join(directory, 'heads', `${head}.json`), JSON.stringify({ snapshotId: id }));
  const oldArtifact = join(directory, 'artifacts/semantic', `${entry.key}.json`);
  await writeFile(oldArtifact, JSON.stringify(entry));
  const store = new FileSnapshotStore(directory);
  const artifacts = new SemanticArtifactStore(directory);
  expect(await store.readHead(head)).toEqual(value);
  await store.write(value);
  await artifacts.write(entry);
  await expect(store.write(snapshot(id, 'different'))).rejects.toThrow('immutable snapshot');
  expect(await readFile(oldPath, 'utf8')).toBe(bytes);
  expect(await readFile(oldArtifact, 'utf8')).toBe(JSON.stringify(entry));
  expect(await readdir(join(directory, 'snapshots'))).toEqual([`${id}.json`]);
  expect(await readdir(join(directory, 'artifacts/semantic'))).toEqual([`${entry.key}.json`]);
  const primary = await root();
  expect(await new SemanticArtifactStore(primary, [directory]).readEntry(entry.key)).toEqual({ artifact: entry, origin: 'legacy' });
  await store.write(snapshot('next'));
  await store.updateHead(head, 'next');
  expect((await store.readHead(head))?.manifest.snapshotId).toBe('next');
});
