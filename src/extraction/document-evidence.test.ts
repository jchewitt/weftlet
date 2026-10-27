import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import type { ExtractionContext, GraphFact, GraphSnapshot } from '@weftlet/core';
import { RdfEvidenceGraph } from '../graph/rdf.js';
import { sha256 } from '../infrastructure/util.js';
import { GitRepository } from '../repository/git.js';
import { documentEvidenceExtractorIdentity, extractDocumentEvidence } from './document-evidence.js';
import type { DocumentClassificationPolicy } from './document-classification.js';

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

async function fixture(sources: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-document-evidence-'));
  roots.push(root);
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(root, '.gitignore'), '.context-graph/\n');
  for (const [path, content] of Object.entries(sources)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0', '--no-optional-locks', ...args], { cwd: root })).stdout.trim();
  await git('init', '--quiet');
  await git('add', '.');
  await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public document evidence');
  const context: ExtractionContext = { repositoryRoot: root, repositoryId: 'public/document-evidence',
    ref: 'HEAD', commitSha: await git('rev-parse', 'HEAD'), snapshotId: 'document-evidence-snapshot',
    changedPaths: [], deletedPaths: [], renamedPaths: {} };
  return { root, git, context, repository: new GitRepository(root) };
}

function graph(facts: readonly GraphFact[], context: ExtractionContext): RdfEvidenceGraph {
  const snapshot: GraphSnapshot = { facts, invariants: [], runtimeEvidence: [], unresolved: [], manifest: {
    schemaVersion: 1, repositoryId: context.repositoryId, ref: context.ref, commitSha: context.commitSha,
    snapshotId: context.snapshotId, scope: ['docs'], ontologyVersion: 'public-fixture',
    extractorVersions: { [documentEvidenceExtractorIdentity.id]: documentEvidenceExtractorIdentity.version },
    semanticModel: 'none', semanticPromptVersion: 'none', generatedAt: '2026-10-27T00:00:00Z',
    contentDigest: 'fixture', semanticArtifactKeys: [], scipIndexDigest: 'none', rdfDigest: 'fixture',
  } };
  return new RdfEvidenceGraph(snapshot);
}

it('extracts committed presence and links with separate validation metadata without touching working files or saved evidence', async () => {
  const sources = {
    'docs/owner.md': '# Owner\n[Notes](notes.md)\n[Empty](empty.md) [Prose](prose.md)\n' +
      '[Worker](../src/worker.ts)\n[Checks](../src/worker.test.ts)\n',
    'docs/notes.md': '# Release notes\nThe public check completed.\n',
    'docs/empty.md': '', 'docs/prose.md': '# Supporting reference without links\n',
    'src/worker.ts': 'export const work = () => true;\n', 'src/worker.test.ts': '// Public test fixture.\n',
  };
  const { root, git, context, repository } = await fixture(sources);
  await writeFile(join(root, 'docs/notes.md'), '# Dirty prose must not be classified as committed evidence\n');
  await mkdir(join(root, '.context-graph'));
  await writeFile(join(root, '.context-graph/snapshot.json'), '{"retained":true}\n');
  const index = await readFile(join(root, '.git/index'));
  const status = await git('status', '--porcelain=v1');
  const read = vi.spyOn(repository, 'readFileAt');
  const result = await extractDocumentEvidence(repository, context, {
    entryPoints: ['docs/owner.md'], approvedIntentSources: ['docs/owner.md', 'docs/notes.md'],
    documentPolicy: { schemaVersion: 1, roles: [
      { id: 'notes-role', pattern: 'docs/notes.md', role: 'validation' },
      { id: 'empty-role', pattern: 'docs/empty.md', role: 'reference' },
      { id: 'prose-role', pattern: 'docs/prose.md', role: 'reference' },
    ], owners: [{ id: 'owner', pattern: 'docs/owner.md', ownerDocument: 'docs/owner.md' }] },
  });
  expect(result.traversal.coverage.complete).toBe(true);
  expect(result.classification.complete).toBe(true);
  expect(result.diagnostics).toEqual([]);
  expect(result.facts).toHaveLength(9);
  expect(read.mock.calls).toHaveLength(4);
  expect(read.mock.calls.every(([sha, path]) => sha === context.commitSha && path.startsWith('docs/'))).toBe(true);
  const presence = result.facts.filter(fact => fact.predicate === 'contains');
  expect(presence.map(fact => fact.object.label).sort()).toEqual(Object.keys(sources).filter(path => path.startsWith('docs/')).sort());
  for (const fact of presence) {
    expect(fact.subject).toEqual({ id: 'project:public/document-evidence', kind: 'Project', label: 'public/document-evidence' });
    expect(fact.object.kind).toBe('Document');
    expect(fact.provenance).toEqual({ path: fact.object.label, startLine: 1, endLine: 1,
      digest: sha256(sources[fact.object.label as keyof typeof sources]), commitSha: context.commitSha });
  }
  expect(presence.find(fact => fact.object.label === 'docs/notes.md')).toMatchObject({
    sourceRole: 'validation', sourceAuthority: 'declared', sourceOwnership: { status: 'not-required', ownerDocuments: [], mappingIds: [] },
  });
  expect(result.facts.find(fact => fact.object.label === 'src/worker.ts')?.object.kind).toBe('Component');
  expect(result.facts.find(fact => fact.object.label === 'src/worker.test.ts')?.object.kind).toBe('Evidence');
  for (const fact of result.facts) {
    expect(fact).toMatchObject({ extractor: documentEvidenceExtractorIdentity, authority: 'inferred',
      extractionReview: 'deterministic', confidence: 1, snapshotId: context.snapshotId,
      sourcePolicyDigest: result.classification.policyDigest });
    expect(['contains', 'references']).toContain(fact.predicate);
    expect(fact.subject.attributes).toBeUndefined();
    expect(fact.object.attributes).toBeUndefined();
  }
  const rdf = graph(result.facts, context);
  expect(await rdf.validate()).toEqual({ conforms: true, issues: [] });
  expect(await rdf.facts()).toEqual(result.facts);
  expect(await readFile(join(root, '.git/index'))).toEqual(index);
  expect(await git('status', '--porcelain=v1')).toBe(status);
  expect(await readdir(join(root, '.context-graph'))).toEqual(['snapshot.json']);
  expect(await readFile(join(root, '.context-graph/snapshot.json'), 'utf8')).toBe('{"retained":true}\n');
});

