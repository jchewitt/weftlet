import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repositoryFileNode, type GraphFact, type GraphSnapshot } from '@weftlet/core';
import { ContextGraphHydrator, type HydrationProgressEvent } from '../src/application/hydrator.js';
import type { ContextGraphConfig } from '../src/configuration/config.js';
import { SemanticHydrator } from '../src/extraction/semantic.js';
import { RepositoryContractExtractor, RepositoryFileExtractor } from '../src/extraction/static.js';
import { GraphIdentityConflictError } from '../src/graph/identity-preflight.js';
import { RdfEvidenceGraph } from '../src/graph/rdf.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';
import { GitRepository } from '../src/repository/git.js';
import { FileSnapshotStore, SemanticArtifactStore } from '../src/storage/storage.js';

const execute = promisify(execFile);
const temporaryRoots: string[] = [];
const specPath = 'src/job.spec.ts';
const privateExtractor = 'adapter:PRIVATE_EXTRACTOR_SENTINEL';

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(initialMode: 'kind' | 'confidence') {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-preflight-integration-'));
  temporaryRoots.push(root);
  await Promise.all(['src', 'prisma', 'docs'].map(path => mkdir(join(root, path))));
  const files = {
    '.gitattributes': '* text eol=lf\n',
    '.gitignore': '.context-graph/\n',
    'prisma/schema.prisma': 'model Job {\n  id String @id\n}\n',
    'src/job.ts': "import { PrismaClient } from '@prisma/client';\nexport const jobs = () => new PrismaClient().job.findMany();\n",
    [specPath]: "import { PrismaClient } from '@prisma/client';\nexport const check = () => new PrismaClient().job.findMany();\n",
    'docs/owner.md': '# Public owner\nsemantic-id: public-job-owner\nJobs require review.\n[Spec](../src/job.spec.ts)\n',
  };
  await Promise.all(Object.entries(files).map(([path, text]) => writeFile(join(root, path), text)));
  const git = (...args: string[]) => execute('git', args, { cwd: root, windowsHide: true });
  await git('init', '--quiet'); await git('add', '.');
  await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public preflight fixture');
  const repository = new GitRepository(root);
  const commitSha = await repository.resolveRef('HEAD');
  const storageRoot = join(root, '.context-graph');
  const config: ContextGraphConfig = {
    schemaVersion: 1, repositoryId: 'public/identity-preflight', namespace: 'https://example.test/preflight/',
    semanticSources: ['docs'], approvedIntentSources: ['docs/owner.md'], codeRoots: ['src', 'prisma'],
    contractPatterns: ['prisma/**/*.prisma'], contractConsumerRoots: ['src'],
    contractAliases: { 'prisma/schema.prisma': ['@prisma/client'] }, evidenceRoots: [], runtimeEvidence: [],
    semantic: { provider: 'module', providerIdentity: 'public-preflight:1', model: 'deterministic-fixture',
      reasoningEffort: 'none', promptVersion: '1', extractorVersion: '1', adapterVersion: '1',
      ontologyVersion: '1', minimumConfidence: 0.7, failOnUnresolved: true, concurrency: 1 },
    scip: { version: 'fixture-index', command: 'unused', args: [] },
    ontology: { backend: 'rdf', toolVersion: 'fixture-compiler' }, storagePath: '.context-graph',
  };
  const store = new FileSnapshotStore(storageRoot);
  const prior: GraphSnapshot = {
    manifest: { schemaVersion: 1, repositoryId: config.repositoryId, commitSha, ref: 'HEAD',
      snapshotId: 'prior', ontologyVersion: '1', extractorVersions: {}, semanticModel: 'none',
      semanticPromptVersion: '1', generatedAt: '2026-01-01T00:00:00Z', contentDigest: sha256('prior'),
      semanticArtifactKeys: [], scipIndexDigest: 'prior-index', rdfDigest: 'prior-rdf' },
    facts: [], invariants: [], runtimeEvidence: [], unresolved: [],
  };
  await store.write(prior); await store.updateHead('default', 'prior');
  const snapshotPath = join(storageRoot, 'snapshots/prior.json');
  const headPath = join(storageRoot, 'heads/default.json');
  const priorBytes = await readFile(snapshotPath);
  const headBytes = await readFile(headPath);
  const assertPreserved = async () => {
    expect(await readFile(snapshotPath)).toEqual(priorBytes);
    expect(await readFile(headPath)).toEqual(headBytes);
    expect(await readdir(join(storageRoot, 'snapshots'))).toEqual(['prior.json']);
  };
  const artifacts = async () => {
    const directory = join(storageRoot, 'artifacts/semantic');
    const names = (await readdir(directory)).sort();
    return Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(join(directory, name))])));
  };
  let mode: 'kind' | 'confidence' | 'correct' = initialMode;
  let providerCalls = 0;
  const semanticHydrator = new SemanticHydrator(config.semantic, new SemanticArtifactStore(storageRoot), {
    identity: 'public-preflight:1',
    async extract() {
      providerCalls++;
      return { parsed: { assertions: [{
        subject: { id: 'capability:jobs', kind: 'Capability', label: 'Jobs' }, predicate: 'governedBy',
        object: { id: 'contract:review', kind: 'Contract', label: 'Review' },
        citation: { startLine: 3, endLine: 3 }, confidence: 0.95,
      }], oml: '', diagnostics: [] }, rawModelOutput: '{}' };
    },
  });
  const compile = vi.fn(async () => ({ root: 'fixture-rdf', rdfFiles: [], digest: 'fixture-rdf' }));
  const evaluate = vi.fn(async () => []);
  const produced: GraphFact[] = [];
  let producedBytes = '';
  const hydrator = new ContextGraphHydrator({
    config, repository, snapshotStore: store, semanticHydrator,
    // Deliberately stub only indexing: this test proves real committed file/contract composition
    // and scheduling. Real SCIP composition is covered by physical-file-kinds.test.ts.
    staticIndexer: { index: async () => ({ path: 'fixture.scip', digest: 'fixture-index', mode: 'full', version: 'fixture-index' }) },
    ontologyCompiler: { compile }, runtimeEvidenceProvider: { collect: async () => [] },
    invariantEvaluators: [{ evaluate }],
    extractorFactory: scip => [{
      identity: { id: 'public-preflight-composition', version: '1' },
      async extract(context) {
        const actual = [...await new RepositoryFileExtractor(repository, config.codeRoots, scip.digest).extract(context),
          ...await new RepositoryContractExtractor(repository, config.contractPatterns, config.contractConsumerRoots!,
            config.contractAliases).extract(context)];
        const adapter: GraphFact = {
          id: 'public-adapter-fact', subject: { ...repositoryFileNode(specPath),
            kind: mode === 'kind' ? 'Component' : 'Evidence', label: 'PRIVATE_LABEL_SENTINEL' },
          predicate: 'consumes', object: { id: 'contract:adapter', kind: 'Contract', label: 'Adapter contract' },
          provenance: { path: specPath, startLine: 2, endLine: 2,
            digest: sha256(files[specPath]!), commitSha },
          extractor: { id: privateExtractor, version: '1' }, confidence: mode === 'confidence' ? 2 : 0.9,
          snapshotId: context.snapshotId, authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed',
        };
        produced.splice(0, produced.length, ...actual, adapter);
        producedBytes = stableJson(produced);
        return produced;
      },
    }],
  });
  return { root, config, commitSha, hydrator, store, compile, evaluate, produced, artifacts, assertPreserved,
    providerCalls: () => providerCalls, correct: () => { mode = 'correct'; },
    assertInputUnchanged: () => expect(stableJson(produced)).toBe(producedBytes) };
}

