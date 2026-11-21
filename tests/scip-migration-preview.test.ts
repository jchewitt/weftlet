import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, link, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256, type GraphSnapshot } from '@weftlet/core';
import { afterEach, expect, it } from 'vitest';
import { physicalArtifactKey } from '../src/infrastructure/artifact-paths.js';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { FileSnapshotStore, snapshotPath } from '../src/storage/storage.js';
import { publishScipReference, storeScipBlob } from '../src/storage/shared-scip.js';
import { emptyRetentionPolicy } from '../src/storage/retention/policy.js';
import { previewIndexSharing } from '../src/storage/retention/index-sharing-preview.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5 }); });
const bytes = Buffer.alloc(16_384, 'x');
async function fixture() {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'weftlet-scip-preview-')));
  roots.push(parent);
  const root = join(parent, 'cache'), policy = emptyRetentionPolicy();
  await mkdir(root);
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  for (const profile of ['a', 'b']) policy.profiles.push({ path: profile, repositoryId: 'public/' + profile, owner: 'fixture', reason: 'study' });
  async function add(profile: string, id: string, payload = bytes) {
    const path = join(root, profile), store = new FileSnapshotStore(path);
    const manifest = { schemaVersion: 1, repositoryId: 'public/' + profile, snapshotId: id,
      contentDigest: sha256(profile + id), commitSha: 'a'.repeat(40), scipIndexDigest: sha256(payload) } as GraphSnapshot['manifest'];
    await store.write({ manifest, facts: [], invariants: [], unresolved: [], runtimeEvidence: [] } as unknown as GraphSnapshot);
    await mkdir(join(path, 'scip'), { recursive: true });
    const index = join(path, 'scip', physicalArtifactKey(id) + '.scip');
    await writeFile(index, payload);
    return { manifest, index, store, path, graph: snapshotPath(path, id) };
  }
  return { parent, root, policy, add };
}

it('measures all retained legacy generations across profiles, preserves pins, and prices reuse of actual shared destinations', async () => {
  const f = await fixture();
  const first = await f.add('a', 'one'), second = await f.add('a', 'two'), third = await f.add('b', 'long'.repeat(34));
  await rename(third.index, join(third.path, 'scip', third.manifest.snapshotId + '.scip'));
  await first.store.updateHead('active', first.manifest.snapshotId);
  f.policy.activeScopes.push({ profile: 'a', head: 'active', owner: 'fixture', reason: 'active' });
  f.policy.pins.push({ profile: 'b', snapshotId: third.manifest.snapshotId, owner: 'audit', reason: 'history' });
  const originalGraph = await readFile(first.graph);
  const before = await previewIndexSharing(f);
  expect(before).toMatchObject({ complete: true, canApply: false, observedLegacyIndexes: 3, verifiedGenerations: 3, excluded: [] });
  expect(before.groups).toHaveLength(1);
  const group = before.groups[0]!;
  expect(group.members.find(m => m.snapshotId === 'one')).toMatchObject({ protections: ['active-scope:active'], headReferences: [expect.any(String)] });
  expect(group.members.find(m => m.profile === 'b')?.protections).toContain('explicit-pin:audit');
  expect(before.positiveGroupLogicalSavings).toBe(2 * bytes.length - group.newReferenceBytes);
  expect(await readdir(join(first.path, 'scip'))).toEqual(expect.arrayContaining(['one.scip', 'two.scip']));
  await expect(readdir(join(f.root, 'scip-blobs-v1'))).rejects.toMatchObject({ code: 'ENOENT' });
  await storeScipBlob(first.path, sha256(bytes), bytes);
  await publishScipReference(first.path, first.manifest);
  const existingReference = await readFile(join(first.path, 'scip/refs-v1/one.ref/reference.json'));
  const mixed = await previewIndexSharing(f);
  expect(mixed.groups[0]).toMatchObject({ blobExists: true, newBlobBytes: 0,
    newReferenceBytes: group.newReferenceBytes - existingReference.length });
  expect(mixed.positiveGroupLogicalSavings).toBe(before.positiveGroupLogicalSavings! + bytes.length + existingReference.length);
  expect(await readFile(first.graph)).toEqual(originalGraph);
  expect(await readFile(second.index)).toEqual(bytes);
  expect(await first.store.headId('active')).toBe('one');
  expect(await readdir(join(f.root, '.weftlet-coordination/participants'))).toEqual([]);
  // A partial walk cannot safely price a digest group.
  expect(await previewIndexSharing({ ...f, maxEntries: 3 })).toMatchObject({ complete: false, positiveGroupLogicalSavings: null });
  const policyPath = join(f.parent, 'policy.json');
  await writeFile(policyPath, JSON.stringify(f.policy));
  const cmd = ['--import', 'tsx', 'src/cli.ts', 'cache', 'retention', 'preview-index-sharing', '--root', f.root, '--policy', policyPath, '--quiet', '--json'];
  const cli = await promisify(execFile)(process.execPath, cmd);
  expect(JSON.parse(cli.stdout)).toEqual(mixed);
});