it('retains reference declaration and each distinct use citation while deduplicating the shared declaration', async () => {
  const content = '# Links\n[First][child]\n[Second][child]\n[Direct](child.md)\n\n[child]: child.md\n';
  const { context, repository } = await fixture({ 'docs/index.md': content, 'docs/child.md': '' });
  const result = await extractDocumentEvidence(repository, context, { entryPoints: ['docs/index.md'] });
  const links = result.facts.filter(fact => fact.predicate === 'references');
  expect(links).toHaveLength(4);
  expect(links.map(fact => fact.provenance.startLine).sort((a, b) => a - b)).toEqual([2, 3, 4, 6]);
  for (const fact of links) {
    expect(fact.subject).toEqual({ id: 'document:docs/index.md', kind: 'Document', label: 'docs/index.md' });
    expect(fact.object).toEqual({ id: 'document:docs/child.md', kind: 'Document', label: 'docs/child.md' });
    expect(fact.provenance).toEqual({ path: 'docs/index.md', startLine: fact.provenance.startLine,
      endLine: fact.provenance.startLine, digest: sha256(content), commitSha: context.commitSha });
  }
  expect(new Set(links.map(fact => fact.id)).size).toBe(4);
  expect(result.classification.complete).toBe(false);
  expect(result.diagnostics.some(diagnostic => diagnostic.kind === 'missingIntent')).toBe(true);
});

it('reports unresolved links with exact source citations instead of emitting guessed relationships or approvals', async () => {
  const content = '[Missing](missing.md)\n[Outside](../elsewhere.md)\n[Directory](nested/)\n[Ambiguous][choice]\n\n' +
    '[choice]: first.md\n[choice]: second.md\n[Remote](https://example.invalid/rule.md)\n' +
    '[Fragment](#local)\n[Escape](../../rule.md)\n[Bad](bad%ZZ.md)\n';
  const { context, repository } = await fixture({ 'docs/index.md': content, 'docs/first.md': '',
    'docs/second.md': '', 'docs/nested/child.md': '', 'elsewhere.md': '' });
  const result = await extractDocumentEvidence(repository, context, { entryPoints: ['docs/index.md'], roots: ['docs'],
    documentPolicy: { schemaVersion: 1, roles: [{ id: 'reference', pattern: 'docs/index.md', role: 'reference' }] } });
  expect(result.facts).toHaveLength(1);
  expect(result.facts[0]?.predicate).toBe('contains');
  expect(result.traversal.coverage.complete).toBe(false);
  expect(result.traversal.links.map(link => link.status)).toEqual([
    'missing', 'outside-scope', 'directory', 'ambiguous', 'external', 'fragment', 'outside-repository', 'malformed',
  ]);
  expect(result.diagnostics).toHaveLength(6);
  expect(result.diagnostics.every(diagnostic => diagnostic.kind === 'implementationGaps' && diagnostic.evidenceScope === 'source')).toBe(true);
  const ambiguity = result.diagnostics.find(diagnostic => diagnostic.reason.includes('(ambiguous)'));
  expect(ambiguity?.provenance.map(citation => citation.startLine).sort((a, b) => a - b)).toEqual([4, 6, 7]);
  for (const diagnostic of result.diagnostics) for (const citation of diagnostic.provenance) {
    expect(citation).toMatchObject({ path: 'docs/index.md', digest: sha256(content), commitSha: context.commitSha });
  }
  expect(result.classification.complete).toBe(true);
  expect(await graph(result.facts, context).validate()).toEqual({ conforms: true, issues: [] });
});

