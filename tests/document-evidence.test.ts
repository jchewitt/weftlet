import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import type { ExtractionContext, GraphFact, GraphSnapshot, SemanticArtifact } from '@weftlet/core';
import { extractDocumentEvidence, documentEvidenceExtractorIdentity } from '../src/extraction/document-evidence.js';
import type { DocumentClassificationPolicy } from '../src/extraction/document-classification.js';
import { RepositoryFileExtractor } from '../src/extraction/static.js';
import { semanticArtifactKey, semanticArtifactOutputDigest, semanticProviderIdentity } from '../src/extraction/semantic-identity.js';
import { planDocumentCoverage } from '../src/application/document-coverage.js';
import { planHydration } from '../src/application/hydration-plan.js';
import { createSemanticArtifactStore } from '../src/application/semantic-artifact-store.js';
import { loadConfig } from '../src/configuration/config.js';
import { GitRepository } from '../src/repository/git.js';
import { RdfEvidenceGraph, CG } from '../src/graph/rdf.js';
import { contextPackEvidenceAuthority } from '../src/graph/authority.js';
import { contextPackLaneForFact, SnapshotImpactQueryService } from '../src/graph/query.js';
import { handleImpactScan } from '../src/interfaces/mcp-facade.js';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { renderContextPackHtml } from '../src/visualization/visualization.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';

