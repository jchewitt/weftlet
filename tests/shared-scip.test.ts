import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import type { GraphFact, SnapshotManifest } from '@weftlet/core';
import { physicalArtifactKey } from '../src/infrastructure/artifact-paths.js';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { withCacheMaintenance } from '../src/storage/coordination/access.js';
import { snapshotPath } from '../src/storage/storage.js';
import { publishScipReference, withSavedScipIndex, storeScipBlob } from '../src/storage/shared-scip.js';
import { createContextGraphApplication } from '../src/application/application.js';
import { largeTypeScriptProject } from './fixtures/large-typescript-project.js';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5 })));
});
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const definition = (f: GraphFact) => f.predicate === 'definedBy' &&
  f.object.id === 'component:file:src/module-0.ts' && /\bstage1\b/.test(f.subject.label);

it('shares normalized real SCIP bytes across commits, preserves deleted evidence and isolates comparison and failure', async () => {
  vi.stubEnv('WEFTLET_SCIP_STORAGE', 'shared-v1');
  const { root, app, git } = await largeTypeScriptProject(2, 3);
  roots.push(root);
  const profile = app.storageRoot;
  const hydrate = (ref = 'HEAD') => app.hydrator.hydrate({ ref, headName: 'default' });
  await expect(hydrate()).rejects.toThrow('coordinated cache root');
  await mkdir(profile, { recursive: true });
  await enableCacheCoordination(profile, { acknowledgeQuiescence: true });
  const first = (await hydrate()).snapshot;
  const old = first.manifest;
  const saved = await readFile(snapshotPath(profile, old.snapshotId));
  const bytes = await withSavedScipIndex(profile, old, handle => handle.readFile());
  expect(hash(bytes)).toBe(old.scipIndexDigest);
  const repeat = await hydrate();
  expect(repeat.snapshot.manifest.contentDigest).toBe(old.contentDigest);
  expect(repeat.semanticExtracted).toBe(0);
  const commit = () => git('-c', 'user.name=Public fixture', '-c', 'user.email=test@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-qam', 'Public fixture edit');
  await appendFile(join(root, 'docs/rule-0.md'), '\nPublic revision.\n');
  await commit();
  const edited = (await hydrate()).snapshot.manifest;
  expect(edited.snapshotId).not.toBe(old.snapshotId);
  expect(edited.scipIndexDigest).toBe(old.scipIndexDigest);
  const source = join(root, 'src/module-0.ts');
  await writeFile(source, (await readFile(source, 'utf8')).replace(/^export function stage1\(.*\n/m, ''));
  await commit();
  const changed = (await hydrate()).snapshot;
  expect(changed.manifest.scipIndexDigest).not.toBe(old.scipIndexDigest);
  expect(changed.facts.filter(definition)).toEqual([]);
  expect(first.facts.some(definition)).toBe(true);
  expect((await app.snapshotStore.read(old.snapshotId))?.facts.filter(definition)).toEqual(first.facts.filter(definition));
  const compared = await app.hydrator.compareClean({ ref: 'HEAD', headName: 'default' });
  expect(compared.comparison?.temporaryOutputRemoved).toBe(true);
  expect(await readdir(join(profile, 'scip'))).toEqual(['refs-v1']);
  const refs = join(profile, 'scip', 'refs-v1');
  expect(await readdir(refs)).toHaveLength(3);
  expect(await readdir(join(profile, 'scip-blobs-v1'))).toHaveLength(2);
  expect(await readFile(snapshotPath(profile, old.snapshotId))).toEqual(saved);
  // A valid old physical file cannot conceal a damaged generation reference.
  await writeFile(join(profile, 'scip', physicalArtifactKey(old.snapshotId) + '.scip'), bytes);
  await writeFile(join(refs, physicalArtifactKey(old.snapshotId) + '.ref', 'reference.json'), '{}');
  await expect(withSavedScipIndex(profile, old, handle => handle.readFile())).rejects.toThrow('disagrees');
  await expect(hydrate(old.commitSha)).rejects.toThrow('disagrees');
  vi.stubEnv('WEFTLET_SCIP_STORAGE', 'per-snapshot');
  const legacyWriter = await createContextGraphApplication(join(root, 'context-graph.config.json'));
  await expect(legacyWriter.hydrator.hydrate({ ref: old.commitSha, headName: 'default' })).rejects.toThrow('disagrees');
  expect(await app.snapshotStore.headId('default')).toBe(changed.manifest.snapshotId);
  await withSavedScipIndex(profile, changed.manifest, async handle => {
    await expect(withCacheMaintenance(profile, async () => {}, { timeoutMs: 100 })).rejects.toMatchObject({ phase: 'drain' });
    expect(hash(await handle.readFile())).toBe(changed.manifest.scipIndexDigest);
  });
}, 120_000);

it('publishes concurrently across processes and profiles, verifies winners and reads both legacy filenames', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-shared-scip-'));
  roots.push(root);
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  const bytes = Buffer.from('public normalized index');
  const m = { repositoryId: 'public/test', snapshotId: 'a'.repeat(140), commitSha: 'b'.repeat(40),
    contentDigest: 'c'.repeat(64), scipIndexDigest: hash(bytes) } as SnapshotManifest;
  const a = join(root, 'a'), b = join(root, 'b');
  const child = `
    import { withManagedCacheAccess } from './src/storage/coordination/managed-access.ts';
    import { storeScipBlob, publishScipReference } from './src/storage/shared-scip.ts';
    const [profile, manifest, data] = process.argv.slice(1);
    const m = JSON.parse(manifest);
    await withManagedCacheAccess([profile], async () => {
      await storeScipBlob(profile, m.scipIndexDigest, Buffer.from(data, 'hex'));
      await publishScipReference(profile, m);
    });
  `;
  await expect(storeScipBlob(a, m.scipIndexDigest, Buffer.from('wrong'))).rejects.toThrow('integrity');
  expect(await readdir(join(root, 'scip-blobs-v1'))).toEqual([]);
  await Promise.all([a, b, a].map(profile => promisify(execFile)(process.execPath, ['--import', 'tsx',
    '--input-type=module', '-e', child, profile, JSON.stringify(m), bytes.toString('hex')])));
  expect(await readdir(join(root, 'scip-blobs-v1'))).toEqual([m.scipIndexDigest]);
  for (const profile of [a, b]) {
    expect(await readdir(join(profile, 'scip', 'refs-v1'))).toEqual([physicalArtifactKey(m.snapshotId) + '.ref']);
    expect(await withSavedScipIndex(profile, m, handle => handle.readFile())).toEqual(bytes);
  }
  for (const snapshotId of ['test', 'test.']) {
    const manifest = { ...m, snapshotId };
    await publishScipReference(a, manifest);
    expect(await withSavedScipIndex(a, manifest, handle => handle.readFile())).toEqual(bytes);
  }
  const legacy = join(root, 'legacy');
  await mkdir(join(legacy, 'scip'), { recursive: true });
  const bounded = join(legacy, 'scip', physicalArtifactKey(m.snapshotId) + '.scip');
  await writeFile(bounded, bytes);
  expect(await withSavedScipIndex(legacy, m, handle => handle.readFile())).toEqual(bytes);
  await rename(bounded, join(legacy, 'scip', m.snapshotId + '.scip'));
  expect(await withSavedScipIndex(legacy, m, handle => handle.readFile())).toEqual(bytes);
  await symlink(join(root, 'absent'), join(legacy, 'scip', 'refs-v1'), 'junction');
  await expect(withSavedScipIndex(legacy, m, handle => handle.readFile())).rejects.toThrow(/links or junctions/);
  await writeFile(join(root, 'scip-blobs-v1', m.scipIndexDigest, 'index.scip'), Buffer.alloc(bytes.length));
  await expect(withSavedScipIndex(b, m, handle => handle.readFile())).rejects.toThrow('integrity');
}, 60_000);
