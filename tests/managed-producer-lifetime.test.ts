import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { traversalFixture } from './fixtures/traversal.js';
import { runProcess } from '../src/infrastructure/process.js';
import { ScipTypeScriptIndexer } from '../src/extraction/static.js';
import { DirectRdfOntologyCompiler, OpenCaesarOntologyCompiler } from '../src/extraction/ontology.js';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { withManagedCacheAccess } from '../src/storage/coordination/managed-access.js';
import { withCacheMaintenance } from '../src/storage/coordination/access.js';

vi.mock('../src/infrastructure/process.js', () => ({ runProcess: vi.fn() }));
vi.mock('node:stream/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:stream/promises')>(), pipeline: vi.fn() }));
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); vi.mocked(runProcess).mockReset(); vi.mocked(pipeline).mockReset();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5 }))); });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

it('retains managed protection for started raw SCIP and compiler operations after their caller returns', async () => {
  const f = await traversalFixture(); roots.push(f.root);
  const root = join(f.root, 'cache'); await mkdir(root); await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  await mkdir(join(f.root, 'ontology'));
  const realStreams = await vi.importActual<typeof import('node:stream/promises')>('node:stream/promises');
  for (const kind of ['scip', 'opencaesar', 'rdf'] as const) {
    const entered = deferred(), release = deferred(); let settled = false;
    vi.mocked(runProcess).mockImplementation(async () => { entered.resolve(); await release.promise; throw Error('bounded process failure'); });
    vi.mocked(pipeline).mockImplementation(async (...args: unknown[]) => {
      entered.resolve(); await release.promise;
      return Reflect.apply(realStreams.pipeline, undefined, args);
    });
    vi.spyOn(OpenCaesarOntologyCompiler.prototype, 'checkReady').mockResolvedValue(undefined);
    const compile = () => kind === 'rdf' ? new DirectRdfOntologyCompiler(root).compile('test', []) : kind === 'opencaesar'
      ? new OpenCaesarOntologyCompiler({ backend: 'opencaesar', projectPath: 'ontology', containerImage: 'public-fixture-no-execution', toolVersion: 'test' }, f.root, root).compile('test', [])
      : new ScipTypeScriptIndexer(f.config.scip, root).index({ repositoryRoot: f.root, repositoryId: 'public/fixture',
        commitSha: f.head, ref: 'HEAD', snapshotId: 'test', changedPaths: [], deletedPaths: [], renamedPaths: {} });
    let child!: Promise<unknown>;
    const operation = withManagedCacheAccess([root], async () => {
      child = compile().catch(error => error.message); await entered.promise;
      // Intentionally do not await the compiler/indexer; the managed scope must drain it.
    });
    const done = operation.then(() => { settled = true; });
    await entered.promise;
    await expect(withCacheMaintenance(root, async () => undefined, { timeoutMs: 75 })).rejects.toMatchObject({ phase: 'drain' });
    expect(settled).toBe(false); release.resolve(); await done;
    if (kind === 'rdf') expect(await child).toMatchObject({ rdfFiles: expect.any(Array) });
    else expect(await child).toBe('bounded process failure');
    expect(await readdir(join(root, '.weftlet-coordination/participants'))).toEqual([]);
  }
});
