import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionContext, SemanticArtifact } from '@weftlet/core';
import { createContextGraphApplication } from '../src/application/application.js';
import { ContextGraphHydrator } from '../src/application/hydrator.js';
import { planHydration } from '../src/application/hydration-plan.js';
import { createSemanticArtifactStore } from '../src/application/semantic-artifact-store.js';
import { SnapshotChecks } from '../src/application/snapshot-checks.js';
import { SavedEvidenceQueryService } from '../src/application/saved-evidence.js';
import { resolveSemanticStorageRoots, resolveStorageRoot } from '../src/configuration/cache.js';
import type { ContextGraphConfig } from '../src/configuration/config.js';
import { CodexCliSemanticExtractor, SemanticHydrator, SemanticProviderError } from '../src/extraction/semantic.js';
import { semanticArtifactKey, semanticArtifactOutputDigest, semanticProviderIdentity } from '../src/extraction/semantic-identity.js';
import { inspectSemanticCache } from '../src/extraction/semantic-cache.js';
import { DirectRdfOntologyCompiler } from '../src/extraction/ontology.js';
import { RepositoryFileExtractor } from '../src/extraction/static.js';
import { SnapshotImpactQueryService } from '../src/graph/query.js';
import { GitRepository } from '../src/repository/git.js';
import { FileSnapshotStore, SemanticArtifactStore } from '../src/storage/storage.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';

