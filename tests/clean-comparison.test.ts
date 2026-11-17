import { readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ContextGraphHydrator } from '../src/application/hydrator.js';
import { SemanticHydrator } from '../src/extraction/semantic.js';
import { SemanticArtifactStore } from '../src/storage/storage.js';
import { sha256 } from '../src/infrastructure/util.js';
import { traversalApplication, traversalFixture } from './fixtures/traversal.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5 }))); });
async function fixture(realScip = false) {
  const f = await traversalFixture(); roots.push(f.root);
  const config = { ...f.config, storageScope: 'workspace' as const };
  const app = traversalApplication(f, config, realScip);
  const initial = await app.hydrate();
  return { ...f, ...app, initial };
}
async function fingerprints(root: string) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return Object.fromEntries(await Promise.all(entries.filter(entry => entry.isFile() &&
    !entry.parentPath.includes('comparison-receipts')).map(async entry => {
    const path = join(entry.parentPath, entry.name);
    return [path, sha256(await readFile(path))];
  })));
}
async function receipts(root: string) {
  const directory = join(root, 'comparison-receipts');
  return Promise.all((await readdir(directory)).map(async name => {
    const bytes = await readFile(join(directory, name));
    expect(bytes.length).toBeLessThan(16_384);
    return JSON.parse(bytes.toString());
  }));
}

it('independently indexes and validates repeated/concurrent comparisons, retaining only receipts', async () => {
  const f = await fixture(true), before = await fingerprints(f.storage);
  const phases: string[] = [];
  const compare = () => f.hydrator.compareClean({ ref: 'HEAD', headName: 'default',
    onProgress: e => { if (e.status === 'completed') phases.push(e.phase); } });
  const results = [await compare(), ...await Promise.all([compare(), compare()])];
  expect(f.indexes()).toBe(4); // A real new SCIP run for each comparison, not a snapshot cache hit.
  expect(phases.filter(phase => phase === 'validate-shacl')).toHaveLength(3);
  expect(new Set(results.map(result => result.comparison!.operationId)).size).toBe(3);
  for (const result of results) {
    expect(result).toMatchObject({ semanticExtracted: 0, semanticReused: 6,
      comparison: { originalSnapshotId: f.initial.snapshot.manifest.snapshotId, temporaryOutputRemoved: true } });
    expect(result.snapshot.manifest.contentDigest).toBe(f.initial.snapshot.manifest.contentDigest);
    expect(await f.store.read(result.snapshot.manifest.snapshotId)).toBeUndefined();
    const receipt = JSON.parse(await readFile(result.comparison!.receiptPath, 'utf8'));
    expect(receipt).toMatchObject({ status: 'passed', strictValidationPassed: true, digestsMatch: true,
      commitSha: f.head, configurationDigest: f.initial.snapshot.manifest.configurationDigest,
      independent: { scipIndexDigest: f.initial.snapshot.manifest.scipIndexDigest,
        extractorVersions: f.initial.snapshot.manifest.extractorVersions } });
  }
  expect(await fingerprints(f.storage)).toEqual(before);
  expect((await readdir(join(f.storage, 'work'))).filter(name => name.startsWith('compare-'))).toEqual([]);
  expect(await f.store.readHead('default')).toEqual(f.initial.snapshot);
  expect(await f.store.readHead('default-clean')).toBeUndefined();
  expect(f.calls).toHaveLength(6);
  expect(await receipts(f.storage)).toHaveLength(3);
}, 120_000);

it('cleans failures and cancellation after work starts, preserves saved bytes, and does not request missing artifacts', async () => {
  const f = await fixture(), before = await fingerprints(f.storage);
  await expect(f.hydrator.compareClean({ ref: 'HEAD', headName: 'default', onProgress: e => {
    if (e.phase === 'publish-snapshot') throw Error('private fixture error must not be retained');
  } })).rejects.toThrow('private fixture error');
  const controller = new AbortController();
  await expect(f.hydrator.compareClean({ ref: 'HEAD', headName: 'default', signal: controller.signal,
    onProgress: e => { if (e.phase === 'index-typescript') controller.abort(); } })).rejects.toThrow('cancelled');
  const artifact = join(f.storage, 'artifacts/semantic', `${f.initial.snapshot.manifest.semanticArtifactKeys[0]}.json`);
  await rename(artifact, `${artifact}.held`);
  try { await expect(f.hydrator.compareClean({ ref: 'HEAD', headName: 'default' })).rejects.toThrow('cache-failure'); }
  finally { await rename(`${artifact}.held`, artifact); }
  const records = await receipts(f.storage);
  expect(records.map(r => r.status).sort()).toEqual(['cancelled', 'failed', 'failed']);
  expect(records.every(r => r.temporaryOutputRemoved && !r.digestsMatch)).toBe(true);
  expect(JSON.stringify(records)).not.toContain('private fixture error');
  expect(await fingerprints(f.storage)).toEqual(before);
  expect(f.calls).toHaveLength(6);
});

