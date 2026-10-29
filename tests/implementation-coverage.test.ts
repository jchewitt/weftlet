import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExtractionContext, GraphDiagnostic, GraphFact, GraphSnapshot, SemanticArtifact } from '@weftlet/core';
import { RepositoryContractExtractor, ScipSymbolExtractor, ScipTypeScriptIndexer } from '../src/extraction/static.js';
import { linkSemanticDocuments } from '../src/extraction/document.js';
import { GitRepository } from '../src/repository/git.js';
import { RdfEvidenceGraph } from '../src/graph/rdf.js';
import { contextPackLaneForFact, SnapshotImpactQueryService } from '../src/graph/query.js';
import { contextPackEvidenceAuthority } from '../src/graph/authority.js';
import { handleImpactScan } from '../src/interfaces/mcp-facade.js';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';
import { renderContextPackHtml } from '../src/visualization/visualization.js';

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(includeMissingLink = false) {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-implementation-coverage-'));
  roots.push(root);
  await Promise.all(['src', 'docs'].map(path => mkdir(join(root, path))));
  const files: Record<string, string> = {
    '.gitattributes': '* text eol=lf\n',
    '.gitignore': '.context-graph/\n',
    'package.json': JSON.stringify({ name: 'public-coverage-fixture', version: '1.0.0', type: 'module' }),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext',
      moduleResolution: 'NodeNext', strict: true, noEmit: true }, include: ['src/**/*.ts'] }),
    'src/api.ts': 'export interface Work { readonly id: string }\n',
    'src/worker.ts': "import type { Work } from './api.js';\nexport function execute(work: Work): string { return work.id; }\n",
    'src/worker.spec.ts': "import type { Work } from './api.js';\nimport { execute } from './worker.js';\nexport function verify(work: Work): boolean { return execute(work) === work.id; }\n",
    'docs/owner.md': '# Public work owner\nThe worker implements work execution.\nSee [worker](../src/worker.ts) and [contract](../src/api.ts).\n' +
      (includeMissingLink ? 'The pending adapter is [here](../src/unimplemented.ts).\n' : ''),
  };
  await Promise.all(Object.entries(files).map(([path, content]) => writeFile(join(root, path), content)));
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  await git('init', '--quiet');
  await git('add', '.');
  await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public implementation coverage');
  const repository = new GitRepository(root);
  const commitSha = await repository.resolveRef('HEAD');
  const context: ExtractionContext = { repositoryRoot: root, repositoryId: 'public/coverage',
    ref: 'HEAD', commitSha, snapshotId: `coverage-${commitSha}`, changedPaths: [], deletedPaths: [], renamedPaths: {} };
  const contracts = await new RepositoryContractExtractor(repository, ['src/api.ts'], ['src', 'docs'],
    { 'src/api.ts': ['./api.js'] }).extract(context);
  async function open(facts: readonly GraphFact[], label: string, diagnostics: readonly GraphDiagnostic[] = []) {
    const snapshot: GraphSnapshot = {
      manifest: { schemaVersion: 1, repositoryId: context.repositoryId, ref: 'HEAD', commitSha,
        snapshotId: context.snapshotId, ontologyVersion: '1', extractorVersions: {}, semanticModel: 'none',
        semanticPromptVersion: 'none', generatedAt: '2026-01-01T00:00:00Z', contentDigest: sha256(stableJson(facts)),
        semanticArtifactKeys: [], scipIndexDigest: 'public-index', rdfDigest: 'direct-rdf' },
      facts, invariants: [], runtimeEvidence: [], unresolved: [], diagnostics,
    };
    const graph = new RdfEvidenceGraph(snapshot);
    expect(await graph.validate()).toEqual({ conforms: true, issues: [] });
    expect(await graph.facts()).toEqual(facts);
    const store = new FileSnapshotStore(join(root, '.context-graph', label));
    await store.write(snapshot);
    await store.updateHead('default', context.snapshotId);
    const service = new SnapshotImpactQueryService(store, 'default');
    return { snapshot, store, service };
  }
  async function query(facts: readonly GraphFact[], label: string) {
    const { snapshot, store, service } = await open(facts, label);
    const pack = await service.scan({ maxFacts: 200 });
    expect(await handleImpactScan(service, { maxFacts: 200 })).toEqual(pack);
    // Presentation and coverage cannot rewrite the extracted evidence or its authority.
    expect([...pack.facts].sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([...facts].sort((a, b) => a.id.localeCompare(b.id)));
    expect(pack.exploration?.truncated).toBe(false);
    expect(pack.coverage).toMatchObject({ scope: 'returned-page', countsAreNonExclusive: true });
    const beforeRender = stableJson(pack);
    const html = renderContextPackHtml(pack);
    for (const [lane, count] of Object.entries(pack.coverage.counts)) {
      expect(html).toContain(`<span class="metric">${lane}: ${count}</span>`);
      expect(pack.markdown).toContain(`${lane}: ${count} relationships`);
    }
    for (const rendered of [html, pack.markdown]) {
      expect(rendered).toContain('Counts describe evidence on this returned page and may overlap');
      expect(rendered).toContain('not a percentage');
    }
    expect(stableJson(pack)).toBe(beforeRender);
    expect(await store.read(context.snapshotId)).toEqual(snapshot);
    return pack;
  }
  return { root, repository, context, files, contracts, open, query };
}