it('keeps ambiguous, corrupt, undeclared, orphaned and hard-linked inputs out of savings', async () => {
  const f = await fixture();
  const ambiguous = await f.add('a', 'id'.repeat(68));
  await copyFile(ambiguous.index, join(ambiguous.path, 'scip', ambiguous.manifest.snapshotId + '.scip'));
  const altered = await f.add('a', 'altered');
  await writeFile(altered.index, Buffer.alloc(bytes.length, 'y'));
  const linked = await f.add('a', 'linked');
  await link(linked.index, join(f.root, 'extra-link'));
  await f.add('undeclared', 'other');
  await writeFile(join(ambiguous.path, 'scip', 'orphan.scip'), bytes);
  const small = await f.add('b', 'small', Buffer.from('x'));
  const report = await previewIndexSharing(f);
  expect(report).toMatchObject({ complete: true, observedLegacyIndexes: 7, verifiedGenerations: 1, positiveGroupLogicalSavings: 0 });
  expect(report.groups[0]!.projectedLogicalSavings).toBeLessThan(0);
  expect(report.excluded.map(e => e.reason)).toEqual(expect.arrayContaining(['undeclared-profile', 'unsafe-index-file', 'ambiguous-companion-name', 'index-manifest-digest-mismatch', 'no-snapshot-owner']));
  await storeScipBlob(small.path, small.manifest.scipIndexDigest, Buffer.from('x'));
  await publishScipReference(small.path, small.manifest);
  const blob = join(f.root, 'scip-blobs-v1', small.manifest.scipIndexDigest, 'index.scip');
  const ref = join(small.path, 'scip/refs-v1/small.ref/reference.json');
  await writeFile(blob, 'z');
  expect((await previewIndexSharing(f)).excluded).toContainEqual({ indexPath: 'b/scip/small.scip', reason: 'unverified-shared-blob' });
  await writeFile(blob, 'x');
  await writeFile(ref, '{}');
  expect((await previewIndexSharing(f)).excluded).toContainEqual({ indexPath: 'b/scip/small.scip', reason: 'unverified-generation-or-reference' });
  await writeFile(small.graph, '{');
  expect(await previewIndexSharing(f)).toMatchObject({ complete: false, positiveGroupLogicalSavings: null });
});

it('requires the selected coordinated owner and a fully identified generation', async () => {
  const f = await fixture();
  await mkdir(join(f.root, 'a'));
  await mkdir(join(f.root, 'b'));
  const abort = new AbortController();
  await expect(previewIndexSharing({ ...f, signal: abort.signal, onProgress: (done, total) => {
    if (done === total) abort.abort();
  } })).rejects.toMatchObject({ name: 'AbortError' });
  const a = await f.add('a', 'has-invalid-commit');
  await f.add('b', 'good');
  const graph = JSON.parse(await readFile(a.graph, 'utf8'));
  graph.manifest.commitSha = '';
  await writeFile(a.graph, JSON.stringify(graph));
  await mkdir(join(f.root, 'a/artifacts/semantic'), { recursive: true });
  await writeFile(join(f.root, 'a/artifacts/semantic/unrelated.json'), '{');
  const report = await previewIndexSharing({ ...f, root: process.platform === 'win32' ? f.root.toUpperCase() : f.root });
  expect(report.complete).toBe(true);
  expect(report.excluded).toContainEqual({ indexPath: 'a/scip/has-invalid-commit.scip', reason: 'unverified-generation-or-reference' });
  await expect(previewIndexSharing({ ...f, root: a.path })).rejects.toThrow(/exact coordinated/);
  await mkdir(join(a.path, '.weftlet-coordination'));
  await copyFile(join(f.root, '.weftlet-coordination/root.json'), join(a.path, '.weftlet-coordination/root.json'));
  await expect(previewIndexSharing(f)).rejects.toThrow(/Overlapping managed/);
});
