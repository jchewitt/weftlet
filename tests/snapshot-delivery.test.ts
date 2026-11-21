import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { withSavedScipIndex } from '../src/storage/shared-scip.js';
import { execFile } from 'node:child_process';
import { cp, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { persistedJsonDigest, sha256, stableJsonDigest } from '@weftlet/core';
import type { GraphSnapshot } from '@weftlet/core';
import { createContextGraphApplication } from '../src/application/application.js';
import { exportSnapshot } from '../src/application/delivery/export.js';
import { importSnapshot } from '../src/application/delivery/import.js';
import { deliveryContext } from '../src/application/delivery/context.js';
import type { SnapshotBundle } from '../src/application/delivery/contract.js';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { SnapshotImpactQueryService } from '../src/graph/query.js';
import { inspectSemanticCache } from '../src/extraction/semantic-cache.js';
import { semanticProviderIdentity } from '../src/extraction/semantic-identity.js';
import { fileDigest } from '../src/storage/transfer-files.js';

const execute = promisify(execFile);
const git = (cwd: string, ...args: string[]) => execute('git', args, { cwd, windowsHide: true });
let root: string, producer: string, bundle: string, configPath: string, snapshot: GraphSnapshot;
let exported: Awaited<ReturnType<typeof exportSnapshot>>;
let serial = 0;
async function consumer() {
  const target = join(root, `consumer ${serial++}`);
  await git(root, 'clone', '--quiet', '--no-hardlinks', producer, target);
  return { target, config: join(target, 'context-graph.config.json'), store: new FileSnapshotStore(join(target, '.context-graph')) };
}
async function changedBundle(change: (snapshot: GraphSnapshot, manifest: SnapshotBundle) => void) {
  const target = join(root, `bundle-${serial++}`);
  await cp(bundle, target, { recursive: true });
  const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8')) as SnapshotBundle;
  const saved = JSON.parse(await readFile(join(target, 'snapshot.json'), 'utf8')) as GraphSnapshot;
  change(saved, manifest);
  const bytes = JSON.stringify(saved);
  await writeFile(join(target, 'snapshot.json'), bytes);
  const files = [{ ...manifest.files[0]!, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) }, ...manifest.files.slice(1)];
  const updated = JSON.stringify({ ...manifest, snapshot: saved.manifest, persistedGraphDigest: persistedJsonDigest(saved),
    files, payloadBytes: files.reduce((sum, file) => sum + file.bytes, 0) });
  await writeFile(join(target, 'manifest.json'), updated);
  return { input: target, expectDigest: sha256(updated) };
}

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'weftlet-delivery-')));
  producer = join(root, 'producer'); bundle = join(root, 'bundle');
  await cp(resolve(import.meta.dirname, '../examples/generic-typescript'), producer, { recursive: true });
  configPath = join(producer, 'context-graph.config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.semantic = { ...config.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity: 'delivery-fixture:1' };
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(join(producer, 'provider.mjs'), `export const createSemanticExtractor = () => ({identity:'delivery-fixture:1',
    extract: async () => ({ parsed:{ assertions:[{ subject:{id:'capability:search',kind:'Capability',label:'Search'},
      predicate:'implementedBy',object:{id:'component:file:src/search.ts',kind:'Component',label:'Search implementation'},
      citation:{startLine:1,endLine:1},confidence:1 }],oml:'' },rawModelOutput:'{}'}) });`);
  await git(producer, 'init', '--quiet'); await git(producer, 'add', '.');
  await git(producer, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'public fixture');
  const storage = join(producer,'.context-graph');
  await mkdir(storage,{recursive:true});
  await enableCacheCoordination(storage,{acknowledgeQuiescence:true});
  vi.stubEnv('WEFTLET_SCIP_STORAGE','shared-v1');
  const hydrated = await (async () => {
    try {
      const app = await createContextGraphApplication(configPath);
      return await app.hydrator.hydrate({ref:'HEAD',headName:'default'});
    } finally { vi.unstubAllEnvs(); }
  })();
  snapshot = hydrated.snapshot;
  expect((await withSavedScipIndex(storage,snapshot.manifest,h=>h.readFile())).length).toBeGreaterThan(0);
  expect(hydrated.semanticExtracted).toBe(1);
  expect(snapshot.facts.some(f => f.extractor.id === 'scip-symbol-extractor')).toBe(true);
  exported = await exportSnapshot(configPath, { snapshotId: snapshot.manifest.snapshotId, output: bundle, includeSemantic: true });
}, 60_000);
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe('verified snapshot delivery', () => {
  it('imports real extracted/indexed evidence, queries it, preserves exact bytes and reuses artifacts on independent repeat hydration', async () => {
    const c = await consumer();
    const options = { input: bundle, expectDigest: exported.manifestSha256, includeSemantic: true, activate: true, expectHead: null };
    const report = await importSnapshot(c.config, options);
    expect(report).toMatchObject({ activated: true, semanticArtifacts: 1, strictValidation: true,
      evidenceState: { stale: false, configurationMatches: true, extractionCompatible: true, eligibleForCurrentDiffValidation: false } });
    const saved = (await c.store.read(snapshot.manifest.snapshotId))!;
    expect(saved).toEqual(JSON.parse(JSON.stringify(snapshot)));
    expect(await readFile((await c.store.file(snapshot.manifest.snapshotId))!)).toEqual(await readFile(join(bundle, 'snapshot.json')));
    const pack = await new SnapshotImpactQueryService(c.store, 'default').scan({ changedFiles: ['src/search.ts'], maxFacts: 60 });
    expect(pack.facts.length).toBeGreaterThan(0);
    expect(pack.facts.some(f => f.subject.id === 'capability:search')).toBe(true);
    const context = await deliveryContext(c.config);
    const source = (await context.repository.semanticSources({ commitSha: snapshot.manifest.commitSha }, ['docs']))[0]!;
    expect((await inspectSemanticCache(context.artifacts, context.config.semantic, source, semanticProviderIdentity(context.config.semantic))).status).toBe('hit');
    await writeFile(join(c.target, 'provider.mjs'), 'export const createSemanticExtractor = () => ({ extract: async () => { throw Error("must reuse"); } });');
    const app = await createContextGraphApplication(c.config);
    const repeated = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeated.semanticExtracted).toBe(0); expect(repeated.semanticReused).toBe(1);
    expect(repeated.snapshot.manifest.contentDigest).toBe(snapshot.manifest.contentDigest);
    const again = await importSnapshot(c.config, { ...options, expectHead: snapshot.manifest.snapshotId });
    expect(again.evidenceState.excludedWorkingChanges).toContain('provider.mjs');
    expect(await readFile((await c.store.file(snapshot.manifest.snapshotId))!)).toEqual(await readFile(join(bundle, 'snapshot.json')));
    expect(await readdir(join(c.target, '.context-graph', 'transfers'))).toEqual([]);
  }, 60_000);

  it('imports to compact storage, re-imports idempotently, and exports the original JSON bundle bytes', async () => {
    const c = await consumer(), id = snapshot.manifest.snapshotId;
    const opts = { input: bundle, expectDigest: exported.manifestSha256, activate: true, expectHead: null };
    vi.stubEnv('WEFTLET_SNAPSHOT_FORMAT', 'brotli-v1');
    try {
      await importSnapshot(c.config, opts);
      const path = (await c.store.file(id))!, bytes = await readFile(path);
      expect(bytes.subarray(0, 8).toString()).toBe('WEFTBR1\n');
      await importSnapshot(c.config, { ...opts, expectHead: id });
      const output = join(root, 'export-from-compact');
      await exportSnapshot(c.config, { snapshotId: id, output });
      expect(await readFile(join(output, 'snapshot.json'))).toEqual(await readFile(join(bundle, 'snapshot.json')));
      expect(await readFile(path)).toEqual(bytes);
      vi.stubEnv('WEFTLET_SNAPSHOT_FORMAT', 'json');
      const restored = await consumer();
      await importSnapshot(restored.config, { input: output, expectDigest: sha256(await readFile(join(output, 'manifest.json'))) });
      expect(await readFile((await restored.store.file(id))!)).toEqual(await readFile(join(bundle, 'snapshot.json')));
    } finally { vi.unstubAllEnvs(); }
  }, 60000);

  it('reports historical and mismatched evidence, defaults to ID-only import, and performs no module loading', async () => {
    const c = await consumer();
    await writeFile(join(c.target, 'note.txt'), 'later commit'); await git(c.target, 'add', 'note.txt');
    await git(c.target, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'later');
    const config = JSON.parse(await readFile(c.config, 'utf8')); config.semantic.timeoutMs = 600_000;
    await writeFile(c.config, JSON.stringify(config));
    await writeFile(join(c.target, 'provider.mjs'), 'throw Error("must not load");');
    const report = await importSnapshot(c.config, { input: bundle, expectDigest: exported.manifestSha256 });
    expect(report).toMatchObject({ activated: false, semanticArtifacts: 0, evidenceState: { stale: true, configurationMatches: false, eligibleForCurrentDiffValidation: false } });
    expect(await c.store.readHead('default')).toBeUndefined();
    await expect(importSnapshot(c.config, { input: bundle, expectDigest: exported.manifestSha256, activate: true, expectHead: null })).rejects.toThrow('Mismatched');
  });

  it('dry-runs verification without installing evidence or advancing a head', async () => {
    const c = await consumer();
    const report = await importSnapshot(c.config, { input: bundle, expectDigest: exported.manifestSha256, dryRun: true, includeSemantic: true, activate: true, expectHead: null });
    expect(report).toMatchObject({ dryRun: true, activated: false, strictValidation: true });
    expect(await c.store.read(snapshot.manifest.snapshotId)).toBeUndefined();
    expect(await c.store.readHead('default')).toBeUndefined();
    expect(await readdir(join(c.target, '.context-graph', 'transfers'))).toEqual([]);
  });

  it('rejects wrong trust digest, payload corruption, unlisted files and wrong repository', async () => {
    const c = await consumer();
    await expect(importSnapshot(c.config, { input: bundle, expectDigest: '0'.repeat(64) })).rejects.toThrow('manifest integrity');
    const corrupt = join(root, `corrupt-${serial++}`); await cp(bundle, corrupt, { recursive: true });
    await writeFile(join(corrupt, 'snapshot.json'), '{}');
    await expect(importSnapshot(c.config, { input: corrupt, expectDigest: exported.manifestSha256 })).rejects.toThrow('payload integrity');
    await writeFile(join(corrupt, 'secret.env'), 'not included');
    await expect(importSnapshot(c.config, { input: corrupt, expectDigest: exported.manifestSha256 })).rejects.toThrow('unlisted');
    const config = JSON.parse(await readFile(c.config, 'utf8')); config.repositoryId = 'different/repo'; await writeFile(c.config, JSON.stringify(config));
    await expect(importSnapshot(c.config, { input: bundle, expectDigest: exported.manifestSha256 })).rejects.toThrow('different repository');
    expect(await c.store.readHead('default')).toBeUndefined();
  });

  it('rejects invalid strict evidence even when an authorized bundle hash matches', async () => {
    const c = await consumer();
    await c.store.write(snapshot); await c.store.updateHead('default', snapshot.manifest.snapshotId);
    const retainedPath = (await c.store.file(snapshot.manifest.snapshotId))!;
    const retainedBytes = await readFile(retainedPath);
    const invalid = await changedBundle(saved => { (saved.facts[0]!.provenance as { startLine: number }).startLine = -1; });
    await expect(importSnapshot(c.config, invalid)).rejects.toThrow('strict graph validation');
    const conflict = await changedBundle(saved => {
      const original = saved.facts[0]!;
      (saved.facts as unknown[]).push({ ...original, id: 'conflict', subject: { ...original.subject, kind: original.subject.kind === 'Evidence' ? 'Component' : 'Evidence' } });
    });
    await expect(importSnapshot(c.config, conflict)).rejects.toThrow();
    expect(await c.store.headId('default')).toBe(snapshot.manifest.snapshotId);
    expect(await readFile(retainedPath)).toEqual(retainedBytes);
  });

  it('rejects immutable byte collisions and stale activation expectations without replacing a head', async () => {
    const c = await consumer();
    await c.store.write(snapshot); await c.store.updateHead('default', snapshot.manifest.snapshotId);
    await expect(importSnapshot(c.config, { input: bundle, expectDigest: exported.manifestSha256, activate: true, expectHead: null })).rejects.toThrow('head changed');
    const path = (await c.store.file(snapshot.manifest.snapshotId))!;
    await writeFile(path, JSON.stringify({ ...snapshot, unresolved: ['different bytes'] }));
    const before = await readFile(path);
    await expect(importSnapshot(c.config, { input: bundle, expectDigest: exported.manifestSha256 })).rejects.toThrow('collision');
    expect(await readFile(path)).toEqual(before);
    expect(await c.store.headId('default')).toBe(snapshot.manifest.snapshotId);
  });

  it('serializes compare-and-swap between competing head writers', async () => {
    const c = await consumer();
    await c.store.write(snapshot);
    const alternate = { ...snapshot, manifest: { ...snapshot.manifest, snapshotId: 'other' }, facts: snapshot.facts.map(f => ({ ...f, snapshotId: 'other' })) };
    await c.store.write(alternate);
    const results = await Promise.allSettled([
      c.store.updateHead('default', snapshot.manifest.snapshotId, { expectedSnapshotId: null }),
      c.store.updateHead('default', 'other', { expectedSnapshotId: null }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect([snapshot.manifest.snapshotId, 'other']).toContain(await c.store.headId('default'));
  });

  it('excludes semantic raw output by default and rejects incompatible cache adoption', async () => {
    const output = join(root, `snapshot-only-${serial++}`);
    const report = await exportSnapshot(configPath, { snapshotId: snapshot.manifest.snapshotId, output });
    expect(report.semanticArtifacts).toBe(0);
    expect((await readdir(output)).sort()).toEqual(['manifest.json', 'snapshot.json']);
    const c = await consumer();
    await expect(importSnapshot(c.config, { input: output, expectDigest: report.manifestSha256, includeSemantic: true })).rejects.toThrow('does not include');
    const config = JSON.parse(await readFile(c.config, 'utf8')); config.semantic.model = 'different-model';
    await writeFile(c.config, JSON.stringify(config));
    await expect(importSnapshot(c.config, { input: bundle, expectDigest: exported.manifestSha256, includeSemantic: true })).rejects.toThrow('extraction contract');
    expect(await c.store.read(snapshot.manifest.snapshotId)).toBeUndefined();
  });

  it('keeps one complete winner during competing imports with explicit head expectations', async () => {
    const c = await consumer();
    const options = { input: bundle, expectDigest: exported.manifestSha256, activate: true, expectHead: null };
    const attempts = await Promise.allSettled([importSnapshot(c.config, options), importSnapshot(c.config, options)]);
    expect(attempts.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(await c.store.readHead('default')).toEqual(JSON.parse(JSON.stringify(snapshot)));
    expect(await readdir(join(c.target, '.context-graph', 'transfers'))).toEqual([]);
  });

  it('refuses unsafe manifest paths, unsupported overlays and wrong canonical checksums', async () => {
    const c = await consumer();
    const modified = await changedBundle((saved, manifest) => {
      (manifest.files[1]! as { name: string }).name = '../escape.json';
    });
    await expect(importSnapshot(c.config, modified)).rejects.toThrow('unsafe');
    const overlay = await changedBundle(saved => { (saved.manifest as { overlayDigest: string }).overlayDigest = 'a'.repeat(64); });
    await expect(importSnapshot(c.config, overlay)).rejects.toThrow('working overlays');
    const mismatch = await changedBundle(() => {});
    const manifestPath = join(mismatch.input, 'manifest.json');
    const m = JSON.parse(await readFile(manifestPath, 'utf8')); m.persistedGraphDigest = '0'.repeat(64);
    const raw = JSON.stringify(m); await writeFile(manifestPath, raw);
    await expect(importSnapshot(c.config, { ...mismatch, expectDigest: sha256(raw) })).rejects.toThrow('canonical digest mismatch');
  });

  it('cleans operation-owned staging on cancellation and refuses oversized transfers and existing outputs', async () => {
    const c = await consumer(), controller = new AbortController();
    await expect(importSnapshot(c.config, { input: bundle, expectDigest: exported.manifestSha256, signal: controller.signal,
      onProgress(event) { if (event.phase === 'validate-identities') controller.abort(); } })).rejects.toThrow();
    expect(await readdir(join(c.target, '.context-graph', 'transfers'))).toEqual([]);
    await expect(importSnapshot(c.config, { input: bundle, expectDigest: exported.manifestSha256, maxBytes: 100 })).rejects.toThrow('oversized');
    await expect(exportSnapshot(configPath, { snapshotId: snapshot.manifest.snapshotId, output: bundle })).rejects.toThrow('new output');
    await expect(exportSnapshot(configPath, { snapshotId: snapshot.manifest.snapshotId, output: join(root, 'tiny'), maxBytes: 10 })).rejects.toThrow('byte limit');
    expect(await c.store.readHead('default')).toBeUndefined();
  });

  it('rejects directory links/junctions and hardlinked payloads without following them', async () => {
    const c = await consumer();
    const linked = join(root, `linked-${serial++}`);
    await symlink(bundle, linked, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(importSnapshot(c.config, { input: linked, expectDigest: exported.manifestSha256 })).rejects.toThrow('links or junctions');
    const linkedPayload = join(root, `hardlinks-${serial++}`); await mkdir(linkedPayload);
    for (const name of await readdir(bundle)) await link(join(bundle, name), join(linkedPayload, name));
    try { await expect(importSnapshot(c.config, { input: linkedPayload, expectDigest: exported.manifestSha256 })).rejects.toThrow('unshared regular'); }
    finally { await rm(linkedPayload, { recursive: true }); }
    expect(await c.store.readHead('default')).toBeUndefined();
  });

  it('retains the legacy digest claim separately from verifiable canonical persisted encoding', async () => {
    const before = { field: undefined, kept: 1 };
    expect(stableJsonDigest(before)).not.toBe(stableJsonDigest(JSON.parse(JSON.stringify(before))));
    expect(persistedJsonDigest(before)).toBe(persistedJsonDigest(JSON.parse(JSON.stringify(before))));
    const raw = await readFile(join(bundle, 'snapshot.json'));
    expect(exported.persistedGraphDigest).toBe(persistedJsonDigest(JSON.parse(raw.toString('utf8'))));
    expect(exported.contentDigest).toBe(snapshot.manifest.contentDigest);
    expect(exported.producerContentDigest).toBe('preserved-not-recomputed');
    expect((await fileDigest(join(bundle, 'snapshot.json'), raw.length)).sha256).toBe(sha256(raw));
  });
});