it('reports independent digest drift without rewriting the baseline', async () => {
  const f = await fixture(), before = await fingerprints(f.storage);
  // Change only the observed baseline digest, not the independent extraction or validation.
  const baseline = { ...f.initial.snapshot.manifest, contentDigest: 'different-baseline' };
  const hydrator = new ContextGraphHydrator({ ...f.dependencies, snapshotStore: {
    ...f.store, read: id => f.store.read(id), readHead: head => f.store.readHead(head),
    readHeadManifest: async () => baseline,
    write: async () => { throw Error('must not write normal snapshots'); },
    updateHead: async () => { throw Error('must not change normal head'); },
  } });
  await expect(hydrator.compareClean({ ref: 'HEAD', headName: 'default' })).rejects.toThrow('Clean hydration drift');
  expect((await receipts(f.storage))[0]).toMatchObject({ strictValidationPassed: true, digestsMatch: false, status: 'failed' });
  expect(await fingerprints(f.storage)).toEqual(before);
  expect(await f.store.readHead('default')).toEqual(f.initial.snapshot);
});

it('revalidates legacy artifacts without promoting them or initializing a provider run', async () => {
  const f = await fixture(), before = await fingerprints(f.storage);
  const artifact = JSON.parse(await readFile(join(f.storage, 'artifacts/semantic',
    `${f.initial.snapshot.manifest.semanticArtifactKeys[0]}.json`), 'utf8'));
  const primary = join(f.root, 'unused-primary-cache');
  let modelCalls = 0;
  const hydrator = new ContextGraphHydrator({ ...f.dependencies, semanticHydrator: new SemanticHydrator(
    f.dependencies.config.semantic, new SemanticArtifactStore(primary, [f.storage]), {
      identity: artifact.modelIdentity,
      extract: async () => { modelCalls++; throw Error('Provider unavailable'); },
    },
  ) });
  const result = await hydrator.compareClean({ ref: 'HEAD', headName: 'default' });
  expect(result.semanticReused).toBe(6);
  expect(result.semanticExtracted).toBe(0);
  expect(modelCalls).toBe(0);
  await expect(stat(primary)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await fingerprints(f.storage)).toEqual(before);
});

it('retains strict SHACL failure and compiler failure without retaining their full output', async () => {
  const f = await fixture(), before = await fingerprints(f.storage);
  const invalid = new ContextGraphHydrator({ ...f.dependencies, extractorFactory: scip => [
    ...f.dependencies.extractorFactory(scip), {
      identity: { id: 'public-invalid-fixture', version: '1' },
      extract: async context => [{ ...f.initial.snapshot.facts[0]!, id: 'public-invalid-confidence',
        snapshotId: context.snapshotId, confidence: 2 }],
    },
  ] });
  await expect(invalid.compareClean({ ref: 'HEAD', headName: 'default' })).rejects.toThrow('SHACL validation');
  const workspace = f.dependencies.cleanComparison!;
  const broken = new ContextGraphHydrator({ ...f.dependencies, cleanComparison: { ...workspace,
    createTools: root => ({ ...workspace.createTools(root), ontologyCompiler: {
      compile: async () => { throw Error('compiler unavailable'); },
    } }),
  } });
  await expect(broken.compareClean({ ref: 'HEAD', headName: 'default' })).rejects.toThrow('compiler unavailable');
  expect((await receipts(f.storage)).every(r => r.status === 'failed' && !r.strictValidationPassed && r.temporaryOutputRemoved)).toBe(true);
  expect(await fingerprints(f.storage)).toEqual(before);
  expect(f.calls).toHaveLength(6);
});

it('keeps a concurrently published normal head and its evidence', async () => {
  const f = await fixture();
  let unblock!: () => void, started!: () => void;
  const blocked = new Promise<void>(resolve => { unblock = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const workspace = f.dependencies.cleanComparison!;
  const hydrator = new ContextGraphHydrator({ ...f.dependencies, cleanComparison: { ...workspace,
    createTools: root => {
      const tools = workspace.createTools(root);
      return { ...tools, staticIndexer: { async index(context) {
        started(); await blocked; return tools.staticIndexer.index(context);
      } } };
    },
  } });
  const comparing = hydrator.compareClean({ ref: 'HEAD', headName: 'default' });
  await entered;
  let next;
  try { next = await f.hydrator.hydrate({ ref: 'HEAD', headName: 'default', snapshotSuffix: 'concurrent' }); }
  finally { unblock(); }
  const result = await comparing;
  expect(result.comparison!.originalSnapshotId).toBe(f.initial.snapshot.manifest.snapshotId);
  expect(await f.store.readHead('default')).toEqual(next.snapshot);
  expect(await f.store.read(f.initial.snapshot.manifest.snapshotId)).toEqual(f.initial.snapshot);
  expect(f.calls).toHaveLength(6);
});
