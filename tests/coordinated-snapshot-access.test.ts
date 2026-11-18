import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { GraphSnapshot } from '@weftlet/core';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { withCacheMaintenance } from '../src/storage/coordination/access.js';
import { withSnapshotAccess, type SnapshotAccess } from '../src/storage/coordination/snapshot-access.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }))); });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-scoped-store-')); roots.push(root);
  const snapshot: GraphSnapshot = { manifest: { schemaVersion: 1, repositoryId: 'public/test', snapshotId: 'one',
    commitSha: 'a'.repeat(40), ref: 'HEAD', configurationDigest: 'config', scope: ['src'], ontologyVersion: 'test',
    extractorVersions: {}, semanticModel: 'none', semanticPromptVersion: 'none', generatedAt: '2026-11-17T00:00:00Z',
    contentDigest: 'digest', semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
    facts: [], invariants: [], unresolved: [], runtimeEvidence: [] };
  const raw = new FileSnapshotStore(root); await raw.write(snapshot); await raw.updateHead('default', 'one');
  return { root, snapshot, raw };
}
it('keeps complete snapshot/head operations protected, preserves bytes and revokes escaped access scopes', async () => {
  const f = await fixture(), path = (await f.raw.file('one'))!, before = await readFile(path);
  let escaped!: SnapshotAccess;
  await withSnapshotAccess(f.root, async store => {
    escaped = store;
    expect(await store.readHead('default')).toEqual(f.snapshot);
    expect(await store.headId('default')).toBe('one');
    expect(await store.readHeadManifest('default')).toEqual(f.snapshot.manifest);
    expect(await store.readRevision('one')).toBeDefined();
    await store.write(f.snapshot); await store.updateHead('default', 'one', { expectedSnapshotId: 'one' });
    await expect(store.updateHead('default', 'missing')).rejects.toThrow('absent');
    await expect(withCacheMaintenance(f.root, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
    await store.withFile('one', async current => expect(await readFile(current!)).toEqual(before));
  });
  await expect(escaped.read('one')).rejects.toThrow('scope has ended');
  await withCacheMaintenance(f.root, async () => expect(await readFile(path)).toEqual(before));
});
it('waits for in-flight file consumers even when the callback returns or fails without awaiting them', async () => {
  for (const fail of [false, true]) {
    const f = await fixture(), entered = deferred(), release = deferred(); let settled = false;
    const operation = withSnapshotAccess(f.root, async store => {
      void store.withFile('one', async path => { entered.resolve(); await release.promise; expect(await readFile(path!, 'utf8')).toContain('public/test'); });
      if (fail) throw Error('caller failure');
    });
    const result = operation.then(() => { settled = true; return 'ok'; }, error => { settled = true; return error.message; });
    await entered.promise;
    await expect(withCacheMaintenance(f.root, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
    expect(settled).toBe(false);
    release.resolve(); expect(await result).toBe(fail ? 'caller failure' : 'ok');
    expect(await readdir(join(f.root, '.weftlet-coordination/participants'))).toEqual([]);
  }
});

it('keeps pending snapshot file consumers protected when cancellation arrives after the outer callback returns', async () => {
  const f = await fixture(), entered = deferred(), release = deferred(), controller = new AbortController();
  let settled = false;
  const operation = withSnapshotAccess(f.root, async store => {
    void store.withFile('one', async path => {
      entered.resolve(); await release.promise;
      expect(await readFile(path!, 'utf8')).toContain('public/test');
    });
  }, { signal: controller.signal });
  const result = operation.then(() => { settled = true; });
  await entered.promise; controller.abort();
  await expect(withCacheMaintenance(f.root, async () => { throw Error('must not enter'); }, { timeoutMs: 75 }))
    .rejects.toMatchObject({ phase: 'drain' });
  expect(settled).toBe(false);
  expect(await readdir(join(f.root, '.weftlet-coordination/participants'))).toHaveLength(1);
  release.resolve(); await result;
  await withCacheMaintenance(f.root, async () => undefined);
});
