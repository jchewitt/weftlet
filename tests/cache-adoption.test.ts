import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionContext, SemanticArtifact, SemanticSource } from '@weftlet/core';
import { adoptSemanticCache } from '../src/application/cache-adoption.js';
import { planHydration } from '../src/application/hydration-plan.js';
import type { ContextGraphConfig } from '../src/configuration/config.js';
import { resolveSemanticStorageRoots } from '../src/configuration/cache.js';
import { CodexCliSemanticExtractor, SemanticHydrator, type SemanticOutput } from '../src/extraction/semantic.js';
import { GitRepository } from '../src/repository/git.js';
import { SemanticArtifactStore } from '../src/storage/storage.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';

const cacheHome = vi.hoisted(() => ({ path: '' }));
vi.mock('node:os', async (original) => ({
  ...await original<typeof import('node:os')>(),
  homedir: () => cacheHome.path,
}));

const execute = promisify(execFile);
const roots: string[] = [];
const bodyMarker = 'PUBLIC_SOURCE_BODY_NOT_FOR_ADOPTION_OUTPUT';

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root,
    { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

/** Frozen released formulas, independent of the new cache location helpers. */
const legacyRoot = (root: string, config: ContextGraphConfig) => join(cacheHome.path,
  '.cache', 'context-graph', sha256(stableJson({ config, checkout: resolve(root) })).slice(0, 20));
const codexIdentity = (config: ContextGraphConfig) =>
  `codex-cli:${config.semantic.model}:${config.semantic.reasoningEffort}:${config.semantic.promptVersion}:contract-v3`;
const legacyKey = (config: ContextGraphConfig, source: SemanticSource) => sha256(stableJson({
  stableSemanticId: source.stableSemanticId, sourceDigest: source.digest,
  promptVersion: config.semantic.promptVersion, extractorVersion: config.semantic.extractorVersion,
  modelIdentity: codexIdentity(config), adapterVersion: config.semantic.adapterVersion,
  ontologyVersion: config.semantic.ontologyVersion, minimumConfidence: config.semantic.minimumConfidence,
  failOnUnresolved: config.semantic.failOnUnresolved, forceRevision: undefined, diagnosticContractVersion: 3,
  repositoryNodeIdentityVersion: 1,
}));
const artifactPath = (root: string, key: string) => join(root, 'artifacts', 'semantic', `${key}.json`);

async function filesUnder(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function visit(directory: string, prefix = '') {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await visit(join(directory, entry.name), `${relative}/`);
      else files[relative] = sha256(await readFile(join(directory, entry.name)));
    }
  }
  await visit(root);
  return files;
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'weftlet-cache-adoption-'));
  roots.push(directory);
  cacheHome.path = join(directory, 'user-home');
  const root = join(directory, 'project');
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  for (const name of ['a', 'b']) await writeFile(join(root, `docs/${name}.md`),
    `semantic-id: public-${name}\n# Queue ${name}\n${bodyMarker}\n`);
  await writeFile(join(root, 'reject-adapter.mjs'), "throw new Error('Adoption must never load a repository adapter');\n");
  const previous: ContextGraphConfig = {
    schemaVersion: 1, repositoryId: 'public/cache-adoption', namespace: 'https://example.test/adoption/',
    adapter: './reject-adapter.mjs', semanticSources: ['docs'], approvedIntentSources: ['docs/a.md'],
    codeRoots: [], contractPatterns: [], evidenceRoots: [], runtimeEvidence: [],
    storageScope: 'user', storagePath: '.context-graph',
    semantic: { provider: 'codex-cli', auth: { mode: 'chatgpt' }, model: 'public-fixture',
      reasoningEffort: 'low', promptVersion: 'public-v1', extractorVersion: '1', adapterVersion: '1',
      ontologyVersion: '1', minimumConfidence: 0.7, failOnUnresolved: true, concurrency: 1,
      timeoutMs: 1000, retries: 0, maxDocuments: 8, maxSourceBytes: 65_536 },
    scip: { version: 'fixture', command: 'unavailable-scip', args: [] },
    ontology: { backend: 'opencaesar', toolVersion: 'fixture', containerImage: 'unavailable', projectPath: 'unavailable' },
  };
  const current: ContextGraphConfig = { ...previous, semantic: { ...previous.semantic, timeoutMs: 5000, retries: 1,
    concurrency: 2, maxDocuments: 10, maxSourceBytes: 100_000 } };
  const fromConfigPath = join(root, 'previous.json');
  const configPath = join(root, 'context-graph.config.json');
  await writeFile(fromConfigPath, JSON.stringify(previous));
  await writeFile(configPath, JSON.stringify(current));
  const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0', '--no-optional-locks', ...args], { cwd: root })).stdout.trim();
  const commit = async () => {
    await git('add', '.');
    await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'public adoption fixture');
    return git('rev-parse', 'HEAD');
  };
  await git('init', '--quiet');
  const commitSha = await commit();
  const context: ExtractionContext = { repositoryRoot: root, repositoryId: previous.repositoryId,
    commitSha, ref: 'HEAD', snapshotId: 'old-public-fixture', changedPaths: [], deletedPaths: [], renamedPaths: {} };
  const sources = await new GitRepository(root).semanticSources(context, previous.semanticSources);
  const oldRoot = legacyRoot(root, previous);
  const primary = resolveSemanticStorageRoots(root, current).primary;
  const seed = async (index: number, destination = oldRoot, label = 'Public worker') => {
    const source = sources[index]!;
    const hydrator = new SemanticHydrator(previous.semantic, new SemanticArtifactStore(destination), {
      identity: codexIdentity(previous),
      async extract() {
        const parsed: SemanticOutput = { assertions: [{
          subject: { id: 'capability:queue', kind: 'Capability', label: 'Queue' }, predicate: 'implementedBy',
          object: { id: 'component:worker', kind: 'Component', label },
          citation: { startLine: 3, endLine: 3 }, confidence: 0.95,
        }], oml: '' };
        return { parsed, rawModelOutput: `  ${JSON.stringify(parsed)}\n` };
      },
    });
    const { artifact } = await hydrator.hydrate(source, context);
    expect(artifact.key).toBe(legacyKey(previous, source));
    return artifact;
  };
  return { directory, root, previous, current, configPath, fromConfigPath, commitSha,
    sources, oldRoot, primary, git, commit, seed };
}

