import { readdirSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { traversalApplication, traversalFixture } from './fixtures/traversal.js';
import { ContextGraphHydrator } from '../src/application/hydrator.js';
import { createContextGraphApplication } from '../src/application/application.js';
import { startExplorerServer } from '../src/visualization/explorer-server.js';
import { exportExplorerReport } from '../src/application/explorer-export.js';
import { createExplorerService } from '../src/application/explorer-service.js';
import { planHydration } from '../src/application/hydration-plan.js';
import { adoptSemanticCache } from '../src/application/cache-adoption.js';
import { exportSnapshot } from '../src/application/delivery/export.js';
import { importSnapshot } from '../src/application/delivery/import.js';
import { withInspectionSnapshot } from '../src/application/cache-inspection/context.js';
import { profileSnapshot } from '../src/storage/inspection/profile.js';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { withManagedCacheAccess } from '../src/storage/coordination/managed-access.js';
import { withCacheMaintenance } from '../src/storage/coordination/access.js';
import { DirectRdfOntologyCompiler } from '../src/extraction/ontology.js';
import { ScipTypeScriptIndexer } from '../src/extraction/static.js';
import { sha256 } from '../src/infrastructure/util.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5 }))); });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const participants = (root: string) => readdir(join(root, '.weftlet-coordination/participants'));
async function fixture(real = false) {
  const f = await traversalFixture(); roots.push(f.root);
  const config = { ...f.config, storageScope: 'workspace' as const };
  await f.save(config); const head = f.head;
  const app = traversalApplication(f, config, real);
  const initial = await app.hydrate();
  await enableCacheCoordination(app.storage, { acknowledgeQuiescence: true });
  return { ...f, ...app, config, head, initial };
}
async function fingerprints(root: string) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return Object.fromEntries(await Promise.all(entries.filter(entry => entry.isFile() &&
    !entry.parentPath.includes('comparison-receipts')).map(async entry => {
    const path = join(entry.parentPath, entry.name); return [path, sha256(await readFile(path))];
  })));
}

