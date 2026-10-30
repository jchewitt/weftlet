import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { repositoryFileNode, type ExtractionContext, type GraphFact, type GraphSnapshot,
  type SemanticArtifact } from '@weftlet/core';
import { RepositoryContractExtractor, RepositoryFileExtractor, ScipSymbolExtractor,
  ScipTypeScriptIndexer, repositoryContractExtractorIdentity } from '../src/extraction/static.js';
import { linkSemanticDocuments } from '../src/extraction/document.js';
import { GitRepository } from '../src/repository/git.js';
import { CG, RdfEvidenceGraph, nodeIri } from '../src/graph/rdf.js';
import { contextPackEvidenceAuthority } from '../src/graph/authority.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';
import { buildWorkingOverlay } from '../src/application/overlay.js';
import { FileSnapshotStore } from '../src/storage/storage.js';
import type { ContextGraphConfig } from '../src/configuration/config.js';

const execute = promisify(execFile);
const temporaryRoots: string[] = [];
const contractPath = 'prisma/schema.prisma';
const consumers = ['src/service.ts', 'src/service.spec.ts', 'src/service.test.ts', 'docs/owner.md'];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-physical-kinds-'));
  temporaryRoots.push(root);
  await Promise.all(['src', 'prisma', 'docs'].map(path => mkdir(join(root, path))));
  const files: Record<string, string> = {
    '.gitattributes': '* text eol=lf\n',
    '.gitignore': '.context-graph/\n',
    'package.json': JSON.stringify({ name: 'public-physical-file-fixture', version: '1.0.0', type: 'module' }),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext',
      moduleResolution: 'NodeNext', strict: true, noEmit: true, experimentalDecorators: true,
      baseUrl: '.', paths: { '@prisma/client': ['./src/client.ts'] } }, include: ['src/**/*.ts'] }),
    [contractPath]: 'model Job {\n  id String @id\n}\n',
    'src/client.ts': 'export class PrismaClient {\n  job = { findMany: () => ["public job"] };\n}\n',
    'src/decorators.ts': 'export function Injectable(): ClassDecorator { return () => {}; }\n',
    'src/service.ts': "import { PrismaClient } from '@prisma/client';\nexport function reconcile(client: PrismaClient): string[] { return client.job.findMany(); }\n",
    'src/service.spec.ts': [
      "import { PrismaClient } from '@prisma/client';", "import { reconcile } from './service.js';",
      "import { Injectable } from './decorators.js';", '@Injectable()',
      'export class ServiceSpec {', '  run() { const prisma = new PrismaClient(); return reconcile(prisma); }', '}', '',
    ].join('\n'),
    'src/service.test.ts': [
      "import { PrismaClient } from '@prisma/client';", "import { reconcile } from './service.js';",
      'export function verifyJob() { const prisma = new PrismaClient();',
      '  prisma.job.findMany = () => ["mocked job"]; return reconcile(prisma); }', '',
    ].join('\n'),
    'docs/owner.md': '# Public job owner\nThe implementation consumes @prisma/client.\nSee [service](../src/service.ts), [spec](../src/service.spec.ts) and [test](../src/service.test.ts).\n',
  };
  await Promise.all(Object.entries(files).map(([path, content]) => writeFile(join(root, path), content)));
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  await git('init', '--quiet'); await git('add', '.');
  await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public physical-file consumers');
  const repository = new GitRepository(root);
  const commitSha = await repository.resolveRef('HEAD');
  const context: ExtractionContext = { repositoryRoot: root, repositoryId: 'public/physical-file-kinds',
    ref: 'HEAD', commitSha, snapshotId: `fixture-${commitSha}`, changedPaths: [], deletedPaths: [], renamedPaths: {} };
  const extract = async (scipDigest = 'public-index') => ({
    files: await new RepositoryFileExtractor(repository, ['src', 'prisma', 'docs'], scipDigest).extract(context),
    contracts: await new RepositoryContractExtractor(repository, ['prisma/**/*.prisma'], ['src', 'docs'],
      { [contractPath]: ['@prisma/client'] }).extract(context),
  });
  const snapshot = (facts: readonly GraphFact[]): GraphSnapshot => ({
    manifest: { schemaVersion: 1, repositoryId: context.repositoryId, ref: 'HEAD', commitSha,
      snapshotId: context.snapshotId, ontologyVersion: '1', extractorVersions: {}, semanticModel: 'none',
      semanticPromptVersion: 'none', generatedAt: '2026-01-01T00:00:00Z', contentDigest: sha256(stableJson(facts)),
      semanticArtifactKeys: [], scipIndexDigest: 'public-index', rdfDigest: 'direct-rdf' },
    facts, invariants: [], runtimeEvidence: [], unresolved: [],
  });
  return { root, repository, context, files, extract, snapshot };
}

