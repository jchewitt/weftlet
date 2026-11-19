import { afterEach, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { sha256, type GraphSnapshot } from '@weftlet/core';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { inventoryCache } from '../src/storage/inspection/inventory.js';
import { profileSnapshot } from '../src/storage/inspection/profile.js';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { emptyRetentionPolicy } from '../src/storage/retention/policy.js';
import { prepareRetention } from '../src/storage/retention/prepared.js';
import { applyRetention } from '../src/storage/retention/apply.js';
import { compareSavedQueries } from '../scripts/storage-study/saved-query.js';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5 });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-blocks-')); roots.push(root);
  return { root, store: new FileSnapshotStore(root) };
}
const snapshot = (id: string) => ({
  manifest: { schemaVersion: 1, repositoryId: 'public/compact', snapshotId: id, contentDigest: sha256(id), commitSha: 'a'.repeat(40), semanticArtifactKeys: [] },
  facts: [], invariants: [], unresolved: [], runtimeEvidence: [],
  padding: 'multi-block unicode 🍀'.repeat(125000),
}) as unknown as GraphSnapshot;

it('reads mixed generations and removes an eligible compact file using its physical length and hash', async () => {
  const { root, store } = await fixture();
  await store.write(snapshot('json')); await store.updateHead('default', 'json');
  vi.stubEnv('WEFTLET_SNAPSHOT_FORMAT', 'brotli-v1');
  for (const id of ['compact', 'orphan']) await store.write(snapshot(id));
  await store.updateHead('default', 'compact');
  const path = (await store.file('orphan'))!, raw = await readFile(path);
  expect(raw.subarray(0, 8).toString()).toBe('WEFTBR1\n');
  const profile = await profileSnapshot(path);
  expect(profile.physicalBytes).toBe(raw.length); expect(profile.sha256).toBe(sha256(raw));
  expect(profile.decodedJsonBytes).toBeGreaterThan(raw.length);
  vi.stubEnv('WEFTLET_SNAPSHOT_FORMAT', 'json');
  await store.write(snapshot('orphan'));
  expect(await readFile(path)).toEqual(raw);
  expect(await store.readHead('default')).toEqual(snapshot('compact'));
  expect(await store.read('json')).toEqual(snapshot('json'));
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  const policy = emptyRetentionPolicy();
  policy.profiles.push({ path: '.', repositoryId: 'public/compact', owner: 'team', reason: 'test' });
  policy.activeScopes.push({ profile: '.', head: 'default', owner: 'team', reason: 'test' });
  const plan = await prepareRetention({ root, policy }); expect(plan.canApply).toBe(true);
  const removed = await applyRetention(plan, plan.planId, { root, policy });
  expect(removed.deletedLogicalBytes).toBe(raw.length);
  expect(removed.deleted).toEqual(['snapshots/orphan.json']);
  expect(await store.read('compact')).toEqual(snapshot('compact'));
  expect(await store.read('json')).toEqual(snapshot('json'));
});
it('publishes one complete immutable file when JSON and compact writer processes compete for the same ID', async () => {
  const { root, store } = await fixture();
  const original = snapshot('shared');
  await writeFile(join(root, 'input.json'), JSON.stringify(original));
  const moduleUrl = new URL('../src/storage/storage.ts', import.meta.url).href;
  const script = `
    import { FileSnapshotStore } from ${JSON.stringify(moduleUrl)};
    import { readFile, writeFile } from 'node:fs/promises';
    import { existsSync } from 'node:fs';
    import { join } from 'node:path';
    import { setTimeout as delay } from 'node:timers/promises';
    const [root, partner] = process.argv.slice(1);
    const graph = JSON.parse(await readFile(join(root, 'input.json'), 'utf8'));
    await writeFile(join(root, process.env.WEFTLET_SNAPSHOT_FORMAT + '.ready'), '');
    while (!existsSync(join(root, partner + '.ready'))) await delay(5);
    await new FileSnapshotStore(root).write(graph);
  `;
  const formats = ['json', 'brotli-v1'];
  await Promise.all(formats.map((format, i) => promisify(execFile)(process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script, root, formats[1 - i]!],
    { env: { ...process.env, WEFTLET_SNAPSHOT_FORMAT: format }, timeout: 25_000, windowsHide: true })));
  expect(await readdir(join(root, 'snapshots'))).toEqual(['shared.json']);
  const path = (await store.file('shared'))!;
  const winner = await readFile(path);
  expect(await store.read('shared')).toEqual(original);
  vi.stubEnv('WEFTLET_SNAPSHOT_FORMAT', winner.subarray(0, 8).toString() === 'WEFTBR1\n' ? 'json' : 'brotli-v1');
  await store.write(original);
  expect(await readFile(path)).toEqual(winner);
});

it('rejects an unsupported writer setting while preserving the readable head', async () => {
  const { root, store } = await fixture();
  await store.write(snapshot('good'));
  await store.updateHead('default', 'good');
  vi.stubEnv('WEFTLET_SNAPSHOT_FORMAT', 'unknown');
  await expect(store.write(snapshot('new'))).rejects.toThrow('WEFTLET_SNAPSHOT_FORMAT');
  expect(await readdir(join(root, 'snapshots'))).toEqual(['good.json']);
  expect(await store.readHead('default')).toEqual(snapshot('good'));
});

it('refuses corrupt, truncated and extended compact files on full read, verification and head publication', async () => {
  const { store, root } = await fixture();
  await store.write(snapshot('valid')); await store.updateHead('default', 'valid');
  vi.stubEnv('WEFTLET_SNAPSHOT_FORMAT', 'brotli-v1'); await store.write(snapshot('other'));
  const path = (await store.file('other'))!, bytes = await readFile(path);
  const badDigest = Buffer.from(bytes); badDigest[16] ^= 1;
  const oversized = Buffer.from(bytes); oversized.writeUInt32BE(0xffffffff, 80);
  for (const bad of [badDigest, oversized, bytes.subarray(0, -1), Buffer.concat([bytes, Buffer.from('extra')])]) {
    await writeFile(path, bad); await expect(store.read('other')).rejects.toThrow();
    await expect(store.updateHead('default', 'other')).rejects.toThrow();
    expect(await store.headId('default')).toBe('valid');
    const inv = await inventoryCache({ roots: [root], verify: true });
    expect(inv.objects.find(o => o.path.endsWith('/other.json'))?.inspection).toBe('invalid');
  }
});
it('produces identical impact pages from actual strictly hydrated evidence and a JSON baseline', async () => {
  expect((await compareSavedQueries(2, 20)).identicalImpactPage).toBe(true);
}, 120000);