it('keeps unread documents unavailable for ownership without inventing presence facts or losing the read frontier', async () => {
  const { context, repository } = await fixture({ 'docs/plan.md': '[Owner](owner.md)\n', 'docs/owner.md': '# Approved owner\n' });
  const result = await extractDocumentEvidence(repository, context, {
    entryPoints: ['docs/plan.md'], maxReadDocuments: 1, approvedIntentSources: ['docs/owner.md'],
    documentPolicy: { schemaVersion: 1, roles: [{ id: 'plan', pattern: 'docs/plan.md', role: 'plan' }],
      owners: [{ id: 'owner', pattern: 'docs/plan.md', ownerDocument: 'docs/owner.md' }] },
  });
  expect(result.traversal.coverage).toEqual({ complete: false, unvisited: ['docs/owner.md'] });
  expect(result.classification.documents.map(document => document.path)).toEqual(['docs/plan.md']);
  expect(result.classification.complete).toBe(false);
  expect(result.facts).toHaveLength(2);
  expect(result.facts.filter(fact => fact.predicate === 'contains').map(fact => fact.object.id)).toEqual(['document:docs/plan.md']);
  for (const fact of result.facts) expect(fact).toMatchObject({ sourceRole: 'plan', sourceAuthority: 'inferred',
    sourceOwnership: { status: 'unavailable', ownerDocuments: ['docs/owner.md'], mappingIds: ['owner'] } });
  expect(result.diagnostics.some(diagnostic => diagnostic.reason.includes('document-read-count'))).toBe(true);
  expect(result.diagnostics.find(diagnostic => diagnostic.reason.includes('ownership-unavailable'))).toMatchObject({
    kind: 'missingIntent', evidenceScope: 'source', provenance: [{ path: 'docs/plan.md', startLine: 1, endLine: 1,
      digest: sha256('[Owner](owner.md)\n'), commitSha: context.commitSha }],
  });
});

it('uses classification and approval policy in stable fact identities without treating snapshot labels as source changes', async () => {
  const { context, repository } = await fixture({ 'docs/notes.md': 'Public reference.\n' });
  const policy: DocumentClassificationPolicy = { schemaVersion: 1,
    roles: [{ id: 'reference', pattern: 'docs/notes.md', role: 'reference' }] };
  const options = { entryPoints: ['docs/notes.md'], documentPolicy: policy };
  const first = await extractDocumentEvidence(repository, context, options);
  expect(await extractDocumentEvidence(repository, context, options)).toEqual(first);
  const nextSnapshot = await extractDocumentEvidence(repository, { ...context, snapshotId: 'next' }, options);
  expect(nextSnapshot.facts.map(fact => fact.id)).toEqual(first.facts.map(fact => fact.id));
  expect(nextSnapshot.facts.every(fact => fact.snapshotId === 'next')).toBe(true);
  const approved = await extractDocumentEvidence(repository, context, { ...options, approvedIntentSources: ['docs/notes.md'] });
  const validation = await extractDocumentEvidence(repository, context, { ...options,
    documentPolicy: { schemaVersion: 1, roles: [{ id: 'reference', pattern: 'docs/notes.md', role: 'validation' }] } });
  for (const changed of [approved, validation]) {
    expect(changed.classification.policyDigest).not.toBe(first.classification.policyDigest);
    expect(changed.facts[0]?.id).not.toBe(first.facts[0]?.id);
    expect(changed.facts[0]?.provenance).toEqual(first.facts[0]?.provenance);
    expect(changed.facts[0]?.authority).toBe('inferred');
    expect(changed.facts[0]?.extractionReview).toBe('deterministic');
  }
});

it('retains structural presence and scoped ownership ambiguity without choosing or inferring an owner edge', async () => {
  const { context, repository } = await fixture({ 'docs/plan.md': '[A](a.md)\n[B](b.md)\n',
    'docs/a.md': '# A\n', 'docs/b.md': '# B\n' });
  const result = await extractDocumentEvidence(repository, context, { entryPoints: ['docs/plan.md'],
    approvedIntentSources: ['docs/a.md', 'docs/b.md'], documentPolicy: { schemaVersion: 1,
      roles: [{ id: 'plan', pattern: 'docs/plan.md', role: 'plan' }], owners: [
        { id: 'a', pattern: 'docs/plan.md', ownerDocument: 'docs/a.md' },
        { id: 'b', pattern: 'docs/plan.md', ownerDocument: 'docs/b.md' },
      ] },
  });
  expect(result.facts.filter(fact => fact.provenance.path === 'docs/plan.md').every(fact =>
    fact.sourceOwnership?.status === 'ambiguous' && fact.sourceAuthority === 'inferred')).toBe(true);
  expect(result.diagnostics.find(diagnostic => diagnostic.reason.includes('ownership-ambiguous'))?.kind).toBe('ambiguousIntent');
  expect(result.facts.every(fact => ['contains', 'references'].includes(fact.predicate))).toBe(true);
  expect(result.classification.complete).toBe(false);
  expect(await graph(result.facts, context).validate()).toEqual({ conforms: true, issues: [] });
});
