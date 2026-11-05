import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { explorerFixture } from '../../examples/explorer/fixture.js';
import { FileSnapshotStore } from '../storage/storage.js';
import { SnapshotIndexReader } from './snapshot-index.js';
import { SnapshotGraphDiscoveryService } from './discovery.js';
import { SnapshotGraphExplorationService } from './neighborhood.js';
import { SnapshotGraphPathService } from './paths.js';

it('shares one load across concurrent queries and services; preserves saved bytes and notices out-of-band edits/deletion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-query-index-'));
  try {
    const saved = explorerFixture(5000), store = new FileSnapshotStore(root);
    await store.write(saved);
    const path = join(root, 'snapshots', (await readdir(join(root, 'snapshots')))[0]!);
    const bytes = await readFile(path), read = vi.spyOn(store, 'read');
    const indexes = new SnapshotIndexReader(store), discovery = new SnapshotGraphDiscoveryService(store, indexes);
    const neighbors = new SnapshotGraphExplorationService(store, indexes), paths = new SnapshotGraphPathService(store, indexes);
    const request = { snapshotId: saved.manifest.snapshotId, nodeId: 'workflow:reserve', maxFacts: 1 };
    const [catalog, first] = await Promise.all([
      discovery.catalog({ snapshotId: request.snapshotId }), neighbors.neighbors(request),
      paths.paths({ snapshotId: request.snapshotId, fromNodeId: 'workflow:reserve', toNodeId: 'workflow:ship' }),
    ]);
    expect(catalog.overview.facts).toBe(5006);
    expect(read).toHaveBeenCalledTimes(1);
    await neighbors.neighbors({ ...request, continuation: first.selection.continuation });
    await discovery.fact({ snapshotId: request.snapshotId, factId: 'policy-code' });
    expect(read).toHaveBeenCalledTimes(1);
    expect(await readFile(path)).toEqual(bytes);
    // Unchanged manifest/digest cannot make an edited physical artifact reuse the cached index/cursor.
    await writeFile(path, JSON.stringify({ ...saved, facts: saved.facts.map(fact => fact.id === 'policy-code' ? { ...fact, confidence: 0.25 } : fact) }));
    await expect(neighbors.neighbors({ ...request, continuation: first.selection.continuation })).rejects.toThrow('does not match');
    expect(read).toHaveBeenCalledTimes(2);
    await rm(path);
    await expect(discovery.catalog({ snapshotId: request.snapshotId })).rejects.toThrow('No graph snapshot');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('never trusts an unversioned reader, isolates snapshots and rejects load races or duplicate IDs', async () => {
  let saved = explorerFixture(0);
  const read = vi.fn(async () => saved), indexes = new SnapshotIndexReader({ read });
  const first = await indexes.read(saved.manifest.snapshotId);
  expect(Object.isFrozen(first.snapshot.facts[0]!.provenance)).toBe(true);
  expect(Object.isFrozen(saved.facts[0]!.provenance)).toBe(false);
  saved = { ...saved, facts: saved.facts.slice(1) };
  expect((await indexes.read(saved.manifest.snapshotId)).byFact.has('policy-reserve')).toBe(false);
  expect(first.byFact.has('policy-reserve')).toBe(true);
  expect(read).toHaveBeenCalledTimes(2);
  let revision = 0;
  const racing = new SnapshotIndexReader({ read: async () => { revision++; return saved; }, readRevision: async () => String(revision) });
  await expect(racing.read(saved.manifest.snapshotId)).rejects.toThrow('changed while loading');
  saved = { ...saved, facts: [...saved.facts, saved.facts[0]!] };
  await expect(indexes.read(saved.manifest.snapshotId)).rejects.toThrow('Duplicate fact identities');
  await expect(indexes.read('another-snapshot')).rejects.toThrow('identity does not match');
});
