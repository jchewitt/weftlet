// Public synthetic query/index benchmark. No providers or timing-based acceptance gates.
import { mkdtemp, readdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { explorerFixture } from '../examples/explorer/fixture.js';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { SnapshotIndexReader } from '../src/graph/snapshot-index.js';
import { SnapshotGraphDiscoveryService } from '../src/graph/discovery.js';
import { SnapshotGraphExplorationService } from '../src/graph/neighborhood.js';
import { sha256 } from '../src/infrastructure/util.js';

const count = Number(process.argv[2] ?? 20000);
if (!Number.isSafeInteger(count) || count < 1000 || count > 100000) throw new Error('Use 1000..100000 synthetic code facts');
const root = await mkdtemp(join(tmpdir(), 'weftlet-index-benchmark-'));
try {
  const snapshot = explorerFixture(count), store = new FileSnapshotStore(root);
  const persisted = performance.now();
  await store.write(snapshot);
  const persistenceMs = performance.now() - persisted;
  const file = join(root, 'snapshots', (await readdir(join(root, 'snapshots')))[0]!);
  const before = sha256(await readFile(file));
  let reads = 0;
  const reader = { read: (id: string) => { reads++; return store.read(id); }, readRevision: (id: string) => store.readRevision(id) };
  const indexes = new SnapshotIndexReader(reader);
  const catalog = new SnapshotGraphDiscoveryService(reader, indexes), neighbors = new SnapshotGraphExplorationService(reader, indexes);
  const start = performance.now();
  const first = await catalog.catalog({ snapshotId: snapshot.manifest.snapshotId });
  const firstCatalogMs = performance.now() - start;
  const times: number[] = [];
  for (let i = 0; i < 20; i++) {
    const started = performance.now();
    await catalog.catalog({ snapshotId: snapshot.manifest.snapshotId, search: i % 2 ? 'reserve' : '' });
    await neighbors.neighbors({ snapshotId: snapshot.manifest.snapshotId, nodeId: `component:file:src/noise-${i + 1}.ts` });
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  assert.equal(reads, 1);
  assert.equal(sha256(await readFile(file)), before);
  assert.equal(first.overview.facts, count + 6);
  process.stdout.write(JSON.stringify({ fixture: 'public-explorer-v1', node: process.version,
    facts: first.overview.facts, nodes: first.overview.nodes, persistenceMs, firstCatalogMs,
    repeatedCatalogAndNeighborMedianMs: times[10], repeatedCatalogAndNeighborMaxMs: times[19],
    repeatedPairs: times.length, snapshotReads: reads, bytesUnchanged: true, rssMiB: process.memoryUsage().rss / 1024 / 1024,
    limits: 'Synthetic mostly-disconnected code fixture; not private-graph, browser, path-index or database performance acceptance.' }, null, 2) + '\n');
} finally { await rm(root, { recursive: true, force: true }); }