describe('implementation coverage across presentation lanes', () => {
  it('counts actual committed contract consumers as implementation without moving or rewriting their facts', async () => {
    const f = await fixture();
    // Use the whole contract extractor result. File-membership facts must not mask
    // the distinction between a primary display lane and implementation evidence.
    expect(f.contracts).toHaveLength(4);
    const production = f.contracts.find(fact => fact.provenance.path === 'src/worker.ts')!;
    expect(production).toMatchObject({ predicate: 'consumes', subject: { kind: 'Component' },
      object: { kind: 'Contract' }, provenance: { path: 'src/worker.ts', startLine: 1, endLine: 1,
        digest: sha256(f.files['src/worker.ts']!), commitSha: f.context.commitSha } });
    expect(contextPackEvidenceAuthority(production)).toBe('implemented');
    expect(contextPackLaneForFact(production)).toBe('contractsAndInvariants');
    const pack = await f.query(f.contracts, 'contracts');
    expect(pack.coverage.counts.contractsAndInvariants).toBeGreaterThan(0);
    expect(pack.coverage.counts.implementationAndConsumers).toBe(1);
    expect(pack.diagnostics.implementationGaps.items).toEqual([]);
    expect(pack.coverage.gaps.some(gap => gap.includes('implementationAndConsumers'))).toBe(false);
    expect(pack.markdown).toContain('implementationAndConsumers: 1 relationships');
    expect(pack.markdown).toContain('[implemented] src/worker.ts —consumes→ src/api.ts');
    expect(pack.markdown.match(/src\/worker\.ts —consumes→ src\/api\.ts/g)).toHaveLength(1);
  });

  it('counts real SCIP definitions and consumers even though their symbols display as contracts', async () => {
    const f = await fixture();
    const index = await new ScipTypeScriptIndexer({ command: 'bundled-scip-typescript', version: '0.4.0',
      args: ['index', '--no-global-caches', 'tsconfig.json'] }, join(f.root, '.context-graph')).index(f.context);
    const facts = await new ScipSymbolExtractor(f.repository, index).extract(f.context);
    const production = facts.filter(fact => fact.subject.kind === 'Component');
    const tests = facts.filter(fact => fact.subject.kind === 'Evidence');
    expect(production.length).toBeGreaterThan(0);
    expect(tests.length).toBeGreaterThan(0);
    expect(production.every(fact => contextPackLaneForFact(fact) === 'contractsAndInvariants')).toBe(true);
    for (const fact of facts) {
      expect(fact.provenance.digest).toBe(sha256(f.files[fact.provenance.path]!));
      expect(fact.provenance.commitSha).toBe(f.context.commitSha);
      expect(fact.confidence).toBe(1);
    }
    const pack = await f.query(facts, 'scip');
    expect(pack.coverage.counts.contractsAndInvariants).toBe(production.length);
    expect(pack.coverage.counts.implementationAndConsumers).toBe(facts.filter(fact =>
      !fact.provenance.path.endsWith('.spec.ts')).length);
    expect(pack.coverage.counts.validationEvidence).toBe(facts.filter(fact => fact.provenance.path.endsWith('.spec.ts')).length);
    expect(pack.diagnostics.implementationGaps.items).toEqual([]);
  }, 45_000);

  it('does not turn documentation, inferred model claims or test-only facts into production implementation', async () => {
    const f = await fixture();
    const [source] = await f.repository.semanticSources(f.context, ['docs/owner.md']);
    // Explicit model-output fixture; no model or provider is invoked. The assertion
    // cites documentation and remains unreviewed despite naming an existing file.
    const inferred: GraphFact = { id: 'public-inferred-implementation',
      subject: { id: 'capability:work', kind: 'Capability', label: 'Work' }, predicate: 'implementedBy',
      object: { id: 'component:file:src/worker.ts', kind: 'Component', label: 'src/worker.ts' },
      provenance: { path: source!.path, startLine: 2, endLine: 2, digest: source!.digest,
        commitSha: f.context.commitSha }, extractor: { id: 'codex-cli:public-fixture', version: '1' },
      confidence: 0.9, authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed',
      snapshotId: f.context.snapshotId };
    const artifact: SemanticArtifact = { key: 'public-inferred-fixture', stableSemanticId: source!.stableSemanticId,
      source: inferred.provenance, sourceDigest: source!.digest, promptVersion: 'none', extractorVersion: 'none',
      modelIdentity: 'none', adapterVersion: 'none', ontologyVersion: 'none', facts: [inferred], oml: '',
      unresolvedMappings: [], rawModelOutput: '', outputDigest: 'none' };
    const documents = linkSemanticDocuments(f.context, [{ source: source!, artifact }],
      await f.repository.listAllFilesAt(f.context.commitSha), [source!.path]);
    expect(documents.diagnostics).toEqual([]);
    expect(documents.facts.length).toBeGreaterThan(0);
    for (const [label, facts] of [
      ['documents', [...documents.facts, ...f.contracts.filter(fact => fact.provenance.path === 'docs/owner.md')]],
      ['model', [inferred]],
      ['unapproved-model', [{ ...inferred, id: 'public-unapproved-implementation', sourceAuthority: 'inferred' }]],
      ['tests', f.contracts.filter(fact => fact.provenance.path === 'src/worker.spec.ts')],
    ] as const) {
      expect(facts.length).toBeGreaterThan(0);
      const pack = await f.query(facts, label);
      expect(pack.coverage.counts.implementationAndConsumers).toBe(0);
      expect(pack.diagnostics.implementationGaps.items).toHaveLength(1);
      expect(pack.markdown).toContain('implementationAndConsumers: 0 relationships');
    }
  });

  it('scopes empty implementation coverage to the returned page and retains cited gaps when later pages contain code', async () => {
    const f = await fixture(true);
    const [source] = await f.repository.semanticSources(f.context, ['docs/owner.md']);
    const emptyArtifact: SemanticArtifact = { key: 'public-no-model-links', stableSemanticId: source!.stableSemanticId,
      source: { path: source!.path, startLine: 1, endLine: source!.content.split('\n').length,
        digest: source!.digest, commitSha: f.context.commitSha }, sourceDigest: source!.digest,
      promptVersion: 'none', extractorVersion: 'none', modelIdentity: 'none', adapterVersion: 'none',
      ontologyVersion: 'none', facts: [], oml: '', unresolvedMappings: [], rawModelOutput: '', outputDigest: 'none' };
    const documents = linkSemanticDocuments(f.context, [{ source: source!, artifact: emptyArtifact }],
      await f.repository.listAllFilesAt(f.context.commitSha), [source!.path]);
    expect(documents.diagnostics).toHaveLength(1);
    const sourceGap = documents.diagnostics[0]!;
    expect(sourceGap).toMatchObject({ kind: 'implementationGaps', evidenceScope: 'source',
      provenance: [{ path: source!.path, startLine: 4, endLine: 4, digest: source!.digest,
        commitSha: f.context.commitSha }] });
    const facts = [...f.contracts, ...documents.facts];
    const { snapshot, store, service } = await f.open(facts, 'pagination', documents.diagnostics);
    const request = { ownerDocument: source!.path, maxFacts: 1 };
    const first = await handleImpactScan(service, request);
    expect(first.facts).toHaveLength(1);
    expect(first.facts[0]!.provenance.path).toBe(source!.path);
    expect(first.coverage).toMatchObject({ scope: 'returned-page', countsAreNonExclusive: true,
      counts: { implementationAndConsumers: 0 } });
    expect(first.exploration).toMatchObject({ rankingVersion: 'proximity-diversity-v1', truncated: true,
      reachableFacts: facts.length });
    const pageGap = first.diagnostics.implementationGaps.items.find(item => item.id === 'query-implementationGaps');
    expect(pageGap?.reason).toContain('this returned page');
    expect(pageGap?.reason).toContain('continuation');
    expect(first.markdown).not.toContain('No implementation relationships matched this query');
    expect(first.diagnostics.implementationGaps.items).toContainEqual(sourceGap);

    const pages = [first];
    while (pages.at(-1)!.exploration?.continuation) {
      if (pages.length > facts.length) throw new Error('Pagination did not terminate');
      const page = await handleImpactScan(service, { ...request,
        continuation: pages.at(-1)!.exploration!.continuation });
      expect(page.exploration?.rankingVersion).toBe('proximity-diversity-v1');
      expect(page.coverage).toMatchObject({ scope: 'returned-page', countsAreNonExclusive: true });
      pages.push(page);
    }
    const productionPage = pages.find(page => page.coverage.counts.implementationAndConsumers > 0)!;
    expect(productionPage).toBeDefined();
    expect(productionPage.facts[0]!.provenance.path).toBe('src/worker.ts');
    expect(productionPage.diagnostics.implementationGaps.items).toContainEqual(sourceGap);
    expect(productionPage.diagnostics.implementationGaps.items.some(item => item.id === 'query-implementationGaps')).toBe(false);
    const collected = pages.flatMap(page => page.facts);
    expect(collected).toHaveLength(facts.length);
    expect(new Set(collected.map(fact => fact.id)).size).toBe(facts.length);
    expect([...collected].sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([...facts].sort((a, b) => a.id.localeCompare(b.id)));
    expect(await store.read(f.context.snapshotId)).toEqual(snapshot);
  });
});