const execute = promisify(execFile);
const roots: string[] = [];
const sources: Record<string, string> = {
  'docs/sot.md': '# Approved work intent\n[Draft plan](plan.md), [review](../checks/review.md), [empty check](../checks/empty.md).\n',
  'docs/plan.md': '# Draft plan\n[Worker](../src/worker.ts) and [test](../test/worker.test.ts).\n',
  'checks/review.md': '# Work check\nPASS: this is a reported checklist, not proof of test execution.\n[Worker](../src/worker.ts).\n',
  'checks/empty.md': '',
  'src/worker.ts': 'export const execute = (work: string) => work.trim();\n',
  'test/worker.test.ts': "import { execute } from '../src/worker.js';\nexport const check = () => execute(' work ') === 'work';\n",
};
const policy: DocumentClassificationPolicy = { schemaVersion: 1,
  roles: [{ id: 'draft-plans', pattern: 'docs/p*.md', role: 'plan' },
    { id: 'public-checks', pattern: 'checks/**', role: 'validation' }],
  owners: [{ id: 'work-owner', pattern: 'docs/**', ownerDocument: 'docs/sot.md' }] };

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-document-evidence-'));
  roots.push(root);
  await writeFile(join(root, '.gitignore'), '.context-graph/\n');
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  for (const [path, content] of Object.entries(sources)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  for (const name of ['provider', 'adapter']) {
    await writeFile(join(root, `${name}.mjs`), `import {writeFileSync} from 'node:fs';
writeFileSync(new URL('./unexpected-import', import.meta.url), '${name}');
throw Error('Document evidence must not initialize ${name}');\n`);
  }
  const rawConfig = JSON.parse(await readFile(new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  Object.assign(rawConfig, { repositoryId: 'public/document-evidence', semanticSources: ['docs/sot.md'],
    approvedIntentSources: ['docs/sot.md', 'checks/**'], evidenceRoots: ['legacy-validation'],
    adapter: './adapter.mjs', runtimeEvidence: ['unavailable-runtime.json'],
    semantic: { ...rawConfig.semantic, provider: 'module', providerModule: './provider.mjs',
      providerIdentity: 'public-document-evidence:1', maxDocuments: 20, maxSourceBytes: 65_536 },
    scip: { version: 'unavailable', command: 'unavailable-document-evidence-indexer', args: [] } });
  const configPath = join(root, 'context-graph.config.json');
  await writeFile(configPath, JSON.stringify(rawConfig));
  const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0', '--no-optional-locks', ...args], { cwd: root })).stdout.trim();
  const commit = async () => {
    await git('add', '.');
    await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public document evidence');
    return git('rev-parse', 'HEAD');
  };
  await git('init', '--quiet');
  const commitSha = await commit();
  const { config } = await loadConfig(configPath);
  const repository = new GitRepository(root);
  const context = (sha = commitSha): ExtractionContext => ({ repositoryRoot: root, repositoryId: config.repositoryId,
    ref: sha, commitSha: sha, snapshotId: `public-${sha}`, changedPaths: [], deletedPaths: [], renamedPaths: {} });
  const options = { entryPoints: ['docs/sot.md'], documentPolicy: policy,
    approvedIntentSources: config.approvedIntentSources, evidenceRoots: config.evidenceRoots };
  return { root, configPath, config, repository, git, commit, commitSha, context, options };
}

function snapshot(context: ExtractionContext, facts: readonly GraphFact[]): GraphSnapshot {
  return { manifest: { schemaVersion: 1, repositoryId: context.repositoryId, ref: context.ref,
    commitSha: context.commitSha, snapshotId: context.snapshotId, ontologyVersion: '1', extractorVersions: {},
    semanticModel: 'none', semanticPromptVersion: 'none', generatedAt: '2026-01-01T00:00:00Z',
    contentDigest: sha256(stableJson(facts)), semanticArtifactKeys: [], scipIndexDigest: 'none', rdfDigest: 'direct-rdf' },
    facts, invariants: [], runtimeEvidence: [], unresolved: [] };
}

async function treeBytes(root: string): Promise<Record<string, string>> {
  const paths = await readdir(root, { recursive: true, withFileTypes: true });
  return Object.fromEntries(await Promise.all(paths.filter(entry => entry.isFile()).map(async entry => {
    const path = join(entry.parentPath, entry.name);
    return [path.slice(root.length), (await readFile(path)).toString('base64')];
  })));
}

it('composes committed document and code evidence across RDF, query and renderers without changing hydration inputs or cached artifacts', async () => {
  const f = await fixture();
  const context = f.context();
  const [source] = await f.repository.semanticSources(context, ['docs/sot.md']);
  const modelIdentity = semanticProviderIdentity(f.config.semantic);
  const artifact: SemanticArtifact = { key: semanticArtifactKey(f.config.semantic, source!, modelIdentity),
    stableSemanticId: source!.stableSemanticId, sourceDigest: source!.digest,
    source: { path: source!.path, digest: source!.digest, commitSha: context.commitSha, startLine: 1, endLine: 3 },
    promptVersion: f.config.semantic.promptVersion, extractorVersion: f.config.semantic.extractorVersion,
    adapterVersion: f.config.semantic.adapterVersion, ontologyVersion: f.config.semantic.ontologyVersion,
    modelIdentity, facts: [], diagnostics: [], oml: '', unresolvedMappings: [], rawModelOutput: '',
    outputDigest: semanticArtifactOutputDigest({ facts: [], diagnostics: [], oml: '', rawModelOutput: '' }) };
  // Seed an explicit empty test artifact, never a provider result or approved assertion.
  await createSemanticArtifactStore(f.root, f.config).write(artifact);
  await writeFile(join(f.root, '.context-graph/retained-snapshot.json'), '{"public":"retained"}\n');
  await writeFile(join(f.root, 'docs/sot.md'), '# Dirty draft\n[Uncommitted](new.md)\n');
  const baseline = await planHydration(f.configPath, { ref: f.commitSha });
  expect(baseline.documents.map(document => document.path)).toEqual(['docs/sot.md']);
  expect(baseline.documents[0]?.cache).toMatchObject({ status: 'hit', key: artifact.key });
  const state = { index: await readFile(join(f.root, '.git/index')), status: await f.git('status', '--porcelain=v1'),
    config: await readFile(f.configPath), cache: await treeBytes(join(f.root, '.context-graph')),
    sources: await Promise.all(Object.keys(sources).map(path => readFile(join(f.root, path)))) };
  const preview = await planDocumentCoverage(f.configPath, { ref: f.commitSha, ...f.options });
  expect(preview).toMatchObject({ ready: true, changesHydrationSelection: false, classification: { complete: true } });
  expect(preview.configurationDigest).toBe(baseline.configurationDigest);
  expect(preview.documents).toHaveLength(4);
  const extracted = await extractDocumentEvidence(f.repository, context, f.options);
  expect(extracted.traversal.coverage.complete).toBe(true);
  expect(extracted.classification.complete).toBe(true);
  expect(extracted.diagnostics).toEqual([]);
  const files = await new RepositoryFileExtractor(f.repository, ['src', 'test'], 'no-index-required').extract(context);
  const facts = [...extracted.facts, ...files];
  for (const fact of extracted.facts) {
    expect(fact).toMatchObject({ authority: 'inferred', extractionReview: 'deterministic',
      sourcePolicyDigest: extracted.classification.policyDigest, extractor: documentEvidenceExtractorIdentity });
    expect(fact.provenance.digest).toBe(sha256(sources[fact.provenance.path]!));
    expect(fact.provenance.commitSha).toBe(f.commitSha);
    expect(fact.predicate).not.toBe('verifiedBy');
  }
  const planFacts = extracted.facts.filter(fact => fact.provenance.path === 'docs/plan.md');
  expect(planFacts.length).toBeGreaterThan(0);
  expect(planFacts.every(fact => fact.sourceRole === 'plan' && fact.sourceAuthority === 'inferred' &&
    fact.sourceOwnership?.status === 'resolved')).toBe(true);
  const reviewFacts = extracted.facts.filter(fact => fact.provenance.path === 'checks/review.md');
  expect(reviewFacts).toHaveLength(2);
  expect(reviewFacts.every(fact => fact.sourceRole === 'validation' && fact.sourceAuthority === 'declared' &&
    contextPackLaneForFact(fact) === 'validationEvidence' && contextPackEvidenceAuthority(fact) === 'inferred')).toBe(true);
  expect(extracted.facts.find(fact => fact.provenance.path === 'checks/empty.md')).toMatchObject({
    predicate: 'contains', object: { id: 'document:checks/empty.md', kind: 'Document' },
    sourceRole: 'validation', provenance: { startLine: 1, endLine: 1, digest: sha256('') } });
  const saved = snapshot(context, facts);
  const graph = new RdfEvidenceGraph(saved);
  expect(await graph.validate()).toEqual({ conforms: true, issues: [] });
  expect(await graph.facts()).toEqual(facts);
  const rows = await graph.select(`SELECT ?path ?role ?status ?policy ?digest ?commit WHERE {
    ?fact <${CG}path> ?path; <${CG}sourceRole> ?role; <${CG}ownershipStatus> ?status; <${CG}sourcePolicyDigest> ?policy;
      <${CG}sourceDigest> ?digest; <${CG}commit> ?commit
  }`);
  expect(rows.truncated).toBe(false);
  expect(rows.rows).toHaveLength(extracted.facts.length);
  expect(rows.rows.filter(row => row.path === 'checks/review.md').every(row => row.role === 'validation' &&
    row.status === 'not-required' && row.policy === extracted.classification.policyDigest)).toBe(true);
  expect(rows.rows.map(row => stableJson(row)).sort()).toEqual(extracted.facts.map(fact => stableJson({
    path: fact.provenance.path, role: fact.sourceRole, status: fact.sourceOwnership!.status,
    policy: fact.sourcePolicyDigest, digest: fact.provenance.digest, commit: fact.provenance.commitSha })).sort());
  const queryRoot = await mkdtemp(join(tmpdir(), 'weftlet-document-query-'));
  roots.push(queryRoot);
  const store = new FileSnapshotStore(queryRoot);
  await store.write(saved); await store.updateHead('default', context.snapshotId);
  const service = new SnapshotImpactQueryService(store, 'default');
  const request = { ownerDocument: 'docs/sot.md', maxFacts: 100 };
  const pack = await service.scan(request);
  expect(await handleImpactScan(service, request)).toEqual(pack);
  expect([...pack.facts].sort((a, b) => a.id.localeCompare(b.id)))
    .toEqual([...facts].sort((a, b) => a.id.localeCompare(b.id)));
  expect(pack.coverage.counts.implementationAndConsumers).toBeGreaterThan(0);
  expect(pack.coverage.counts.validationEvidence).toBeGreaterThan(reviewFacts.length);
  const html = renderContextPackHtml(pack);
  for (const rendered of [pack.markdown, html]) {
    expect(rendered).toContain('source role validation; ownership not-required; owner documents');
    expect(rendered).toContain('source role plan; ownership resolved; owner documents docs/sot.md');
  }
  expect(pack.markdown).toContain('owner documents \\(none\\)');
  expect(html).toContain('owner documents (none)');
  expect(html).toContain('class="visual-node column-evidence" data-visual-node="true" data-node-id="document:checks/review.md"');
  expect(await store.read(context.snapshotId)).toEqual(saved);
  expect(await planHydration(f.configPath, { ref: f.commitSha })).toEqual(baseline);
  expect(await readFile(join(f.root, '.git/index'))).toEqual(state.index);
  expect(await f.git('status', '--porcelain=v1')).toBe(state.status);
  expect(await readFile(f.configPath)).toEqual(state.config);
  expect(await treeBytes(join(f.root, '.context-graph'))).toEqual(state.cache);
  expect(await Promise.all(Object.keys(sources).map(path => readFile(join(f.root, path))))).toEqual(state.sources);
  await expect(readFile(join(f.root, 'unexpected-import'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('recomputes role policy, scoped ownership and renamed/deleted documents while retaining historical evidence', async () => {
  const f = await fixture();
  const original = await extractDocumentEvidence(f.repository, f.context(), f.options);
  const originalBytes = stableJson(original);
  const originalPlan = original.facts.find(fact => fact.provenance.path === 'docs/plan.md' && fact.predicate === 'contains')!;
  const scoped = await extractDocumentEvidence(f.repository, f.context(), { ...f.options, entryPoints: ['docs/plan.md'] });
  const scopedPlan = scoped.facts.find(fact => fact.predicate === 'contains')!;
  expect(scoped.classification.policyDigest).toBe(original.classification.policyDigest);
  expect(scopedPlan.provenance).toEqual(originalPlan.provenance);
  expect(scopedPlan.sourceOwnership).toMatchObject({ status: 'unavailable', ownerDocuments: ['docs/sot.md'] });
  expect(originalPlan.sourceOwnership?.status).toBe('resolved');
  expect(scopedPlan.id).not.toBe(originalPlan.id);
  expect(scoped.diagnostics.some(diagnostic => diagnostic.kind === 'missingIntent')).toBe(true);
  const changedPolicy: DocumentClassificationPolicy = { ...policy,
    roles: policy.roles!.map(mapping => mapping.id === 'draft-plans' ? { ...mapping, role: 'reference' as const } : mapping) };
  const changed = await extractDocumentEvidence(f.repository, f.context(), { ...f.options, documentPolicy: changedPolicy });
  const changedPlan = changed.facts.find(fact => fact.provenance.path === 'docs/plan.md' && fact.predicate === 'contains')!;
  expect(changed.classification.policyDigest).not.toBe(original.classification.policyDigest);
  expect(changedPlan).toMatchObject({ sourceRole: 'reference', provenance: originalPlan.provenance });
  expect(changedPlan.id).not.toBe(originalPlan.id);
  await rename(join(f.root, 'docs/plan.md'), join(f.root, 'docs/proposal.md'));
  await writeFile(join(f.root, 'docs/sot.md'), sources['docs/sot.md']!.replace('plan.md', 'proposal.md'));
  const renamedSha = await f.commit();
  const renamed = await extractDocumentEvidence(f.repository, f.context(renamedSha), f.options);
  expect(renamed.classification.policyDigest).toBe(original.classification.policyDigest);
  expect(renamed.facts.some(fact => [fact.subject.id, fact.object.id].includes('document:docs/plan.md'))).toBe(false);
  expect(renamed.facts.find(fact => fact.provenance.path === 'docs/proposal.md' && fact.predicate === 'contains'))
    .toMatchObject({ object: { id: 'document:docs/proposal.md', kind: 'Document' }, sourceRole: 'plan',
      sourceOwnership: { status: 'resolved' }, provenance: { digest: sha256(sources['docs/plan.md']!), commitSha: renamedSha } });
  await rm(join(f.root, 'docs/sot.md')); await rm(join(f.root, 'checks/review.md'));
  const deletedSha = await f.commit();
  const deleted = await extractDocumentEvidence(f.repository, f.context(deletedSha), {
    ...f.options, entryPoints: ['docs/proposal.md', 'checks/empty.md'] });
  expect(deleted.classification.policyDigest).toBe(original.classification.policyDigest);
  expect(deleted.facts.every(fact => fact.provenance.path !== 'docs/sot.md' && fact.provenance.path !== 'checks/review.md')).toBe(true);
  expect(deleted.facts.find(fact => fact.provenance.path === 'docs/proposal.md')?.sourceOwnership?.status).toBe('unavailable');
  expect(await new RdfEvidenceGraph(snapshot(f.context(deletedSha), deleted.facts)).validate()).toEqual({ conforms: true, issues: [] });
  expect(await extractDocumentEvidence(f.repository, f.context(), f.options)).toEqual(original);
  expect(stableJson(original)).toBe(originalBytes);
});
