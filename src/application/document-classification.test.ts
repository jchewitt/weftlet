import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { loadConfig, type ContextGraphConfig } from '../configuration/config.js';
import { GitRepository, type GitTreeEntry } from '../repository/git.js';
import { classifyDocumentSources, type DocumentClassificationPolicy } from '../extraction/document-classification.js';
import { planDocumentCoverage } from './document-coverage.js';

vi.mock('../configuration/config.js', () => ({ loadConfig: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it('classifies an entire unread frontier above the classifier batch bound without losing coverage or ownership', async () => {
  const commitSha = 'a'.repeat(40);
  const ownerPath = 'docs/z-owner.md';
  const childPaths = Array.from({ length: 10_005 }, (_, index) => `docs/child-${String(index).padStart(5, '0')}.md`);
  const content = childPaths.map(path => `[child](${path.slice('docs/'.length)})`).join('\n');
  const config = JSON.parse(readFileSync(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8')) as ContextGraphConfig;
  const configured = { ...config, approvedIntentSources: [ownerPath], evidenceRoots: [],
    semantic: { ...config.semantic, maxDocuments: 10_000, maxSourceBytes: 4 * 1024 * 1024 } };
  vi.mocked(loadConfig).mockResolvedValue({ config: configured, configPath: '/unused/config.json', repositoryRoot: '/unused' });
  vi.spyOn(GitRepository.prototype, 'resolveRef').mockResolvedValue(commitSha);
  vi.spyOn(GitRepository.prototype, 'workingChanges').mockResolvedValue(['docs/uncommitted.md']);
  const entries: GitTreeEntry[] = [
    { path: 'docs', mode: '040000', type: 'tree', objectId: commitSha },
    { path: ownerPath, mode: '100644', type: 'blob', objectId: commitSha, size: Buffer.byteLength(content) },
    ...childPaths.map(path => ({ path, mode: '100644', type: 'blob' as const, objectId: commitSha, size: 10 })),
  ];
  vi.spyOn(GitRepository.prototype, 'listEntriesAt').mockResolvedValue(entries);
  const reads = vi.spyOn(GitRepository.prototype, 'readFileAt').mockImplementation(async (sha, path) => {
    expect(sha).toBe(commitSha);
    if (path !== ownerPath) throw new Error('Unread frontier content must not be requested');
    return content;
  });
  const documentPolicy: DocumentClassificationPolicy = { schemaVersion: 1,
    roles: [{ id: 'plans', pattern: 'docs/child-*.md', role: 'plan' }],
    owners: [
      { id: 'source-owner', pattern: 'docs/**', ownerDocument: ownerPath },
      { id: 'missing-owner', pattern: childPaths.at(-1)!, ownerDocument: 'docs/missing.md' },
    ] };
  const report = await planDocumentCoverage('/unused/config.json', {
    ref: commitSha, entryPoints: [ownerPath], maxReadDocuments: 1, documentPolicy,
  });
  expect(reads).toHaveBeenCalledTimes(1);
  expect(report).toMatchObject({ ready: false, changesHydrationSelection: false,
    coverage: { complete: false, unvisited: childPaths },
    counters: { readDocuments: 1, discoveredDocuments: 10_006 },
    budgets: { documents: 10_006, withinLimits: false },
    excludedWorkingChanges: ['docs/uncommitted.md'], classification: { complete: false } });
  const expectedPaths = [...childPaths, ownerPath].sort();
  expect(report.documents.map(document => document.path)).toEqual(expectedPaths);
  expect(report.classification.documents.map(document => document.path)).toEqual(expectedPaths);
  expect(report.documents.filter(document => document.status === 'read').map(document => document.path)).toEqual([ownerPath]);
  expect(report.documents.filter(document => document.status === 'unread')).toHaveLength(childPaths.length);
  expect(report.documents.slice(0, -2).every(document => document.ownership.status === 'resolved' &&
    document.sourceAuthority === 'inferred' && document.approvedBy.length === 0)).toBe(true);
  expect(report.documents.at(-2)).toMatchObject({ path: childPaths.at(-1), ownership: { status: 'ambiguous',
    ownerDocuments: ['docs/missing.md', ownerPath] } });
  expect(report.documents.at(-1)).toMatchObject({ path: ownerPath, sourceRole: 'intent',
    sourceAuthority: 'declared', ownership: { status: 'resolved' } });
  expect(report.classification.issues).toEqual([expect.objectContaining({ code: 'ownership-ambiguous',
    paths: [childPaths.at(-1), 'docs/missing.md', ownerPath] })]);
  const small = classifyDocumentSources([ownerPath], {
    approvedIntentSources: configured.approvedIntentSources, evidenceRoots: configured.evidenceRoots,
    availableDocuments: [ownerPath],
  }, documentPolicy);
  expect(report.classification.policyDigest).toBe(small.policyDigest);
  expect(report.classification.documents.at(-1)).toEqual(small.documents[0]);
});
