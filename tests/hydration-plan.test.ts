import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExtractionContext } from '@weftlet/core';
import { planHydration } from '../src/application/hydration-plan.js';
import { loadConfig, type ContextGraphConfig } from '../src/configuration/config.js';
import { resolveStorageRoot } from '../src/configuration/cache.js';
import { createSemanticExtractor } from '../src/extraction/providers.js';
import { SemanticHydrator, type SemanticOutput } from '../src/extraction/semantic.js';
import { GitRepository } from '../src/repository/git.js';
import { SemanticArtifactStore } from '../src/storage/storage.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';

const execute = promisify(execFile);
const roots: string[] = [];
const sourceContents = {
  'docs/owner.md': 'semantic-id: public-owner\n# Queue owner\nThe café queue implements dispatch.\n',
  'docs/draft.md': 'semantic-id: public-draft\n# Draft queue note\nPUBLIC_BODY_MARKER_NOT_FOR_PREVIEW_OUTPUT\n',
  'docs/validation/checks.md': 'semantic-id: public-validation\n# Recorded checks\nThe fixture checks dispatch.\n',
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

async function fixture(overrides: Partial<ContextGraphConfig> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-hydration-plan-'));
  roots.push(root);
  await Promise.all(['docs/validation', 'src'].map((path) => mkdir(join(root, path), { recursive: true })));
  await writeFile(join(root, '.gitignore'), '.context-graph\n');
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(root, 'README.md'), '# Unselected public README\n');
  await writeFile(join(root, 'src/worker.ts'), 'export const dispatch = (job: string) => job.trim();\n');
  await writeFile(join(root, 'docs/notes.json'), '{"not":"a semantic document"}\n');
  for (const [path, content] of Object.entries(sourceContents)) await writeFile(join(root, path), content);
  const template: ContextGraphConfig = JSON.parse(await readFile(
    new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  const config: ContextGraphConfig = {
    ...template,
    repositoryId: 'public/no-model-preview',
    adapter: './unavailable-adapter.mjs',
    semanticSources: ['docs'],
    approvedIntentSources: ['docs/owner.md', 'docs/validation/**'],
    evidenceRoots: ['docs/validation'],
    semantic: { ...template.semantic, provider: 'module', providerModule: './unavailable-provider.mjs',
      providerIdentity: 'public-preview-provider:1', maxDocuments: 8, maxSourceBytes: 65_536 },
    scip: { version: '0.4.0', command: 'unavailable-scip-executable', args: [] },
    ontology: { backend: 'opencaesar', toolVersion: 'public-fixture-oml',
      projectPath: 'unavailable-ontology', containerImage: 'public-fixture-unavailable:1' },
    runtimeEvidence: ['unavailable-runtime/*.json'],
    ...overrides,
  };
  const configPath = join(root, 'context-graph.config.json');
  await writeFile(configPath, JSON.stringify(config));
  // Keep fixture commits from leaving detached maintenance processes racing teardown.
  const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0', '--no-optional-locks', ...args], { cwd: root })).stdout.trim();
  const commit = async () => {
    await git('add', '.');
    await git('-c', 'user.name=Public Preview Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'public preview fixture');
    return git('rev-parse', 'HEAD');
  };
  await git('init', '--quiet');
  const commitSha = await commit();
  return { root, config, configPath, commitSha, git, commit };
}

async function seedArtifacts(configPath: string) {
  const { config, repositoryRoot } = await loadConfig(configPath);
  const repository = new GitRepository(repositoryRoot);
  const commitSha = await repository.resolveRef('HEAD');
  const context: ExtractionContext = { repositoryRoot, repositoryId: config.repositoryId,
    ref: 'HEAD', commitSha, snapshotId: 'preview-fixture', changedPaths: [], deletedPaths: [], renamedPaths: {} };
  const sources = await repository.semanticSources(context, config.semanticSources);
  const storageRoot = resolveStorageRoot(repositoryRoot, config);
  const store = new SemanticArtifactStore(storageRoot);
  const identity = createSemanticExtractor(config.semantic, repositoryRoot).identity;
  let extractions = 0;
  const semantic = new SemanticHydrator(config.semantic, store, {
    identity,
    async extract() {
      extractions++;
      const parsed: SemanticOutput = { assertions: [{
        subject: { id: 'capability:dispatch', kind: 'Capability', label: 'Dispatch' },
        predicate: 'implementedBy', object: { id: 'component:worker', kind: 'Component', label: 'Worker' },
        citation: { startLine: 3, endLine: 3 }, confidence: 0.95,
      }], oml: '' };
      return { parsed, rawModelOutput: JSON.stringify(parsed) };
    },
  });
  const artifacts = await Promise.all(sources.map(async (source) => (await semantic.hydrate(source, context)).artifact));
  return { sources, storageRoot, artifacts, semantic, context, extractions: () => extractions };
}

async function filesUnder(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function visit(relative: string) {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path);
      else files[path] = sha256(await readFile(join(root, path)));
    }
  }
  await visit('');
  return files;
}

describe('no-model hydration preview', () => {
  it('uses committed documents and explicit classification while leaving the checkout, index and storage untouched', async () => {
    const { root, config, configPath, commitSha, git } = await fixture();
    await writeFile(join(root, 'docs/owner.md'), '# Unsaved owner edit\n');
    await writeFile(join(root, 'docs/untracked.md'), '# Untracked draft\n');
    const index = await readFile(join(root, '.git/index'));
    const files = await filesUnder(root);
    const before = await git('status', '--porcelain=v1', '--untracked-files=all');
    const plan = await planHydration(configPath);
    expect(plan).toMatchObject({ ready: true, ref: 'HEAD', commitSha, repositoryId: config.repositoryId,
      configurationDigest: sha256(stableJson(config)), scope: { mode: 'configured', selectors: ['docs'], complete: true },
      estimates: { reusableArtifacts: 0, extractions: 3, unknownArtifacts: 0 },
      budgets: { maxDocuments: 8, maxSourceBytes: 65_536, selectedDocuments: 3,
        totalSourceBytes: Object.values(sourceContents).reduce((total, content) => total + Buffer.byteLength(content), 0) } });
    expect(plan.documents.map((document) => document.path)).toEqual(Object.keys(sourceContents).sort());
    for (const document of plan.documents) {
      const content = sourceContents[document.path as keyof typeof sourceContents];
      expect(document).toMatchObject({ sourceDigest: sha256(content), bytes: Buffer.byteLength(content),
        lines: content.split('\n').length, selectedBy: ['docs'], extractionReview: 'unreviewed', cache: { status: 'miss' } });
    }
    expect(plan.documents.find((document) => document.path === 'docs/owner.md')).toMatchObject({
      role: 'semantic-document', sourceAuthority: 'declared' });
    expect(plan.documents.find((document) => document.path === 'docs/draft.md')).toMatchObject({
      role: 'semantic-document', sourceAuthority: 'inferred' });
    expect(plan.documents.find((document) => document.path === 'docs/validation/checks.md')).toMatchObject({
      role: 'validation-evidence', sourceAuthority: 'declared', extractionReview: 'unreviewed' });
    expect(plan.selections).toContainEqual(expect.objectContaining({ selector: 'docs', status: 'matched',
      paths: Object.keys(sourceContents).sort(), excludedPaths: ['docs/notes.json'] }));
    expect(plan.excludedWorkingChanges).toEqual(['docs/owner.md', 'docs/untracked.md']);
    expect(JSON.stringify(plan)).not.toContain('PUBLIC_BODY_MARKER_NOT_FOR_PREVIEW_OUTPUT');
    expect(plan.assumptions.length).toBeGreaterThan(0);
    await expect(readdir(join(root, '.context-graph'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(root, '.git/index'))).toEqual(index);
    expect(await filesUnder(root)).toEqual(files);
    expect(await git('status', '--porcelain=v1', '--untracked-files=all')).toBe(before);
  });

  it('treats an empty configured scope as empty even when the repository contains Markdown', async () => {
    const { root, configPath } = await fixture({ semanticSources: [] });
    const before = await filesUnder(root);
    const plan = await planHydration(configPath);
    expect(plan.ready).toBe(true);
    expect(plan.documents).toEqual([]);
    expect(plan.selections).toEqual([]);
    expect(plan.estimates).toEqual({ reusableArtifacts: 0, extractions: 0, unknownArtifacts: 0 });
    expect(plan.budgets.selectedDocuments).toBe(0);
    expect(plan.budgets.totalSourceBytes).toBe(0);
    await expect(readdir(join(root, '.context-graph'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await filesUnder(root)).toEqual(before);
  });

  it('predicts reusable artifacts produced by the actual hydrator and preserves saved evidence during planning', async () => {
    const { root, config, configPath } = await fixture();
    const seeded = await seedArtifacts(configPath);
    // Pin the released 0.2.1 contract independently of the helper used by both
    // preview and hydration, so an accidental shared key change cannot pass parity.
    const modelIdentity = `${config.semantic.providerIdentity}:${sha256(stableJson(config.semantic))}:contract-v2`;
    for (const source of seeded.sources) {
      const expectedKey = sha256(stableJson({
        stableSemanticId: source.stableSemanticId,
        sourceDigest: source.digest,
        promptVersion: config.semantic.promptVersion,
        extractorVersion: config.semantic.extractorVersion,
        modelIdentity,
        adapterVersion: config.semantic.adapterVersion,
        ontologyVersion: config.semantic.ontologyVersion,
        minimumConfidence: config.semantic.minimumConfidence,
        failOnUnresolved: config.semantic.failOnUnresolved,
        forceRevision: undefined,
        diagnosticContractVersion: 3,
        repositoryNodeIdentityVersion: 1,
      }));
      expect(seeded.artifacts.find((artifact) => artifact.stableSemanticId === source.stableSemanticId)?.key).toBe(expectedKey);
    }
    await mkdir(join(seeded.storageRoot, 'heads'), { recursive: true });
    await writeFile(join(seeded.storageRoot, 'heads/default.json'), '{"snapshotId":"retained-snapshot"}\n');
    const before = await filesUnder(root);
    const plan = await planHydration(configPath);
    expect(plan.ready).toBe(true);
    expect(plan.estimates).toEqual({ reusableArtifacts: 3, extractions: 0, unknownArtifacts: 0 });
    expect(plan.documents.every((document) => document.cache.status === 'hit')).toBe(true);
    expect(plan.documents.map((document) => document.cache.key).sort()).toEqual(seeded.artifacts.map((artifact) => artifact.key).sort());
    for (const source of seeded.sources) expect((await seeded.semantic.hydrate(source, seeded.context)).reused).toBe(true);
    expect(seeded.extractions()).toBe(3);
    expect(await filesUnder(root)).toEqual(before);
  });

  it('reports all budget violations without truncating the selected sources', async () => {
    const { config, configPath } = await fixture();
    await writeFile(configPath, JSON.stringify({ ...config, semantic: { ...config.semantic, maxDocuments: 1, maxSourceBytes: 32 } }));
    const plan = await planHydration(configPath);
    expect(plan.ready).toBe(false);
    expect(plan.documents.map((document) => document.path)).toEqual(Object.keys(sourceContents).sort());
    expect(plan.budgets).toMatchObject({ maxDocuments: 1, maxSourceBytes: 32, selectedDocuments: 3 });
    expect(plan.estimates).toEqual({ reusableArtifacts: 0, extractions: 3, unknownArtifacts: 0 });
    expect(plan.issues.filter((issue) => issue.severity === 'error').length).toBeGreaterThanOrEqual(2);
    expect(plan.issues.flatMap((issue) => issue.paths)).toEqual(expect.arrayContaining(Object.keys(sourceContents)));
  });

  it('distinguishes missing selectors from selectors containing no supported documents', async () => {
    const { configPath } = await fixture({ semanticSources: ['docs/owner.md', 'docs/missing.md', 'src'] });
    const plan = await planHydration(configPath);
    expect(plan.ready).toBe(false);
    expect(plan.scope.complete).toBe(false);
    expect(plan.documents.map((document) => document.path)).toEqual(['docs/owner.md']);
    expect(plan.selections).toContainEqual(expect.objectContaining({ selector: 'docs/missing.md', status: 'missing', paths: [] }));
    expect(plan.selections).toContainEqual(expect.objectContaining({ selector: 'src', status: 'no-documents', paths: [], excludedPaths: ['src/worker.ts'] }));
    expect(plan.issues.filter((issue) => issue.severity === 'warning').length).toBeGreaterThanOrEqual(2);
    expect(plan.issues.some((issue) => issue.severity === 'error')).toBe(false);
  });

  it('identifies malformed, structurally corrupt and digest-mismatched artifacts without reusing or rewriting them', async () => {
    const { root, configPath } = await fixture();
    const seeded = await seedArtifacts(configPath);
    const malformed = seeded.artifacts[0]!;
    const invalid = seeded.artifacts[1]!;
    const mismatched = seeded.artifacts[2]!;
    const artifactPath = (key: string) => join(seeded.storageRoot, 'artifacts/semantic', `${key}.json`);
    await writeFile(artifactPath(malformed.key), '{broken-json');
    await writeFile(artifactPath(invalid.key), JSON.stringify({ key: invalid.key, facts: null }));
    await writeFile(artifactPath(mismatched.key), JSON.stringify({ ...mismatched, outputDigest: '0'.repeat(64) }));
    const before = await filesUnder(root);
    const plan = await planHydration(configPath);
    expect(plan.ready).toBe(false);
    expect(plan.documents.every((document) => document.cache.status === 'corrupt')).toBe(true);
    expect(plan.estimates).toEqual({ reusableArtifacts: 0, extractions: 0, unknownArtifacts: 3 });
    expect(await filesUnder(root)).toEqual(before);
    expect(seeded.extractions()).toBe(3);
  });

  it('reports inaccessible artifact entries separately from known cache misses', async () => {
    const { root, configPath } = await fixture({ semanticSources: ['docs/owner.md'] });
    const seeded = await seedArtifacts(configPath);
    const artifact = seeded.artifacts[0]!;
    const path = join(seeded.storageRoot, 'artifacts/semantic', `${artifact.key}.json`);
    await rm(path);
    await mkdir(path);
    const before = await filesUnder(root);
    const plan = await planHydration(configPath);
    expect(plan.ready).toBe(false);
    expect(plan.documents[0]?.cache.status).toBe('unavailable');
    expect(plan.estimates).toEqual({ reusableArtifacts: 0, extractions: 0, unknownArtifacts: 1 });
    expect(await filesUnder(root)).toEqual(before);
  });

  it('separates changed semantic identity, changed committed bytes and forced extraction from reusable artifacts', async () => {
    const { root, config, configPath, commit } = await fixture();
    const seeded = await seedArtifacts(configPath);
    const forced = await planHydration(configPath, { forceSemantic: true });
    expect(forced.documents.every((document) => document.cache.status === 'forced' && document.cache.key === undefined)).toBe(true);
    expect(forced.estimates).toEqual({ reusableArtifacts: 0, extractions: 3, unknownArtifacts: 0 });
    await writeFile(configPath, JSON.stringify({ ...config, semantic: { ...config.semantic, promptVersion: 'public-preview-v2' } }));
    const changedIdentity = await planHydration(configPath);
    expect(changedIdentity.documents.every((document) => document.cache.status === 'miss')).toBe(true);
    expect(changedIdentity.documents.every((document) => !seeded.artifacts.some((artifact) => artifact.key === document.cache.key))).toBe(true);
    await writeFile(configPath, JSON.stringify(config));
    await writeFile(join(root, 'docs/owner.md'), `${sourceContents['docs/owner.md']}A committed requirement changed.\n`);
    const changedCommit = await commit();
    const changedSource = await planHydration(configPath);
    expect(changedSource.commitSha).toBe(changedCommit);
    expect(changedSource.estimates).toEqual({ reusableArtifacts: 2, extractions: 1, unknownArtifacts: 0 });
    expect(changedSource.documents.find((document) => document.path === 'docs/owner.md')?.cache.status).toBe('miss');
    expect(seeded.extractions()).toBe(3);
  });

  it('reports duplicate stable identities across all selected documents before extraction', async () => {
    const { root, configPath, commit } = await fixture();
    await writeFile(join(root, 'docs/draft.md'), sourceContents['docs/draft.md'].replace('public-draft', 'public-owner'));
    await commit();
    const plan = await planHydration(configPath);
    expect(plan.ready).toBe(false);
    expect(plan.documents).toHaveLength(3);
    expect(plan.issues.some((issue) => issue.severity === 'error' &&
      issue.paths.includes('docs/owner.md') && issue.paths.includes('docs/draft.md'))).toBe(true);
  });

  it('uses the requested committed agent scope and reports documents omitted by its existing reference limit', async () => {
    const { root, configPath, commit } = await fixture({ agentContext: {
      alwaysSemanticSources: [], followDocumentReferences: true,
      includeMatchingEvidence: false, maxReferencedDocuments: 1,
    } });
    await writeFile(join(root, 'docs/owner.md'), `${sourceContents['docs/owner.md']}See docs/draft.md and docs/validation/checks.md.\n`);
    const requestedCommit = await commit();
    await writeFile(join(root, 'docs/owner.md'), sourceContents['docs/owner.md']);
    await commit();
    const plan = await planHydration(configPath, { ref: requestedCommit, request: { ownerDocument: 'docs/owner.md' } });
    expect(plan.commitSha).toBe(requestedCommit);
    expect(plan.ready).toBe(false);
    expect(plan.scope).toMatchObject({ mode: 'agent', complete: false,
      omittedDocuments: ['docs/validation/checks.md'] });
    expect(plan.documents.map((document) => document.path)).toEqual(['docs/draft.md', 'docs/owner.md']);
    expect(plan.issues.some((issue) => issue.severity === 'warning' && issue.paths.includes('docs/validation/checks.md'))).toBe(true);
  });
});