const location = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async (original) => ({
  ...await original<typeof import('node:os')>(), homedir: () => location.home,
}));

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root,
    { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

async function fixture() {
  const sandbox = await mkdtemp(join(tmpdir(), 'weftlet-semantic-reuse-'));
  roots.push(sandbox);
  const root = join(sandbox, 'repository');
  location.home = join(sandbox, 'user');
  await Promise.all(['docs', 'src'].map((path) => mkdir(join(root, path), { recursive: true })));
  await writeFile(join(root, '.gitignore'), 'context-graph.config.json\n.context-graph/\n');
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'public-cache-reuse', version: '1.0.0', private: true, type: 'module' }));
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true,
  }, include: ['src/**/*.ts'] }));
  await writeFile(join(root, 'src/jobs.ts'), 'export function normalize(value: string): string { return value.trim(); }\n');
  await writeFile(join(root, 'src/worker.ts'), "import { normalize } from './jobs.js';\nexport function dispatch(value: string): string { return normalize(value); }\n");
  for (const name of ['a', 'b']) await writeFile(join(root, `docs/${name}.md`),
    `semantic-id: public-${name}\n# Public queue ${name}\nThe queue is implemented by the public worker.\n`);
  const config: ContextGraphConfig = {
    schemaVersion: 1, repositoryId: 'public/cache-reuse', namespace: 'https://example.test/cache/',
    semanticSources: ['docs'], approvedIntentSources: ['docs/a.md'], codeRoots: ['src'],
    contractPatterns: [], evidenceRoots: [], storageScope: 'user', storagePath: '.context-graph',
    semantic: { provider: 'codex-cli', auth: { mode: 'chatgpt' }, model: 'public-test-model',
      reasoningEffort: 'low', promptVersion: 'public-v1', extractorVersion: '1', adapterVersion: '1',
      ontologyVersion: '1', minimumConfidence: 0.7, failOnUnresolved: true, concurrency: 1,
      timeoutMs: 20, retries: 0, maxDocuments: 8, maxSourceBytes: 65_536 },
    scip: { version: '0.4.0', command: 'bundled-scip-typescript', args: ['index', '--no-global-caches', 'tsconfig.json'] },
    ontology: { backend: 'rdf', toolVersion: 'rdf-record-v1' }, runtimeEvidence: [],
  };
  const configPath = join(root, 'context-graph.config.json');
  const save = (value: ContextGraphConfig) => writeFile(configPath, JSON.stringify(value));
  await save(config);
  const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0', '--no-optional-locks', ...args], { cwd: root })).stdout.trim();
  await git('init', '--quiet');
  await git('add', '.');
  await git('-c', 'user.name=Public Cache Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'public cache fixture');
  const commitSha = await git('rev-parse', 'HEAD');
  const repository = new GitRepository(root);
  const context: ExtractionContext = { repositoryRoot: root, repositoryId: config.repositoryId,
    ref: 'HEAD', commitSha, snapshotId: 'public-cache-fixture', changedPaths: [], deletedPaths: [], renamedPaths: {} };
  const sources = await repository.semanticSources(context, config.semanticSources);
  return { root, sandbox, config, configPath, save, git, repository, context, sources };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Calls = { path: string; timeoutMs?: number }[];

function codex(config: ContextGraphConfig, calls: Calls, failPath?: string) {
  return new CodexCliSemanticExtractor(config.semantic, {
    async run(_command, args, _cwd, prompt, _environment, options) {
      const path = /Source path: ([^\n]+)/.exec(prompt)?.[1];
      if (!path) throw new Error('Missing public source path in Codex request');
      calls.push({ path, timeoutMs: options?.timeoutMs });
      if (path === failPath) throw new SemanticProviderError('timeout', 'Public fixture deadline reached');
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      if (!outputPath) throw new Error('Missing structured output path');
      await writeFile(outputPath, JSON.stringify({ assertions: [{
        subject: { id: `capability:${path}`, kind: 'Capability', label: 'Public queue' },
        predicate: 'implementedBy',
        object: { id: 'component:file:src/worker.ts', kind: 'Component', label: 'Public worker' },
        citation: { startLine: 3, endLine: 3 }, confidence: 0.95,
      }], oml: '', diagnostics: [] }));
    },
  }, async () => 'chatgpt');
}

function extraction(f: Fixture, config: ContextGraphConfig, calls: Calls, options: {
  store?: SemanticArtifactStore; failPath?: string;
} = {}) {
  const store = options.store ?? createSemanticArtifactStore(f.root, config);
  const semantic = new SemanticHydrator(config.semantic, store, codex(config, calls, options.failPath));
  return { store, semantic };
}

function application(f: Fixture, config: ContextGraphConfig, calls: Calls, failPath?: string) {
  const { semantic, store } = extraction(f, config, calls, { failPath });
  const snapshotStore = new FileSnapshotStore(resolveStorageRoot(f.root, config));
  const hydrator = new ContextGraphHydrator({ config, repository: f.repository, snapshotStore,
    semanticHydrator: semantic,
    staticIndexer: { async index() { return { path: 'public-fixture.scip', version: '0.4.0',
      digest: 'public-deterministic-index', mode: 'full' }; } },
    ontologyCompiler: new DirectRdfOntologyCompiler(resolveStorageRoot(f.root, config)),
    runtimeEvidenceProvider: { async collect() { return []; } },
    extractorFactory: () => [new RepositoryFileExtractor(f.repository, config.codeRoots, 'public-deterministic-index')],
    invariantEvaluators: [],
  });
  return { hydrator, snapshotStore, semantic, store };
}

const artifactPath = (root: string, key: string) => join(root, 'artifacts', 'semantic', `${key}.json`);
const changedSemantic = (config: ContextGraphConfig, change: Partial<ContextGraphConfig['semantic']>) =>
  ({ ...config, semantic: { ...config.semantic, ...change } });

describe('operational-setting semantic artifact reuse', () => {
  it('separates five Codex operational controls from full snapshot profiles, preserving semantic and consumer isolation', async () => {
    const f = await fixture();
    const roots = resolveSemanticStorageRoots(f.root, f.config);
    for (const change of [{ timeoutMs: 200 }, { retries: 1 }, { concurrency: 2 },
      { maxDocuments: 9 }, { maxSourceBytes: 131_072 }]) {
      const updated = changedSemantic(f.config, change);
      expect(resolveSemanticStorageRoots(f.root, updated).primary).toBe(roots.primary);
      expect(resolveStorageRoot(f.root, updated)).not.toBe(resolveStorageRoot(f.root, f.config));
      expect(resolveSemanticStorageRoots(f.root, updated).legacy).toBe(resolveStorageRoot(f.root, updated));
    }
    for (const change of [{ model: 'another-model' }, { reasoningEffort: 'high' }, { promptVersion: 'v2' },
      { extractorVersion: '2' }, { adapterVersion: '2' }, { ontologyVersion: '2' },
      { minimumConfidence: 0.9 }, { failOnUnresolved: false },
      { auth: { mode: 'api-key' as const, apiKeyEnv: 'PUBLIC_TEST_KEY' } },
      { unknownProviderOption: 'changed' }]) {
      expect(resolveSemanticStorageRoots(f.root, changedSemantic(f.config, change)).primary).not.toBe(roots.primary);
    }
    expect(resolveSemanticStorageRoots(join(f.sandbox, 'another-checkout'), f.config).primary).not.toBe(roots.primary);
    expect(resolveSemanticStorageRoots(f.root, { ...f.config, repositoryId: 'public/another-consumer' }).primary).not.toBe(roots.primary);
    const workspace = { ...f.config, storageScope: 'workspace' as const };
    expect(resolveSemanticStorageRoots(f.root, workspace)).toEqual({ primary: resolveStorageRoot(f.root, workspace) });
    const module = changedSemantic(f.config, { provider: 'module', providerModule: './public-provider.mjs', providerIdentity: 'public:1' });
    expect(resolveSemanticStorageRoots(f.root, module)).toEqual({ primary: resolveStorageRoot(f.root, module) });
    expect(resolveSemanticStorageRoots(f.root, changedSemantic(module, { timeoutMs: 200 })).primary)
      .not.toBe(resolveSemanticStorageRoots(f.root, module).primary);
  });

  it('reuses completed work after interruption and a ten-minute timeout, while requiring a fresh current-config snapshot', async () => {
    const f = await fixture();
    const calls: Calls = [];
    const first = application(f, f.config, calls, 'docs/b.md');
    const baseline = await first.hydrator.hydrate({ ref: 'HEAD', headName: 'default', semanticSources: [] });
    await expect(first.hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).rejects.toMatchObject({ code: 'timeout' });
    expect(calls).toEqual([{ path: 'docs/a.md', timeoutMs: 20 }, { path: 'docs/b.md', timeoutMs: 20 }]);
    expect(await first.snapshotStore.readHead('default')).toEqual(baseline.snapshot);
    const pool = resolveSemanticStorageRoots(f.root, f.config).primary;
    const completed = await readdir(join(pool, 'artifacts/semantic'));
    expect(completed).toHaveLength(1);
    const completedBytes = await readFile(join(pool, 'artifacts/semantic', completed[0]!));
    const updated = changedSemantic(f.config, { timeoutMs: 600_000 });
    await f.save(updated);
    const planned = await planHydration(f.configPath);
    expect(planned.estimates).toEqual({ reusableArtifacts: 1, extractions: 1, unknownArtifacts: 0 });
    const retry = application(f, updated, calls);
    const checks = new SnapshotChecks(first.snapshotStore, f.repository, retry.hydrator,
      undefined, sha256(stableJson(updated)));
    await expect(checks.read({})).rejects.toThrow('configuration differs');
    const saved = await new SavedEvidenceQueryService(new SnapshotImpactQueryService(first.snapshotStore, 'default'),
      f.repository, sha256(stableJson(updated))).scan({});
    expect(saved.evidenceState).toMatchObject({ configurationMatches: false, eligibleForCurrentDiffValidation: false });
    const result = await retry.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(result).toMatchObject({ semanticExtracted: 1, semanticReused: 1 });
    expect(calls.at(-1)).toEqual({ path: 'docs/b.md', timeoutMs: 600_000 });
    expect(calls).toHaveLength(3);
    expect(result.snapshot.manifest.configurationDigest).toBe(sha256(stableJson(updated)));
    expect(result.snapshot.manifest.snapshotId).not.toBe(baseline.snapshot.manifest.snapshotId);
    expect(result.snapshot.facts.filter((fact) => fact.extractor.id.startsWith('codex-cli:')))
      .toEqual(expect.arrayContaining(f.sources.map((source) => expect.objectContaining({
        provenance: expect.objectContaining({ path: source.path, digest: source.digest, commitSha: f.context.commitSha }),
        authority: 'inferred', extractionReview: 'unreviewed',
      }))));
    expect(await readFile(join(pool, 'artifacts/semantic', completed[0]!))).toEqual(completedBytes);
    expect(await first.snapshotStore.readHead('default')).toEqual(baseline.snapshot);
    expect(await retry.hydrator.hydrate({ ref: 'HEAD', headName: 'default' }))
      .toMatchObject({ semanticExtracted: 0, semanticReused: 2,
        snapshot: { manifest: { snapshotId: result.snapshot.manifest.snapshotId, contentDigest: result.snapshot.manifest.contentDigest } } });
  });

  it('reads exact legacy artifacts without preview writes and promotes only validated real-hydration hits', async () => {
    const f = await fixture();
    // Freeze the released user-profile formula rather than computing both sides with the new resolver.
    const legacy = resolve(location.home, '.cache', 'context-graph',
      sha256(stableJson({ config: f.config, checkout: resolve(f.root) })).slice(0, 20));
    const calls: Calls = [];
    const old = extraction(f, f.config, calls, { store: new SemanticArtifactStore(legacy) });
    const artifacts = await Promise.all(f.sources.map((source) => old.semantic.hydrate(source, f.context)));
    const bytes = await Promise.all(artifacts.map(({ artifact }) => readFile(artifactPath(legacy, artifact.key))));
    const primary = resolveSemanticStorageRoots(f.root, f.config).primary;
    expect(resolveSemanticStorageRoots(f.root, f.config).legacy).toBe(legacy);
    const plan = await planHydration(f.configPath);
    expect(plan.estimates).toEqual({ reusableArtifacts: 2, extractions: 0, unknownArtifacts: 0 });
    expect(plan.documents.every((document) => document.cache.origin === 'legacy')).toBe(true);
    await expect(readdir(primary)).rejects.toMatchObject({ code: 'ENOENT' });
    const current = extraction(f, f.config, calls);
    for (const source of f.sources) expect((await current.semantic.hydrate(source, f.context)).reused).toBe(true);
    expect(calls).toHaveLength(2);
    for (const [index, { artifact }] of artifacts.entries()) {
      expect(await readFile(artifactPath(legacy, artifact.key))).toEqual(bytes[index]);
      expect(await readFile(artifactPath(primary, artifact.key))).toEqual(bytes[index]);
    }
    const updated = changedSemantic(f.config, { timeoutMs: 200 });
    await f.save(updated);
    expect((await planHydration(f.configPath)).documents.every((document) => document.cache.origin === 'primary')).toBe(true);
  });

  it('uses shared artifacts through the real application with changed settings, without invoking Codex', async () => {
    const f = await fixture();
    const seeded = extraction(f, f.config, []);
    for (const source of f.sources) await seeded.semantic.hydrate(source, f.context);
    const updated = changedSemantic(f.config, { timeoutMs: 200, retries: 1, concurrency: 2 });
    await f.save(updated);
    const forbidProvider = vi.spyOn(CodexCliSemanticExtractor.prototype, 'extract').mockImplementation(async () => {
      throw new Error('Unexpected external provider invocation in the public cache fixture');
    });
    const app = await createContextGraphApplication(f.configPath);
    const result = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(result).toMatchObject({ semanticExtracted: 0, semanticReused: 2 });
    expect(result.snapshot.manifest.configurationDigest).toBe(sha256(stableJson(updated)));
    expect(result.snapshot.facts.some((fact) => fact.extractor.id.includes('scip'))).toBe(true);
    expect(forbidProvider).not.toHaveBeenCalled();
    expect((await planHydration(f.configPath)).estimates.reusableArtifacts).toBe(2);
  });

  it('does not scan other legacy profiles or treat an unfinished temporary artifact as reusable', async () => {
    const f = await fixture();
    const calls: Calls = [];
    const originalRoots = resolveSemanticStorageRoots(f.root, f.config);
    const source = f.sources[0]!;
    const artifact = (await extraction(f, f.config, calls,
      { store: new SemanticArtifactStore(originalRoots.legacy!) }).semantic.hydrate(source, f.context)).artifact;
    const originalBytes = await readFile(artifactPath(originalRoots.legacy!, artifact.key));
    const updated = changedSemantic(f.config, { timeoutMs: 200 });
    await f.save(updated);
    const roots = resolveSemanticStorageRoots(f.root, updated);
    expect(roots.legacy).not.toBe(originalRoots.legacy);
    await mkdir(join(roots.primary, 'artifacts/semantic'), { recursive: true });
    const incomplete = `${artifactPath(roots.primary, artifact.key)}.interrupted.tmp`;
    await writeFile(incomplete, originalBytes);
    const plan = await planHydration(f.configPath);
    expect(plan.estimates).toEqual({ reusableArtifacts: 0, extractions: 2, unknownArtifacts: 0 });
    const extracted = await extraction(f, updated, calls).semantic.hydrate(source, f.context);
    expect(extracted.reused).toBe(false);
    expect(calls).toHaveLength(2);
    expect(await readFile(artifactPath(originalRoots.legacy!, artifact.key))).toEqual(originalBytes);
    expect(await readFile(incomplete)).toEqual(originalBytes);
  });

  it('still applies document and source-byte limits to cached sources before any provider work', async () => {
    const f = await fixture();
    const calls: Calls = [];
    const seeded = extraction(f, f.config, calls);
    for (const source of f.sources) await seeded.semantic.hydrate(source, f.context);
    for (const change of [{ maxDocuments: 1 }, { maxSourceBytes: 1 }]) {
      const updated = changedSemantic(f.config, change);
      await f.save(updated);
      const plan = await planHydration(f.configPath);
      expect(plan).toMatchObject({ ready: false, estimates: { reusableArtifacts: 2, extractions: 0 } });
      expect(plan.issues.some((issue) => issue.severity === 'error' && issue.code.includes('budget'))).toBe(true);
      await expect(application(f, updated, calls).hydrator.hydrate({ ref: 'HEAD', headName: 'default' }))
        .rejects.toThrow('budget exceeded');
    }
    expect(calls).toHaveLength(2);
  });

  it.each(['primary', 'legacy'] as const)('fails closed for corrupt %s artifacts and preserves them during explicit forced extraction', async (origin) => {
    const f = await fixture();
    const calls: Calls = [];
    const source = f.sources[0]!;
    const roots = resolveSemanticStorageRoots(f.root, f.config);
    const target = origin === 'primary' ? roots.primary : roots.legacy!;
    const artifact = (await extraction(f, f.config, calls,
      { store: new SemanticArtifactStore(target) }).semantic.hydrate(source, f.context)).artifact;
    // A valid legacy copy must not conceal corruption in the primary artifact.
    if (origin === 'primary') await new SemanticArtifactStore(roots.legacy!).write(artifact);
    const corrupt = origin === 'primary' ? '{truncated' : JSON.stringify({ ...artifact, outputDigest: 'invalid' });
    await writeFile(artifactPath(target, artifact.key), corrupt);
    const before = calls.length;
    const current = extraction(f, f.config, calls);
    const plan = await planHydration(f.configPath);
    expect(plan.ready).toBe(false);
    expect(plan.documents.find((document) => document.path === source.path)?.cache.status).toBe('corrupt');
    await expect(current.semantic.hydrate(source, f.context)).rejects.toThrow('Cached artifact');
    expect(calls).toHaveLength(before);
    const forced = await current.semantic.hydrate(source, f.context, 'public-explicit-force');
    expect(forced.reused).toBe(false);
    expect(forced.artifact.key).not.toBe(artifact.key);
    expect(await readFile(artifactPath(target, artifact.key), 'utf8')).toBe(corrupt);
    expect(await readFile(artifactPath(roots.primary, forced.artifact.key), 'utf8')).toContain(forced.artifact.outputDigest);
  });

  it('keeps concurrent profile writers atomic and never overwrites a conflicting artifact', async () => {
    const f = await fixture();
    const original = (await extraction(f, f.config, []).semantic.hydrate(f.sources[0]!, f.context)).artifact;
    const roots = resolveSemanticStorageRoots(f.root, f.config);
    await rm(artifactPath(roots.primary, original.key));
    const stores = [f.config, changedSemantic(f.config, { timeoutMs: 200 })]
      .map((config) => createSemanticArtifactStore(f.root, config));
    await Promise.all(stores.map((store) => store.write(original)));
    expect(await readdir(join(roots.primary, 'artifacts/semantic'))).toEqual([`${original.key}.json`]);
    const preserved = await readFile(artifactPath(roots.primary, original.key));
    const altered: SemanticArtifact = { ...original, rawModelOutput: '{"public":"different output"}',
      outputDigest: semanticArtifactOutputDigest({ ...original, rawModelOutput: '{"public":"different output"}' }) };
    await expect(stores[1]!.write(altered)).rejects.toThrow('Concurrent semantic artifact differs');
    expect(await readFile(artifactPath(roots.primary, original.key))).toEqual(preserved);
    expect(await readdir(join(roots.primary, 'artifacts/semantic'))).toEqual([`${original.key}.json`]);
  });

  it('rejects an invalid concurrent primary winner during legacy promotion even when its output digest matches', async () => {
    const f = await fixture();
    const calls: Calls = [];
    const source = f.sources[0]!;
    const roots = resolveSemanticStorageRoots(f.root, f.config);
    const artifact = (await extraction(f, f.config, calls,
      { store: new SemanticArtifactStore(roots.legacy!) }).semantic.hydrate(source, f.context)).artifact;
    const legacyBytes = await readFile(artifactPath(roots.legacy!, artifact.key));
    const current = extraction(f, f.config, calls);
    const write = current.store.write.bind(current.store);
    // Deterministically interleave another writer after the legacy read but before its copy.
    vi.spyOn(current.store, 'write').mockImplementationOnce(async (candidate) => {
      await new SemanticArtifactStore(roots.primary).write({ ...candidate, stableSemanticId: 'wrong-public-source' });
      await write(candidate);
    });
    await expect(current.semantic.hydrate(source, f.context)).rejects.toThrow('Cached artifact identity');
    expect(calls).toHaveLength(1);
    expect(await readFile(artifactPath(roots.legacy!, artifact.key))).toEqual(legacyBytes);
    const retained = await new SemanticArtifactStore(roots.primary).read(artifact.key);
    expect(retained).toMatchObject({ stableSemanticId: 'wrong-public-source', outputDigest: artifact.outputDigest });
    expect((await inspectSemanticCache(current.store, f.config.semantic, source,
      semanticProviderIdentity(f.config.semantic))).status).toBe('corrupt');
  });

  it('retains the released artifact key and invalidates changed sources or output-affecting settings', async () => {
    const f = await fixture();
    const source = f.sources[0]!;
    const semantic = f.config.semantic;
    const identity = `codex-cli:${semantic.model}:${semantic.reasoningEffort}:${semantic.promptVersion}:contract-v3`;
    const releasedKey = sha256(stableJson({ stableSemanticId: source.stableSemanticId, sourceDigest: source.digest,
      promptVersion: semantic.promptVersion, extractorVersion: semantic.extractorVersion, modelIdentity: identity,
      adapterVersion: semantic.adapterVersion, ontologyVersion: semantic.ontologyVersion,
      minimumConfidence: semantic.minimumConfidence, failOnUnresolved: semantic.failOnUnresolved,
      forceRevision: undefined, diagnosticContractVersion: 3, repositoryNodeIdentityVersion: 1 }));
    expect(semanticArtifactKey(semantic, source, semanticProviderIdentity(semantic))).toBe(releasedKey);
    const seeded = extraction(f, f.config, []);
    await seeded.semantic.hydrate(source, f.context);
    for (const changed of [{ ...source, digest: sha256('changed committed content'), content: 'Changed public source.\n' },
      { ...source, stableSemanticId: 'different-public-identity' }]) {
      expect((await inspectSemanticCache(seeded.store, semantic, changed, identity)).status).toBe('miss');
    }
    for (const change of [{ model: 'other' }, { reasoningEffort: 'high' }, { promptVersion: 'v2' },
      { extractorVersion: '2' }, { adapterVersion: '2' }, { ontologyVersion: '2' },
      { minimumConfidence: 0.9 }, { failOnUnresolved: false }]) {
      const current = { ...semantic, ...change };
      expect(semanticArtifactKey(current, source, semanticProviderIdentity(current))).not.toBe(releasedKey);
      expect((await inspectSemanticCache(seeded.store, current, source, semanticProviderIdentity(current))).status).toBe('miss');
    }
  });
});