describe('explicit semantic cache adoption', () => {
  it('adopts completed artifacts from the exact old profile after operational changes, without model or graph work', async () => {
    const f = await fixture();
    const a = await f.seed(0);
    const oldBytes = await readFile(artifactPath(f.oldRoot, a.key));
    const incomplete = `${artifactPath(f.oldRoot, legacyKey(f.previous, f.sources[1]!))}.interrupted.tmp`;
    await writeFile(incomplete, 'partial output');
    const oldFiles = await filesUnder(f.oldRoot), checkoutFiles = await filesUnder(f.root);
    const provider = vi.spyOn(CodexCliSemanticExtractor.prototype, 'extract').mockRejectedValue(new Error('No model calls allowed'));
    const before = await planHydration(f.configPath);
    expect(before.estimates).toMatchObject({ reusableArtifacts: 0, extractions: 2 });
    const report = await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath });
    expect(report).toMatchObject({ schemaVersion: 1, kind: 'semantic-cache-adoption', ready: true,
      commitSha: f.commitSha, dryRun: false, configurationDigest: sha256(stableJson(f.current)),
      previousConfigurationDigest: sha256(stableJson(f.previous)), counts: { adopted: 1, missing: 1 } });
    expect(report.records.map(record => record.status)).toEqual(['adopted', 'missing']);
    expect(await readFile(artifactPath(f.primary, a.key))).toEqual(oldBytes);
    expect(await new SemanticArtifactStore(f.primary).read(a.key)).toEqual(a);
    expect(await filesUnder(f.oldRoot)).toEqual(oldFiles);
    expect(await filesUnder(f.root)).toEqual(checkoutFiles);
    expect((await planHydration(f.configPath)).estimates).toMatchObject({ reusableArtifacts: 1, extractions: 1 });
    expect((await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath })).counts)
      .toMatchObject({ adopted: 0, reusable: 1, missing: 1 });
    expect(provider).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain(bodyMarker);
    expect(JSON.stringify(report)).not.toContain('Public worker');
    expect(await readFile(incomplete, 'utf8')).toBe('partial output');
  });

  it('keeps dry-run files and Git index byte-identical while identifying adoptable work', async () => {
    const f = await fixture();
    await f.seed(0); await f.seed(1);
    const before = await filesUnder(f.directory);
    const report = await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath, dryRun: true });
    expect(report).toMatchObject({ ready: true, dryRun: true, counts: { planned: 2, adopted: 0 } });
    expect(await filesUnder(f.directory)).toEqual(before);
    await expect(readdir(f.primary)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['model', 'auth', 'namespace', 'unknown-setting', 'module-timeout'] as const)(
    'refuses %s changes before cache reads or writes', async (change) => {
      const f = await fixture(); await f.seed(0);
      let previous: ContextGraphConfig = f.previous, current: ContextGraphConfig = f.current;
      if (change === 'model') current = { ...current, semantic: { ...current.semantic, model: 'other-model' } };
      if (change === 'auth') current = { ...current, semantic: { ...current.semantic, auth: { mode: 'api-key', apiKeyEnv: 'PUBLIC_KEY_ENV' } } };
      if (change === 'namespace') current = { ...current, namespace: 'https://example.test/other/' };
      if (change === 'unknown-setting') current = { ...current, semantic: { ...current.semantic, tenantHint: 'other' } as ContextGraphConfig['semantic'] };
      if (change === 'module-timeout') {
        const { auth: _auth, ...semantic } = previous.semantic;
        previous = { ...previous, semantic: { ...semantic, provider: 'module', providerModule: './absent-provider.mjs', providerIdentity: 'public:1' } };
        current = { ...previous, semantic: { ...previous.semantic, timeoutMs: 5000 } };
      }
      await writeFile(f.fromConfigPath, JSON.stringify(previous));
      await writeFile(f.configPath, JSON.stringify(current));
      const before = await filesUnder(f.directory);
      await expect(adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath })).rejects.toThrow('non-operational');
      expect(await filesUnder(f.directory)).toEqual(before);
    });

  it('refuses configurations resolving to another checkout and never searches sibling profiles', async () => {
    const f = await fixture();
    await f.seed(0);
    const foreignRoot = legacyRoot(`${f.root}-another-checkout`, f.previous);
    const foreign = await f.seed(1, foreignRoot, 'Foreign profile must remain isolated');
    const foreignFiles = await filesUnder(foreignRoot);
    const report = await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath });
    expect(report.counts).toMatchObject({ adopted: 1, missing: 1 });
    expect(await new SemanticArtifactStore(f.primary).read(foreign.key)).toBeUndefined();
    expect(await filesUnder(foreignRoot)).toEqual(foreignFiles);
    await writeFile(f.fromConfigPath, JSON.stringify({ ...f.previous, repositoryRoot: '../different-checkout' }));
    const before = await filesUnder(f.directory);
    await expect(adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath })).rejects.toThrow('same checkout');
    expect(await filesUnder(f.directory)).toEqual(before);
  });

  it('uses the requested committed ref and does not adopt an artifact for changed content', async () => {
    const f = await fixture(); const old = await f.seed(0);
    await writeFile(join(f.root, 'docs/a.md'), 'semantic-id: public-a\n# Changed source\nA changed public requirement.\n');
    const changedSha = await f.commit();
    const changed = await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath });
    expect(changed).toMatchObject({ commitSha: changedSha, counts: { adopted: 0, missing: 2 } });
    const historical = await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath, ref: f.commitSha });
    expect(historical).toMatchObject({ commitSha: f.commitSha, counts: { adopted: 1, missing: 1 } });
    expect((await new SemanticArtifactStore(f.primary).read(old.key))?.source.commitSha).toBe(f.commitSha);
    expect(await readFile(join(f.root, 'docs/a.md'), 'utf8')).toContain('A changed public requirement.');
  });

  it('adopts the requested agent owner scope within its budget instead of selecting every configured document', async () => {
    const f = await fixture();
    const agentContext = { alwaysSemanticSources: [], followDocumentReferences: false,
      includeMatchingEvidence: false, maxReferencedDocuments: 1 };
    const previous = { ...f.previous, agentContext, semantic: { ...f.previous.semantic, maxDocuments: 1 } };
    const current = { ...f.current, agentContext, semantic: { ...f.current.semantic, maxDocuments: 1 } };
    await writeFile(f.fromConfigPath, JSON.stringify(previous));
    await writeFile(f.configPath, JSON.stringify(current));
    const artifact = await f.seed(0, legacyRoot(f.root, previous));
    const request = { ownerDocument: 'docs/a.md' };
    const report = await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath, request });
    expect(report).toMatchObject({ ready: true, commitSha: f.commitSha,
      scope: { mode: 'agent', selectors: ['docs/a.md'], omittedDocuments: [], ignoredSearchTerms: 0 },
      budgets: { maxDocuments: 1, selectedDocuments: 1 }, counts: { adopted: 1, missing: 0 } });
    expect(report.records.map(record => record.path)).toEqual(['docs/a.md']);
    const primary = resolveSemanticStorageRoots(f.root, current).primary;
    expect(await new SemanticArtifactStore(primary).read(artifact.key)).toEqual(artifact);
    const plan = await planHydration(f.configPath, { request });
    expect(report.scope).toMatchObject({ selectors: plan.scope.selectors,
      digest: plan.scope.digest, headName: plan.scope.headName });
    expect(plan.estimates).toMatchObject({ reusableArtifacts: 1, extractions: 0 });
  });

  it('pins agent references to the requested historical commit and exposes omitted documents without dry-run writes', async () => {
    const f = await fixture();
    const agentContext = { alwaysSemanticSources: [], followDocumentReferences: true,
      includeMatchingEvidence: false, maxReferencedDocuments: 1 };
    await writeFile(f.fromConfigPath, JSON.stringify({ ...f.previous, agentContext }));
    await writeFile(f.configPath, JSON.stringify({ ...f.current, agentContext }));
    await writeFile(join(f.root, 'docs/a.md'),
      `semantic-id: public-a\n# Public owner\nSee docs/b.md and docs/c.md.\n`);
    await writeFile(join(f.root, 'docs/c.md'), 'semantic-id: public-c\n# Public omitted reference\nRecorded requirement.\n');
    const oldSha = await f.commit();
    await writeFile(join(f.root, 'docs/a.md'), 'semantic-id: public-a\n# Public owner\nNo linked references remain.\n');
    const headSha = await f.commit();
    const before = await filesUnder(f.directory);
    const request = { ownerDocument: 'docs/a.md' };
    const report = await adoptSemanticCache(f.configPath, {
      fromConfigPath: f.fromConfigPath, ref: oldSha, dryRun: true, request,
    });
    expect(report).toMatchObject({ ready: false, commitSha: oldSha, dryRun: true,
      scope: { mode: 'agent', selectors: ['docs/a.md', 'docs/b.md'], omittedDocuments: ['docs/c.md'] },
      budgets: { selectedDocuments: 2 }, counts: { missing: 2, adopted: 0 } });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'selection-limited', severity: 'warning', paths: ['docs/c.md'] }),
    ]));
    const current = await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath, dryRun: true, request });
    expect(current).toMatchObject({ ready: true, commitSha: headSha,
      scope: { selectors: ['docs/a.md'], omittedDocuments: [] }, budgets: { selectedDocuments: 1 } });
    expect(await filesUnder(f.directory)).toEqual(before);
  });

  it.each(['budget', 'duplicate-id'] as const)('blocks all writes for %s errors', async (failure) => {
    const f = await fixture(); await f.seed(0); await f.seed(1);
    if (failure === 'budget') await writeFile(f.configPath, JSON.stringify({ ...f.current,
      semantic: { ...f.current.semantic, maxDocuments: 1 } }));
    else {
      await writeFile(join(f.root, 'docs/b.md'), `semantic-id: public-a\n# Duplicate identity\n${bodyMarker}\n`);
      await f.commit();
    }
    const before = await filesUnder(f.directory);
    const report = await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath });
    expect(report).toMatchObject({ ready: false, records: [], counts: { adopted: 0 } });
    expect(report.issues.some(issue => issue.code === (failure === 'budget' ? 'document-budget' : 'duplicate-semantic-id'))).toBe(true);
    expect(await filesUnder(f.directory)).toEqual(before);
  });

  it.each(['old-json', 'old-digest', 'old-unavailable', 'current-json', 'conflict'] as const)(
    'preserves evidence when encountering %s', async (failure) => {
      const f = await fixture(); const artifact = await f.seed(0);
      const oldPath = artifactPath(f.oldRoot, artifact.key), currentPath = artifactPath(f.primary, artifact.key);
      if (failure === 'old-json') await writeFile(oldPath, '{invalid json');
      if (failure === 'old-digest') await writeFile(oldPath, JSON.stringify({ ...artifact, outputDigest: 'invalid' }));
      if (failure === 'old-unavailable') { await rm(oldPath); await mkdir(oldPath); }
      if (failure === 'current-json') {
        await mkdir(join(f.primary, 'artifacts', 'semantic'), { recursive: true });
        await writeFile(currentPath, '{invalid current');
        await rm(oldPath); // A missing legacy key must not mask a corrupted current artifact.
      }
      if (failure === 'conflict') await f.seed(0, f.primary, 'Another valid extraction');
      const before = await filesUnder(f.directory);
      const report = await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath });
      const status = failure === 'old-unavailable' ? 'unavailable' : failure === 'conflict' ? 'conflict' : 'corrupt';
      expect(report).toMatchObject({ ready: false, counts: { adopted: 0, [status]: 1 } });
      expect(report.records[0]?.status).toBe(status);
      expect(await filesUnder(f.directory)).toEqual(before);
    });

  it('reports a concurrent different immutable winner and does not overwrite either artifact', async () => {
    const f = await fixture(); const old = await f.seed(0);
    const competing = await f.seed(0, join(f.directory, 'candidate-store'), 'Concurrent valid extraction');
    const originalWrite = SemanticArtifactStore.prototype.write;
    vi.spyOn(SemanticArtifactStore.prototype, 'write').mockImplementationOnce(async function (this: SemanticArtifactStore, artifact: SemanticArtifact) {
      await originalWrite.call(new SemanticArtifactStore(f.primary), competing);
      await originalWrite.call(this, artifact);
    });
    const report = await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath });
    expect(report).toMatchObject({ ready: false, counts: { conflict: 1, adopted: 0 } });
    expect(await new SemanticArtifactStore(f.primary).read(old.key)).toEqual(competing);
    expect(await new SemanticArtifactStore(f.oldRoot).read(old.key)).toEqual(old);
    expect((await readdir(join(f.primary, 'artifacts', 'semantic'))).some(name => name.endsWith('.tmp'))).toBe(false);
  });

  it('propagates unrelated storage publication failures while preserving previous evidence', async () => {
    const f = await fixture(); await f.seed(0);
    const before = await filesUnder(f.directory);
    vi.spyOn(SemanticArtifactStore.prototype, 'write').mockRejectedValueOnce(Object.assign(new Error('fixture storage failure'), { code: 'EACCES' }));
    await expect(adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath })).rejects.toThrow('storage publication failed');
    expect(await filesUnder(f.directory)).toEqual(before);
  });

  it('revalidates a concurrent winner even when its output digest matches the requested artifact', async () => {
    const f = await fixture(); const old = await f.seed(0);
    const corrupt = { ...old, sourceDigest: 'corrupted-concurrent-metadata' };
    const originalWrite = SemanticArtifactStore.prototype.write;
    vi.spyOn(SemanticArtifactStore.prototype, 'write').mockImplementationOnce(async function (this: SemanticArtifactStore, artifact: SemanticArtifact) {
      await originalWrite.call(new SemanticArtifactStore(f.primary), corrupt);
      await originalWrite.call(this, artifact);
    });
    const report = await adoptSemanticCache(f.configPath, { fromConfigPath: f.fromConfigPath });
    expect(report).toMatchObject({ ready: false, counts: { corrupt: 1, adopted: 0 } });
    expect(await new SemanticArtifactStore(f.primary).read(old.key)).toEqual(corrupt);
    expect(await new SemanticArtifactStore(f.oldRoot).read(old.key)).toEqual(old);
  });
});
