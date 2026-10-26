import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExtractionContext, SemanticArtifact, SemanticSource } from '@weftlet/core';
import { ContextGraphHydrator } from '../src/application/hydrator.js';
import { SemanticHydrationError } from '../src/application/hydration-failure.js';
import type { ContextGraphConfig } from '../src/configuration/config.js';
import { DirectRdfOntologyCompiler } from '../src/extraction/ontology.js';
import { semanticSourceId } from '../src/extraction/semantic-diagnostics.js';
import { semanticProviderIdentity } from '../src/extraction/semantic-identity.js';
import { CodexCliSemanticExtractor, SemanticHydrator, SemanticProviderError, type SemanticExtractor } from '../src/extraction/semantic.js';
import { RepositoryFileExtractor } from '../src/extraction/static.js';
import { GitRepository } from '../src/repository/git.js';
import { FileSnapshotStore, SemanticArtifactStore } from '../src/storage/storage.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';

const execute = promisify(execFile);
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((root) => rm(root,
    { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

async function fixture(names = ['a', 'b', 'c']) {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-failure-report-'));
  temporary.push(root);
  await Promise.all(['docs', 'src'].map((path) => mkdir(join(root, path))));
  await writeFile(join(root, '.gitignore'), '.context-graph/\n');
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(root, 'src/worker.ts'), 'export const dispatch = () => true;\n');
  for (const name of names) await writeFile(join(root, `docs/${name}.md`),
    `semantic-id: public-${name}\n# Public queue ${name}\nThe worker implements the queue.\n`);
  const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0', '--no-optional-locks', ...args], { cwd: root })).stdout.trim();
  await git('init', '--quiet');
  await git('add', '.');
  await git('-c', 'user.name=Public Failure Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'public failure fixture');
  const commitSha = await git('rev-parse', 'HEAD');
  const config: ContextGraphConfig = {
    schemaVersion: 1, repositoryId: 'public/failure-report', namespace: 'https://example.test/failures/',
    semanticSources: ['docs'], codeRoots: ['src'], contractPatterns: [], evidenceRoots: [],
    storageScope: 'workspace', storagePath: '.context-graph',
    semantic: { provider: 'codex-cli', model: 'fixture', reasoningEffort: 'low', promptVersion: 'v1',
      extractorVersion: '1', adapterVersion: '1', ontologyVersion: '1', minimumConfidence: 0.7,
      failOnUnresolved: true, concurrency: 1, timeoutMs: 25, retries: 0, maxDocuments: 8 },
    scip: { version: '0.4.0', command: 'fixture-indexer', args: [] },
    ontology: { backend: 'rdf', toolVersion: 'rdf-record-v1' }, runtimeEvidence: [],
  };
  const repository = new GitRepository(root);
  const storageRoot = join(root, '.context-graph');
  const context: ExtractionContext = { repositoryRoot: root, repositoryId: config.repositoryId,
    ref: commitSha, commitSha, snapshotId: 'public-fixture', changedPaths: [], deletedPaths: [], renamedPaths: {} };
  const sources = await repository.semanticSources(context, config.semanticSources);
  return { root, storageRoot, repository, config, context, sources, git };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const valid = (source: SemanticSource) => ({ parsed: { assertions: [{
  subject: { id: `capability:${source.stableSemanticId}`, kind: 'Capability' as const, label: 'Public queue' },
  predicate: 'implementedBy' as const,
  object: { id: 'component:file:src/worker.ts', kind: 'Component' as const, label: 'Public worker' },
  confidence: 0.95, citation: { startLine: 3, endLine: 3 },
}], oml: '', diagnostics: [] }, rawModelOutput: 'Public deterministic fixture output' });

function application(f: Fixture, extract: SemanticExtractor['extract'], options: {
  config?: ContextGraphConfig; store?: SemanticArtifactStore;
} = {}) {
  const config = options.config ?? f.config;
  const store = options.store ?? new SemanticArtifactStore(f.storageRoot);
  const semantic = new SemanticHydrator(config.semantic, store,
    { identity: semanticProviderIdentity(config.semantic), extract });
  const snapshots = new FileSnapshotStore(f.storageRoot);
  const hydrator = new ContextGraphHydrator({ config, repository: f.repository, snapshotStore: snapshots,
    semanticHydrator: semantic,
    staticIndexer: { async index() { return { path: 'public.scip', version: '0.4.0', digest: 'public-index', mode: 'full' }; } },
    ontologyCompiler: new DirectRdfOntologyCompiler(f.storageRoot),
    runtimeEvidenceProvider: { async collect() { return []; } },
    extractorFactory: () => [new RepositoryFileExtractor(f.repository, config.codeRoots, 'public-index')],
    invariantEvaluators: [],
  });
  return { hydrator, semantic, store, snapshots };
}
const run = { ref: 'HEAD', headName: 'default' };
async function failure(pending: Promise<unknown>) {
  const error = await pending.then(() => { throw Error('Expected hydration failure'); }, (error: unknown) => error);
  expect(error).toBeInstanceOf(SemanticHydrationError);
  return error as SemanticHydrationError;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}
const artifactFiles = (f: Fixture) => readdir(join(f.storageRoot, 'artifacts/semantic'));

describe('semantic failure reports', () => {
  it('retains completed extractions and the previous snapshot, then resumes with cache reuse', async () => {
    const f = await fixture();
    const calls: string[] = [], progress: unknown[] = [];
    const app = application(f, async (source) => {
      calls.push(source.path);
      if (source.path === 'docs/b.md') throw new SemanticProviderError('timeout', 'PRIVATE PROVIDER OUTPUT');
      return valid(source);
    });
    const baseline = await app.hydrator.hydrate({ ...run, semanticSources: [] });
    const error = await failure(app.hydrator.hydrate({ ...run, onProgress: (event) => progress.push(event) }));
    expect(error.report).toMatchObject({ schemaVersion: 1, kind: 'semantic-hydration-failure', code: 'timeout',
      category: 'timeout', phase: 'semantic-extract', sourceId: semanticSourceId(f.config.repositoryId, f.sources[1]!),
      commitSha: f.context.commitSha, configurationDigest: sha256(stableJson(f.config)), timeoutMs: 25,
      timeoutScope: 'provider-attempt', forced: false,
      progress: { total: 3, completed: 1, extracted: 1, reused: 0, failed: 1, cancelled: 0, notStarted: 1, remaining: 2 } });
    expect(error.report.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(error.report.recovery.join(' ')).toContain('hydrate --plan');
    expect(`${error.message}${JSON.stringify(error)}${JSON.stringify(progress)}`).not.toMatch(/PRIVATE|docs\/[abc]\.md/);
    expect(calls).toEqual(['docs/a.md', 'docs/b.md']);
    expect(await app.snapshots.readHead('default')).toEqual(baseline.snapshot);
    const [name] = await artifactFiles(f);
    expect(await artifactFiles(f)).toHaveLength(1);
    const retained = await readFile(join(f.storageRoot, 'artifacts/semantic', name!));
    const retried: string[] = [];
    const retry = application(f, async (source) => { retried.push(source.path); return valid(source); },
      { config: { ...f.config, semantic: { ...f.config.semantic, timeoutMs: 250 } } });
    const result = await retry.hydrator.hydrate(run);
    expect(result).toMatchObject({ semanticExtracted: 2, semanticReused: 1 });
    expect(retried).toEqual(['docs/b.md', 'docs/c.md']);
    expect(await readFile(join(f.storageRoot, 'artifacts/semantic', name!))).toEqual(retained);
    expect(await retry.snapshots.readHead('default')).toEqual(result.snapshot);
  });

  it('keeps the primary timeout through sibling cancellation and counts an in-flight durable write', async () => {
    const f = await fixture(['a', 'b', 'c', 'd']);
    const writing = deferred(), releaseWrite = deferred(), siblingStarted = deferred();
    class DelayedStore extends SemanticArtifactStore {
      override async write(artifact: SemanticArtifact) {
        if (artifact.source.path === 'docs/a.md') { writing.resolve(); await releaseWrite.promise; }
        return super.write(artifact);
      }
    }
    const calls: string[] = [];
    const app = application(f, async (source, _context, options) => {
      calls.push(source.path);
      if (source.path === 'docs/b.md') {
        await Promise.all([writing.promise, siblingStarted.promise]);
        throw new SemanticProviderError('timeout', 'PRIVATE PRIMARY');
      }
      if (source.path === 'docs/c.md') return new Promise((_, reject) => {
        options!.signal!.addEventListener('abort', () => {
          releaseWrite.resolve();
          reject(new SemanticProviderError('cancelled', 'PRIVATE SIBLING'));
        }, { once: true });
        siblingStarted.resolve();
      });
      return valid(source);
    }, { config: { ...f.config, semantic: { ...f.config.semantic, concurrency: 3 } },
      store: new DelayedStore(f.storageRoot) });
    const baseline = await app.hydrator.hydrate({ ...run, semanticSources: [] });
    const error = await failure(app.hydrator.hydrate(run));
    expect(error.report).toMatchObject({ code: 'timeout', sourceId: semanticSourceId(f.config.repositoryId, f.sources[1]!),
      progress: { total: 4, completed: 1, extracted: 1, reused: 0, failed: 1, cancelled: 1, notStarted: 1, remaining: 3 } });
    expect(calls.sort()).toEqual(['docs/a.md', 'docs/b.md', 'docs/c.md']);
    expect(await artifactFiles(f)).toHaveLength(1);
    expect(await app.snapshots.readHead('default')).toEqual(baseline.snapshot);
    expect(JSON.stringify(error)).not.toContain('PRIVATE');
  });

  it('reports explicit user cancellation without retaining a private abort reason', async () => {
    const f = await fixture();
    const controller = new AbortController();
    const app = application(f, async (source, _context, options) => {
      if (source.path === 'docs/b.md') {
        controller.abort(new Error('PRIVATE ABORT REASON'));
        throw options!.signal!.reason;
      }
      return valid(source);
    });
    const baseline = await app.hydrator.hydrate({ ...run, semanticSources: [] });
    const error = await failure(app.hydrator.hydrate({ ...run, signal: controller.signal }));
    expect(error.report).toMatchObject({ code: 'cancelled', category: 'cancellation',
      progress: { total: 3, completed: 1, extracted: 1, reused: 0, failed: 0, cancelled: 1, notStarted: 1, remaining: 2 } });
    expect(`${error.message}${JSON.stringify(error)}`).not.toContain('PRIVATE');
    expect(error.cause).toBeUndefined();
    expect(await app.snapshots.readHead('default')).toEqual(baseline.snapshot);
    expect(await artifactFiles(f)).toHaveLength(1);
  });

  it('distinguishes a concurrent storage failure from cancellation after the primary timeout', async () => {
    const f = await fixture(['a', 'b']);
    const writing = deferred(), failWrite = deferred();
    class FailingConcurrentStore extends SemanticArtifactStore {
      override async write(): Promise<void> {
        writing.resolve();
        await failWrite.promise;
        throw Error('PRIVATE real storage failure');
      }
    }
    const app = application(f, async (source, _context, options) => {
      if (source.path === 'docs/b.md') {
        options!.signal!.addEventListener('abort', failWrite.resolve, { once: true });
        await writing.promise;
        throw new SemanticProviderError('timeout', 'deadline');
      }
      return valid(source);
    }, { config: { ...f.config, semantic: { ...f.config.semantic, concurrency: 2 } },
      store: new FailingConcurrentStore(f.storageRoot) });
    const error = await failure(app.hydrator.hydrate(run));
    expect(error.report).toMatchObject({ code: 'timeout', progress: {
      total: 2, completed: 0, failed: 2, cancelled: 0, notStarted: 0, remaining: 2,
    } });
    expect(`${error.message}${JSON.stringify(error)}`).not.toContain('PRIVATE');
  });

  it('reports cancellation between sources without blaming a successfully retained source', async () => {
    const f = await fixture();
    const controller = new AbortController(), calls: string[] = [];
    const app = application(f, async (source) => { calls.push(source.path); return valid(source); });
    const baseline = await app.hydrator.hydrate({ ...run, semanticSources: [] });
    const error = await failure(app.hydrator.hydrate({ ...run, signal: controller.signal,
      onProgress: (event) => {
        if (event.phase === 'semantic-extracted') controller.abort(new Error('PRIVATE completion callback reason'));
      } }));
    expect(error.report).toMatchObject({ code: 'cancelled', category: 'cancellation', phase: 'semantic-scheduling',
      elapsedScope: 'semantic-run', progress: {
        total: 3, completed: 1, extracted: 1, reused: 0, failed: 0, cancelled: 0, notStarted: 2, remaining: 2,
      } });
    expect(error.report.sourceId).toBeUndefined();
    expect(calls).toEqual(['docs/a.md']);
    expect(await artifactFiles(f)).toHaveLength(1);
    expect(await app.snapshots.readHead('default')).toEqual(baseline.snapshot);
    expect(`${error.message}${JSON.stringify(error)}`).not.toContain('PRIVATE');
  });

  it('rejects a provider result returned after sibling cancellation instead of publishing it', async () => {
    const f = await fixture();
    const siblingStarted = deferred();
    const calls: string[] = [];
    const app = application(f, async (source, _context, options) => {
      calls.push(source.path);
      if (source.path === 'docs/a.md') {
        await siblingStarted.promise;
        throw new SemanticProviderError('timeout', 'deadline');
      }
      return new Promise((resolve) => {
        options!.signal!.addEventListener('abort', () => resolve(valid(source)), { once: true });
        siblingStarted.resolve();
      });
    }, { config: { ...f.config, semantic: { ...f.config.semantic, concurrency: 2 } } });
    const error = await failure(app.hydrator.hydrate(run));
    expect(error.report).toMatchObject({ code: 'timeout', progress: {
      total: 3, completed: 0, failed: 1, cancelled: 1, notStarted: 1, remaining: 3,
    } });
    expect(calls.sort()).toEqual(['docs/a.md', 'docs/b.md']);
    await expect(artifactFiles(f)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    ['unavailable', 'infrastructure'], ['exit', 'provider'], ['invalid-output', 'extraction-gap'],
  ] as const)('distinguishes %s without forwarding the provider message', async (code, category) => {
    const f = await fixture(['a']);
    const app = application(f, async () => { throw new SemanticProviderError(code, 'PRIVATE KEY AND PROMPT'); });
    const error = await failure(app.hydrator.hydrate(run));
    expect(error.report).toMatchObject({ code, category, phase: 'semantic-extract',
      progress: { total: 1, completed: 0, failed: 1, remaining: 1, notStarted: 0 } });
    expect(`${error.message}${JSON.stringify(error)}`).not.toContain('PRIVATE');
    expect(await app.snapshots.readHead('default')).toBeUndefined();
  });

  it('sanitizes unknown provider exceptions and keeps the module timeout interpretation explicit', async () => {
    const f = await fixture(['a']);
    const config = { ...f.config, semantic: { ...f.config.semantic, provider: 'module' as const,
      providerModule: './private-provider.mjs', providerIdentity: 'public-module:1' } };
    const app = application(f, async () => { throw Error('PRIVATE source text, stderr and credential'); }, { config });
    const error = await failure(app.hydrator.hydrate(run));
    expect(error.report).toMatchObject({ code: 'provider-failure', category: 'provider', timeoutScope: 'module-execution' });
    expect(`${error.message}${JSON.stringify(error)}`).not.toMatch(/PRIVATE|private-provider/);
    expect(error.cause).toBeUndefined();
  });

  it('does not copy an unrecognized provider error code into public diagnostics', async () => {
    const f = await fixture(['a']);
    const invalid = Object.assign(new SemanticProviderError('timeout', 'PRIVATE message'), { code: 'PRIVATE_CODE' });
    const error = await failure(application(f, async () => { throw invalid; }).hydrator.hydrate(run));
    expect(error.report).toMatchObject({ code: 'provider-failure', category: 'provider' });
    expect(`${error.message}${JSON.stringify(error)}`).not.toContain('PRIVATE');
  });

  it('reports source elapsed time across Codex retries separately from the per-attempt limit', async () => {
    const f = await fixture(['a']);
    const config = { ...f.config, semantic: { ...f.config.semantic, retries: 1 } };
    let attempts = 0;
    const extractor = new CodexCliSemanticExtractor(config.semantic, { async run() {
      await delay(25);
      if (++attempts === 1) throw new SemanticProviderError('exit', 'PRIVATE TRANSIENT', true);
      throw new SemanticProviderError('timeout', 'PRIVATE DEADLINE');
    } }, async () => 'chatgpt');
    const app = application(f, extractor.extract.bind(extractor), { config });
    const error = await failure(app.hydrator.hydrate(run));
    expect(attempts).toBe(2);
    expect(error.report).toMatchObject({ code: 'timeout', timeoutMs: 25, timeoutScope: 'provider-attempt' });
    expect(error.report.elapsedMs).toBeGreaterThanOrEqual(40);
    expect(`${error.message}${JSON.stringify(error)}`).not.toContain('PRIVATE');
  });

  it('attributes malformed extracted assertions to validation and publishes no artifact', async () => {
    const f = await fixture(['a']);
    const app = application(f, async (source) => {
      const output = valid(source);
      return { ...output, parsed: { ...output.parsed, assertions: output.parsed.assertions.map((assertion) =>
        ({ ...assertion, citation: { startLine: 99, endLine: 99 } })) } };
    });
    const error = await failure(app.hydrator.hydrate(run));
    expect(error.report).toMatchObject({ code: 'invalid-output', category: 'extraction-gap', phase: 'semantic-validate',
      progress: { completed: 0, extracted: 0, failed: 1 } });
    expect(error.message).not.toContain('docs/a.md');
    await expect(artifactFiles(f)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['low-confidence', 'unresolved'] as const)('retains the %s policy gate with safe diagnostics', async (code) => {
    const f = await fixture(['a']);
    const app = application(f, async (source) => {
      const output = valid(source);
      return { ...output, parsed: { ...output.parsed,
        assertions: output.parsed.assertions.map((assertion) =>
          ({ ...assertion, confidence: code === 'low-confidence' ? 0.1 : assertion.confidence })),
        unresolvedMappings: code === 'unresolved' ? ['PRIVATE business policy rationale'] : [],
      } };
    });
    const error = await failure(app.hydrator.hydrate(run));
    expect(error.report).toMatchObject({ code, category: 'extraction-gap', phase: 'semantic-validate',
      progress: { completed: 0, extracted: 0, failed: 1 } });
    expect(`${error.message}${JSON.stringify(error)}`).not.toMatch(/PRIVATE|docs\/a\.md/);
    expect(error.cause).toBeUndefined();
    await expect(artifactFiles(f)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await app.snapshots.readHead('default')).toBeUndefined();
  });

  it('counts cache hits separately from newly completed extractions', async () => {
    const f = await fixture();
    const app = application(f, async (source) => {
      if (source.path === 'docs/c.md') throw new SemanticProviderError('timeout', 'deadline');
      return valid(source);
    });
    await app.semantic.hydrate(f.sources[0]!, f.context);
    const error = await failure(app.hydrator.hydrate(run));
    expect(error.report.progress).toEqual({ total: 3, completed: 2, extracted: 1, reused: 1,
      failed: 1, cancelled: 0, notStarted: 0, remaining: 1 });
    expect(await artifactFiles(f)).toHaveLength(2);
  });

  it('reports cache corruption before any provider call and preserves the offending bytes', async () => {
    const f = await fixture(['a']);
    let calls = 0;
    const app = application(f, async (source) => { calls++; return valid(source); });
    const { artifact } = await app.semantic.hydrate(f.sources[0]!, f.context);
    const path = join(f.storageRoot, 'artifacts/semantic', `${artifact.key}.json`);
    const corrupt = '{ PRIVATE INVALID CACHE';
    await writeFile(path, corrupt);
    const error = await failure(app.hydrator.hydrate(run));
    expect(error.report).toMatchObject({ code: 'cache-failure', category: 'infrastructure', phase: 'semantic-cache-read',
      progress: { completed: 0, extracted: 0, reused: 0, failed: 1 } });
    expect(calls).toBe(1);
    expect(await readFile(path, 'utf8')).toBe(corrupt);
    expect(`${error.message}${JSON.stringify(error)}`).not.toContain('PRIVATE');
  });

  it('does not count an artifact whose storage publication failed as completed', async () => {
    const f = await fixture(['a']);
    class FailingStore extends SemanticArtifactStore {
      override async write(): Promise<void> { throw Error('PRIVATE permission failure and absolute path'); }
    }
    const app = application(f, async (source) => valid(source), { store: new FailingStore(f.storageRoot) });
    const error = await failure(app.hydrator.hydrate(run));
    expect(error.report).toMatchObject({ code: 'cache-failure', category: 'infrastructure', phase: 'semantic-cache-write',
      progress: { total: 1, completed: 0, extracted: 0, reused: 0, failed: 1, remaining: 1 } });
    expect(`${error.message}${JSON.stringify(error)}`).not.toContain('PRIVATE');
    expect(await app.snapshots.readHead('default')).toBeUndefined();
  });

  it('labels forced revisions and does not promise that ordinary retries can reuse their artifacts', async () => {
    const f = await fixture(['a', 'b']);
    const app = application(f, async (source) => {
      if (source.path === 'docs/b.md') throw new SemanticProviderError('timeout', 'deadline');
      return valid(source);
    });
    const error = await failure(app.hydrator.hydrate({ ...run, forceSemantic: true }));
    expect(error.report.forced).toBe(true);
    expect(error.report.recovery.join(' ')).toMatch(/forc/i);
    const retained = await artifactFiles(f);
    expect(retained).toHaveLength(1);
    const retry = application(f, async (source) => valid(source));
    expect(await retry.hydrator.hydrate(run)).toMatchObject({ semanticExtracted: 2, semanticReused: 0 });
    expect(await artifactFiles(f)).toHaveLength(3);
    expect(await artifactFiles(f)).toEqual(expect.arrayContaining(retained));
  });

  it('uses stable repository-scoped opaque IDs without binding them to source bytes or paths', () => {
    const source = { stableSemanticId: 'private-concept-name', path: 'docs/private.md', digest: 'before' };
    const id = semanticSourceId('public/repo', source);
    expect(id).toMatch(/^source-[a-f0-9]{64}$/);
    expect(id).toBe(semanticSourceId('public/repo', { ...source, path: 'docs/renamed.md', digest: 'after' }));
    expect(id).not.toBe(semanticSourceId('public/another', source));
    expect(id).not.toBe(semanticSourceId('public/repo', { stableSemanticId: 'another-concept' }));
    expect(id).not.toContain('private');
  });
});