describe('hydration identity preflight', () => {
  it('attributes actual producer conflicts before compilation, retains cached work and retries through full SHACL', async () => {
    const f = await fixture('kind');
    const validate = vi.spyOn(RdfEvidenceGraph.prototype, 'validate');
    const events: HydrationProgressEvent[] = [];
    const attempt = () => f.hydrator.hydrate({ ref: 'HEAD', headName: 'default', onProgress: event => events.push(event) });
    const error = await attempt().then(() => { throw new Error('Expected identity conflict'); }, error => error);
    expect(error).toBeInstanceOf(GraphIdentityConflictError);
    expect(error.report).toMatchObject({ passed: false, category: 'extraction-gap', phase: 'validate-identities',
      shaclValidated: false, conflictCount: 1 });
    expect([...error.report.conflicts[0].kinds].sort()).toEqual(['Component', 'Evidence']);
    const publicOutput = JSON.stringify(error.report) + error.message;
    for (const text of [specPath, privateExtractor, f.root, 'PRIVATE_LABEL_SENTINEL']) expect(publicOutput).not.toContain(text);
    expect(f.compile).not.toHaveBeenCalled(); expect(f.evaluate).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expect(events.filter(event => event.phase === 'validate-identities').map(event => event.status)).toEqual(['started', 'failed']);
    expect(events.some(event => ['compile-semantic-rdf', 'build-rdf-evidence', 'validate-shacl', 'publish-snapshot'].includes(event.phase))).toBe(false);
    expect(f.providerCalls()).toBe(1); f.assertInputUnchanged(); await f.assertPreserved();
    const savedArtifacts = await f.artifacts(); expect(Object.keys(savedArtifacts)).toHaveLength(1);

    const detailed = await f.hydrator.hydrate({ ref: 'HEAD', headName: 'default', validationDetails: true })
      .then(() => { throw new Error('Expected identity conflict'); }, error => error);
    expect(detailed).toBeInstanceOf(GraphIdentityConflictError);
    const conflict = detailed.report.conflicts[0];
    expect(conflict.details).toEqual({ nodeId: repositoryFileNode(specPath).id });
    for (const fact of f.produced) for (const side of ['subject', 'object'] as const) {
      if (fact[side].id !== repositoryFileNode(specPath).id) continue;
      const occurrence = conflict.occurrences.find((item: { side: string; details?: { factId: string } }) =>
        item.side === side && item.details?.factId === fact.id);
      expect(occurrence).toMatchObject({ side, kind: fact[side].kind });
      expect(occurrence.details).toEqual({
        nodeId: fact[side].id, nodeKind: fact[side].kind, factId: fact.id,
        extractor: fact.extractor, provenance: fact.provenance, confidence: fact.confidence,
        ...(fact.authority ? { authority: fact.authority } : {}),
        ...(fact.sourceAuthority ? { sourceAuthority: fact.sourceAuthority } : {}),
        ...(fact.extractionReview ? { extractionReview: fact.extractionReview } : {}),
      });
      expect(occurrence.factIndex).toBeGreaterThanOrEqual(0);
      expect(occurrence.factIndex).toBeLessThan(detailed.report.factCount);
    }
    expect(JSON.stringify(detailed.report)).not.toContain('PRIVATE_LABEL_SENTINEL');
    expect(conflict.occurrences.some((item: { details?: { provenance: { path: string } } }) =>
      item.details?.provenance.path === 'docs/owner.md')).toBe(true);
    expect(f.providerCalls()).toBe(1); expect(await f.artifacts()).toEqual(savedArtifacts);
    f.assertInputUnchanged(); await f.assertPreserved();

    f.correct(); events.splice(0);
    const completed = await attempt();
    expect(completed.semanticExtracted).toBe(0); expect(completed.semanticReused).toBe(1);
    expect(f.providerCalls()).toBe(1); expect(await f.artifacts()).toEqual(savedArtifacts);
    expect(f.compile).toHaveBeenCalledTimes(1); expect(f.evaluate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
    expect((await f.store.readHead('default'))?.manifest.snapshotId).toBe(completed.snapshot.manifest.snapshotId);
    expect(completed.snapshot.facts.find(fact => fact.extractor.id === privateExtractor)).toMatchObject({
      authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed', subject: { kind: 'Evidence' } });
    for (const phase of ['validate-identities', 'build-rdf-evidence', 'build-validation-union', 'validate-shacl']) {
      const phaseEvents = events.filter(event => event.phase === phase);
      expect(phaseEvents.map(event => event.status)).toEqual(['started', 'completed']);
      expect(phaseEvents.every(event => event.factCount === completed.snapshot.facts.length)).toBe(true);
      expect(phaseEvents.at(-1)!.elapsedMs).toBeGreaterThanOrEqual(0);
    }
    f.assertInputUnchanged();
  });

  it('does not promote identity consistency to conformance or skip other SHACL constraints', async () => {
    const f = await fixture('confidence');
    const validate = vi.spyOn(RdfEvidenceGraph.prototype, 'validate');
    const events: HydrationProgressEvent[] = [];
    await expect(f.hydrator.hydrate({ ref: 'HEAD', headName: 'default', onProgress: event => events.push(event) }))
      .rejects.toThrow('SHACL validation');
    expect(events.filter(event => event.phase === 'validate-identities').map(event => event.status)).toEqual(['started', 'completed']);
    expect(events.some(event => event.phase === 'publish-snapshot')).toBe(false);
    expect(f.compile).toHaveBeenCalledTimes(1); expect(f.evaluate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
    expect((await validate.mock.results[0]!.value).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'extraction-gap', path: 'https://context-graph.dev/record#confidence' }),
    ]));
    expect(f.providerCalls()).toBe(1); expect(Object.keys(await f.artifacts())).toHaveLength(1);
    f.assertInputUnchanged(); await f.assertPreserved();
  });
});