it('protects real indexing, strict hydration/repeat/comparison and saved query/transfer lifecycles without changing evidence', async () => {
  const f = await fixture(true), id = f.initial.snapshot.manifest.snapshotId;
  const before = await fingerprints(f.storage), configBytes = await readFile(f.configPath);
  let checkedIndex = false;
  const repeat = await f.hydrator.hydrate({ ref: 'HEAD', headName: 'default', onProgress: e => {
    expect(readdirSync(join(f.storage, '.weftlet-coordination/participants'))).toHaveLength(1);
    if (e.phase === 'index-typescript') checkedIndex = true;
  } });
  expect(checkedIndex).toBe(true);
  expect(repeat).toMatchObject({ semanticExtracted: 0, semanticReused: 6 });
  expect(repeat.snapshot.manifest.contentDigest).toBe(f.initial.snapshot.manifest.contentDigest);
  const beforeComparison = await fingerprints(f.storage);
  const clean = await f.hydrator.compareClean({ ref: 'HEAD', headName: 'default' });
  expect(clean.comparison!.temporaryOutputRemoved).toBe(true);
  expect(clean.snapshot.manifest.contentDigest).toBe(f.initial.snapshot.manifest.contentDigest);
  expect(await fingerprints(f.storage)).toEqual(beforeComparison);
  expect(f.indexes()).toBe(3); expect(f.calls).toHaveLength(6);
  expect(await fingerprints(f.storage)).toMatchObject(before);
  expect(await readFile(f.configPath)).toEqual(configBytes);
  const plan = await planHydration(f.configPath);
  expect(plan.estimates).toMatchObject({ reusableArtifacts: 6, extractions: 0 });
  const adoption = await adoptSemanticCache(f.configPath, { fromConfigPath: f.configPath, dryRun: true });
  expect(adoption.counts.reusable).toBe(6);
  // Factory queries never call the configured Codex executable: the only extraction above used the deterministic public runner.
  const app = await createContextGraphApplication(f.configPath);
  const query = await app.queryService.scan({ snapshotId: id, changedFiles: ['src/discovery.ts'], maxFacts: 20 });
  expect(query.facts.length).toBeGreaterThan(0);
  const explorer = await createExplorerService(f.configPath, id);
  expect((await explorer.metadata()).snapshot.snapshotId).toBe(id);
  expect((await explorer.discovery.catalog({ snapshotId: id, maxNodes: 10 })).nodes.length).toBeGreaterThan(0);
  const profile = await withInspectionSnapshot(f.configPath, id, path => profileSnapshot(path));
  expect(profile.sections.facts!.records).toBe(f.initial.snapshot.facts.length);
  const bundles = join(f.root, 'bundles'); await mkdir(bundles);
  await enableCacheCoordination(bundles, { acknowledgeQuiescence: true });
  let exportPhases = 0, importPhases = 0;
  const output = join(bundles, 'one');
  const exported = await exportSnapshot(f.configPath, { snapshotId: id, output, includeSemantic: true,
    onProgress: () => { exportPhases++;
      expect(readdirSync(join(f.storage, '.weftlet-coordination/participants'))).toHaveLength(1);
      expect(readdirSync(join(bundles, '.weftlet-coordination/participants'))).toHaveLength(1); } });
  expect(exported.strictValidation).toBe(true);
  const imported = await importSnapshot(f.configPath, { input: output, expectDigest: exported.manifestSha256,
    includeSemantic: true, onProgress: () => { importPhases++;
      expect(readdirSync(join(f.storage, '.weftlet-coordination/participants'))).toHaveLength(1);
      expect(readdirSync(join(bundles, '.weftlet-coordination/participants'))).toHaveLength(1); } });
  expect(imported.strictValidation).toBe(true); expect(exportPhases).toBeGreaterThan(0); expect(importPhases).toBeGreaterThan(0);
  expect(await fingerprints(f.storage)).toMatchObject(before);
  expect(await participants(f.storage)).toEqual([]); expect(await participants(bundles)).toEqual([]);
  // Active requests are excluded from maintenance, but idle explorer instances do not pin a server-wide lease.
  await withCacheMaintenance(f.storage, async () => undefined);
  await withManagedCacheAccess([f.storage], async () => {
    await expect(withCacheMaintenance(f.storage, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
    await explorer.pinned();
  });
}, 120_000);

it('settles all started extractors and invariants after failure before releasing the hydration lease', async () => {
  const f = await fixture(); const before = await fingerprints(f.storage);
  for (const phase of ['extractor', 'invariant'] as const) {
    const entered = deferred(), release = deferred(); let finished = false;
    const delay = async () => {
      entered.resolve(); await release.promise;
      expect(await f.store.readHead('default')).toEqual(f.initial.snapshot);
      finished = true; return [];
    };
    const bad = () => { throw Error(`${phase} failed`); };
    const dependencies = phase === 'extractor' ? { ...f.dependencies, extractorFactory: () => [
      { identity: { id: 'delayed-public', version: '1' }, extract: delay },
      { identity: { id: 'failed-public', version: '1' }, extract: bad },
    ] } : { ...f.dependencies, invariantEvaluators: [
      { evaluate: delay }, { evaluate: bad },
    ] };
    let settled = false;
    const operation = new ContextGraphHydrator(dependencies).hydrate({ ref: 'HEAD', headName: 'default' });
    const result = operation.then(() => { settled = true; return 'unexpected'; }, error => { settled = true; return error.message; });
    await entered.promise;
    await expect(withCacheMaintenance(f.storage, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
    expect(settled).toBe(false); expect(finished).toBe(false);
    release.resolve(); expect(await result).toBe(`${phase} failed`); expect(finished).toBe(true);
    expect(await participants(f.storage)).toEqual([]);
    expect(await f.store.readHead('default')).toEqual(f.initial.snapshot);
  }
  expect(await fingerprints(f.storage)).toMatchObject(before);
});

it('cancels a hydration waiting for maintenance and refuses unscoped managed index/compiler paths before writes', async () => {
  const f = await fixture(), before = await fingerprints(f.storage);
  const entered = deferred(), release = deferred(), controller = new AbortController();
  const maintenance = withCacheMaintenance(f.storage, async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const hydration = f.hydrator.hydrate({ ref: 'HEAD', headName: 'default', signal: controller.signal });
  const failure = expect(hydration).rejects.toThrow(); controller.abort(); await failure;
  release.resolve(); await maintenance;
  await expect(new DirectRdfOntologyCompiler(f.storage).compile('unscoped', [])).rejects.toThrow('enclosing');
  await expect(new ScipTypeScriptIndexer(f.config.scip, f.storage).index({ repositoryId: 'public/fixture', ref: 'HEAD', changedPaths: [], deletedPaths: [], renamedPaths: {},
    repositoryRoot: f.root, snapshotId: 'unscoped', commitSha: f.head })).rejects.toThrow('enclosing');
  expect(await fingerprints(f.storage)).toMatchObject(before);
});


it('protects complete HTTP queries and portable report output while an idle server holds no lease', async () => {
  const f = await fixture(), id = f.initial.snapshot.manifest.snapshotId;
  const explorer = await createExplorerService(f.configPath, id);
  const server = await startExplorerServer(explorer, { port: 0 });
  const original = explorer.discovery.catalog.bind(explorer.discovery);
  let entered = deferred(), release = deferred();
  explorer.discovery.catalog = async request => { entered.resolve(); await release.promise; return original(request); };
  try {
    await withCacheMaintenance(f.storage, async () => undefined);
    const response = fetch(`${server.url}/api/query`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'graph.catalog', params: { snapshotId: id, maxNodes: 10 } }) });
    await entered.promise;
    await expect(withCacheMaintenance(f.storage, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
    release.resolve(); expect((await response).status).toBe(200);
    await withCacheMaintenance(f.storage, async () => undefined);
    const reports = join(f.root, 'reports'); await mkdir(reports);
    await enableCacheCoordination(reports, { acknowledgeQuiescence: true });
    entered = deferred(); release = deferred();
    const exported = exportExplorerReport(explorer, { output: join(reports, 'one'), roots: ['workflow:discovery'], depth: 1 });
    await entered.promise;
    expect(await participants(f.storage)).toHaveLength(1); expect(await participants(reports)).toHaveLength(1);
    await expect(withCacheMaintenance(reports, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
    release.resolve(); expect((await exported).report.includedFacts).toBeGreaterThan(0);
    expect(await participants(reports)).toEqual([]);
  } finally { release.resolve(); await server.close(); }
  expect(await participants(f.storage)).toEqual([]);
});

it('declares an independent custom comparison root before workspace creation and receipt publication', async () => {
  const f = await fixture(), comparisonRoot = join(f.root, 'comparison-cache'); await mkdir(comparisonRoot);
  await enableCacheCoordination(comparisonRoot, { acknowledgeQuiescence: true });
  const hydration = new ContextGraphHydrator({ ...f.dependencies,
    cleanComparison: { ...f.dependencies.cleanComparison!, storageRoot: comparisonRoot } });
  let checks = 0;
  const result = await hydration.compareClean({ ref: 'HEAD', headName: 'default', onProgress: () => {
    checks++;
    expect(readdirSync(join(f.storage, '.weftlet-coordination/participants'))).toHaveLength(1);
    expect(readdirSync(join(comparisonRoot, '.weftlet-coordination/participants'))).toHaveLength(1);
  } });
  expect(checks).toBeGreaterThan(0);
  expect(result.comparison!.receiptPath.startsWith(comparisonRoot)).toBe(true);
  expect(result.comparison!.temporaryOutputRemoved).toBe(true);
  expect(await participants(comparisonRoot)).toEqual([]);
  expect(await f.store.readHead('default')).toEqual(f.initial.snapshot);
});