describe('canonical physical-file producer composition', () => {
  it('joins actual file and contract facts for spec/test consumers under strict SHACL, preserving their evidence', async () => {
    const f = await fixture();
    const { files, contracts } = await f.extract();
    const consumption = contracts.filter(fact => fact.predicate === 'consumes');
    expect(consumption.map(fact => fact.provenance.path).sort()).toEqual([...consumers].sort());
    expect(repositoryContractExtractorIdentity).toEqual({ id: 'repository-contract-extractor', version: '1.2.0' });
    for (const path of consumers) {
      const fact = consumption.find(item => item.provenance.path === path)!;
      const line = path.endsWith('.md') ? 2 : 1;
      expect(fact).toEqual({
        id: sha256(stableJson({ consumer: repositoryFileNode(path),
          contract: { id: `contract:file:${contractPath}`, kind: 'Contract', label: contractPath },
          consumerProvenance: { path, startLine: line, endLine: line, digest: sha256(f.files[path]!), commitSha: f.context.commitSha } })),
        subject: repositoryFileNode(path), predicate: 'consumes',
        object: { id: `contract:file:${contractPath}`, kind: 'Contract', label: contractPath },
        provenance: { path, startLine: line, endLine: line, digest: sha256(f.files[path]!), commitSha: f.context.commitSha },
        extractor: repositoryContractExtractorIdentity, confidence: 1, snapshotId: f.context.snapshotId,
      });
      expect(fact.authority).toBeUndefined();
      expect(fact.sourceAuthority).toBeUndefined();
      expect(fact.extractionReview).toBeUndefined();
    }
    for (const path of ['src/service.spec.ts', 'src/service.test.ts']) {
      const file = files.find(fact => fact.predicate === 'contains' && fact.object.id === `component:file:${path}`)!;
      const contract = consumption.find(fact => fact.subject.id === file.object.id)!;
      expect(file.object).toEqual({ ...repositoryFileNode(path), attributes: { scipIndexDigest: 'public-index' } });
      expect(file.provenance).toEqual({ path, startLine: 1, endLine: f.files[path]!.split('\n').length,
        digest: sha256(f.files[path]!), commitSha: f.context.commitSha });
      expect(file.object.kind).toBe('Evidence');
      expect(contract.subject.kind).toBe('Evidence');
      expect(contextPackEvidenceAuthority(file)).toBe('validated');
      expect(contextPackEvidenceAuthority(contract)).toBe('validated');
      // Historical behavior control: restore only 0.3.0's hard-coded consumer kind
      // on the actual pair. This does not claim to invoke the installed old package.
      const legacy = { ...contract, subject: { ...contract.subject, kind: 'Component' as const } };
      const red = await new RdfEvidenceGraph(f.snapshot([file, legacy])).validate();
      expect(red.conforms).toBe(false);
      expect(red.issues).toEqual([expect.objectContaining({ category: 'extraction-gap',
        path: `${CG}kind`, focus: nodeIri(file.object.id) })]);
      expect(await new RdfEvidenceGraph(f.snapshot([file, contract])).validate()).toEqual({ conforms: true, issues: [] });
      expect(legacy.provenance).toBe(contract.provenance);
      expect(legacy.predicate).toBe(contract.predicate);
      expect(legacy.confidence).toBe(contract.confidence);
    }
    expect(consumption.find(fact => fact.provenance.path === 'src/service.ts')?.subject.kind).toBe('Component');
    expect(consumption.find(fact => fact.provenance.path === 'docs/owner.md')?.subject)
      .toEqual({ id: 'document:docs/owner.md', kind: 'Document', label: 'docs/owner.md' });
    expect(contracts.find(fact => fact.predicate === 'contains')?.subject)
      .toEqual({ id: `evidence:contract-file:${contractPath}`, kind: 'Evidence', label: contractPath });
    const graph = new RdfEvidenceGraph(f.snapshot([...files, ...contracts]));
    expect((await graph.validate()).conforms).toBe(true);
    expect(await graph.facts()).toEqual([...files, ...contracts]);
  });

  it('composes actual SCIP, Markdown links and a public core-only adapter fixture without promoting source authority', async () => {
    const f = await fixture();
    const scip = await new ScipTypeScriptIndexer({ command: 'bundled-scip-typescript', version: '0.4.0',
      args: ['index', '--no-global-caches', 'tsconfig.json'] }, join(f.root, '.context-graph')).index(f.context);
    const { files, contracts } = await f.extract(scip.digest);
    const symbols = await new ScipSymbolExtractor(f.repository, scip).extract(f.context);
    expect(symbols.length).toBeGreaterThan(0);
    for (const path of ['src/service.ts', 'src/service.spec.ts', 'src/service.test.ts']) {
      const facts = symbols.filter(fact => fact.provenance.path === path);
      expect(facts.length).toBeGreaterThan(0);
      const physical = facts.filter(fact => !fact.codeOccurrence && !fact.codeCall);
      expect(physical.length).toBeGreaterThan(0);
      expect(physical.every(fact => fact.subject.id === repositoryFileNode(path).id &&
        fact.subject.kind === repositoryFileNode(path).kind)).toBe(true);
      const definitions = facts.filter(fact => fact.codeOccurrence?.role === 'definition');
      expect(definitions.length).toBeGreaterThan(0);
      expect(definitions.every(fact => fact.object.id === repositoryFileNode(path).id &&
        fact.object.kind === repositoryFileNode(path).kind)).toBe(true);
      expect(facts.every(fact => fact.provenance.digest === sha256(f.files[path]!) &&
        fact.provenance.commitSha === f.context.commitSha && fact.confidence === 1)).toBe(true);
    }
    const [source] = await f.repository.semanticSources(f.context, ['docs/owner.md']);
    const empty: SemanticArtifact = { key: 'public-no-model-placeholder', stableSemanticId: source!.stableSemanticId,
      source: { path: source!.path, startLine: 1, endLine: 4, digest: source!.digest, commitSha: f.context.commitSha },
      sourceDigest: source!.digest, promptVersion: 'none', extractorVersion: 'none', modelIdentity: 'none',
      adapterVersion: 'none', ontologyVersion: 'none', facts: [], oml: '', unresolvedMappings: [], rawModelOutput: '', outputDigest: 'none' };
    const documents = linkSemanticDocuments(f.context, [{ source: source!, artifact: empty }],
      await f.repository.listAllFilesAt(f.context.commitSha), ['docs/owner.md']);
    expect(documents.diagnostics).toEqual([]);
    expect(documents.facts).toHaveLength(3);
    for (const fact of documents.facts) {
      expect(fact).toMatchObject({ subject: { id: 'document:docs/owner.md', kind: 'Document' }, predicate: 'references',
        provenance: { path: 'docs/owner.md', startLine: 3, endLine: 3, digest: sha256(f.files['docs/owner.md']!),
          commitSha: f.context.commitSha }, confidence: 1, authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'deterministic' });
      expect(fact.object).toEqual(repositoryFileNode(fact.object.label));
    }
    // A public adapter-contract fixture, not the consumer's private framework adapter.
    // It deliberately reads decorator/Prisma-bearing specs, rather than empty describe text.
    const adapter: GraphFact[] = [];
    for (const path of ['src/service.spec.ts', 'src/service.test.ts']) {
      const text = await f.repository.readFileAt(f.context.commitSha, path);
      const index = text.split('\n').findIndex(line => /@Injectable|prisma\.job\.findMany/.test(line));
      expect(index).toBeGreaterThanOrEqual(0);
      const provenance = { path, startLine: index + 1, endLine: index + 1, digest: sha256(text), commitSha: f.context.commitSha };
      adapter.push({ id: sha256(stableJson({ path, provenance })), subject: repositoryFileNode(path),
        predicate: 'consumes', object: { id: 'contract:public-fixture:prisma', kind: 'Contract', label: 'Public Prisma adapter fixture' },
        provenance, extractor: { id: 'public-core-adapter-fixture', version: '1' }, confidence: 1,
        authority: 'validated', snapshotId: f.context.snapshotId });
    }
    expect(adapter.every(fact => fact.subject.kind === 'Evidence')).toBe(true);
    const facts = [...files, ...contracts, ...symbols, ...documents.facts, ...adapter];
    const graph = new RdfEvidenceGraph(f.snapshot(facts));
    expect(await graph.validate()).toEqual({ conforms: true, issues: [] });
    expect(await graph.facts()).toEqual(facts);
    expect(adapter.every(fact => fact.sourceAuthority === undefined && fact.extractionReview === undefined)).toBe(true);
    expect(await readFile(join(f.root, 'docs/owner.md'), 'utf8')).toBe(f.files['docs/owner.md']);
  }, 45_000);

  it('reindexes canonical kinds in overlays without routing and rejects conflicting retained inference before publication', async () => {
    const f = await fixture();
    const config: ContextGraphConfig = JSON.parse(await readFile(
      new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    Object.assign(config, { repositoryId: f.context.repositoryId, codeRoots: ['src', 'prisma'],
      semanticSources: ['docs/owner.md'], evidenceRoots: [], runtimeEvidence: [], routingSources: [],
      contractPatterns: ['prisma/**/*.prisma'], contractConsumerRoots: ['src', 'docs'],
      contractAliases: { [contractPath]: ['@prisma/client'] },
      scip: { command: 'bundled-scip-typescript', version: '0.4.0',
        args: ['index', '--no-global-caches', 'tsconfig.json'] } });
    const storage = join(f.root, '.context-graph');
    const store = new FileSnapshotStore(storage);
    const neutral = await f.extract();
    const base = f.snapshot([...neutral.files, ...neutral.contracts]);
    Object.assign(base.manifest, { configurationDigest: sha256(stableJson(config)) });
    expect((await new RdfEvidenceGraph(base).validate()).conforms).toBe(true);
    await store.write(base); await store.updateHead('default', base.manifest.snapshotId);
    const basePath = join(storage, 'snapshots', `${base.manifest.snapshotId}.json`);
    const baseBytes = await readFile(basePath);
    await writeFile(join(f.root, 'src/service.ts'), f.files['src/service.ts']!.replace(
      'return client.job.findMany();', 'return client.job.findMany().map(job => job.trim());'));
    const agent = 'public-kind-overlay';
    const overlay = await buildWorkingOverlay(f.repository, config, store, storage, base.manifest.snapshotId, agent);
    expect(await new RdfEvidenceGraph(overlay).validate()).toEqual({ conforms: true, issues: [] });
    expect(overlay.manifest.extractorVersions).toMatchObject({
      assembly: 'standalone-graph-v12', 'repository-contract-extractor': '1.2.0',
      'scip-symbol-extractor': '2.1.0', 'typescript-call-extractor': '1.0.0', 'document-obligation-extractor': '1.0.0',
    });
    for (const path of ['src/service.ts', 'src/service.spec.ts', 'src/service.test.ts']) {
      const contract = overlay.facts.find(fact => fact.extractor.id === 'repository-contract-extractor' &&
        fact.provenance.path === path)!;
      expect(contract.subject).toEqual(repositoryFileNode(path));
      expect(contract).toMatchObject({ authority: 'draft', provenance: { commitSha: f.context.commitSha } });
      expect(overlay.facts.some(fact => fact.extractor.id === 'scip-symbol-extractor' &&
        fact.provenance.path === path && fact.subject.kind === repositoryFileNode(path).kind)).toBe(true);
    }
    const priorId = `${f.context.commitSha}-overlay-${sha256(stableJson({
      baseContentDigest: base.manifest.contentDigest, overlayDigest: overlay.manifest.overlayDigest,
      repositoryFileExtractor: { id: 'repository-file-extractor', version: '2.0.0' },
    })).slice(0, 32)}`;
    expect(overlay.manifest.snapshotId).not.toBe(priorId);

    // Explicit historical inference fixture: valid alone, incompatible with current physical
    // evidence. It is not a private consumer assertion or an actual model extraction.
    const inferred: GraphFact = { id: 'public-retained-inference',
      subject: { id: 'capability:public-jobs', kind: 'Capability', label: 'Public jobs' },
      predicate: 'verifiedBy', object: { id: 'component:file:src/service.spec.ts', kind: 'Component', label: 'src/service.spec.ts' },
      provenance: { path: 'docs/owner.md', startLine: 3, endLine: 3, digest: sha256(f.files['docs/owner.md']!), commitSha: f.context.commitSha },
      extractor: { id: 'public-inference-fixture', version: '1' }, confidence: 0.9,
      authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed', snapshotId: 'public-inferred-base' };
    const historical: GraphSnapshot = { ...base, facts: [inferred], manifest: { ...base.manifest,
      snapshotId: inferred.snapshotId, contentDigest: sha256(stableJson(inferred)) } };
    expect((await new RdfEvidenceGraph(historical).validate()).conforms).toBe(true);
    await store.write(historical);
    const historicalPath = join(storage, 'snapshots', `${historical.manifest.snapshotId}.json`);
    const historicalBytes = await readFile(historicalPath);
    const overlayHead = `overlay-${sha256(`${resolve(f.repository.root)}:${agent}`).slice(0, 24)}`;
    const previousHead = await readFile(join(storage, 'heads', `${overlayHead}.json`));
    const snapshotsBefore = (await readdir(join(storage, 'snapshots'))).sort();
    await expect(buildWorkingOverlay(f.repository, config, store, storage, historical.manifest.snapshotId, agent))
      .rejects.toMatchObject({ name: 'GraphIdentityConflictError', report: {
        category: 'extraction-gap', phase: 'validate-identities', passed: false, shaclValidated: false,
      } });
    expect((await readdir(join(storage, 'snapshots'))).sort()).toEqual(snapshotsBefore);
    expect(await readFile(join(storage, 'heads', `${overlayHead}.json`))).toEqual(previousHead);
    expect(await readFile(historicalPath)).toEqual(historicalBytes);
    expect(await readFile(basePath)).toEqual(baseBytes);
    expect(await store.readHead('default')).toEqual(base);
    expect(await store.readHead(overlayHead)).toEqual(overlay);
    expect((await store.read(historical.manifest.snapshotId))?.facts).toEqual([inferred]);
  }, 45_000);
});
