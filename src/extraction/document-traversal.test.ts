import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { expect, it, vi } from 'vitest';
import type { GitTreeEntry } from '../repository/git.js';
import { traverseDocuments, type DocumentTraversalOptions } from './document-traversal.js';

const sha = 'a'.repeat(40);
function fixture(contents: Record<string, string>, extra: readonly GitTreeEntry[] = []) {
  const directories = new Set<string>();
  for (const path of Object.keys(contents)) {
    let directory = posix.dirname(path);
    while (directory !== '.') { directories.add(directory); directory = posix.dirname(directory); }
  }
  const entries: GitTreeEntry[] = [
    ...[...directories].map(path => ({ path, mode: '040000', type: 'tree' as const, objectId: sha })),
    ...Object.entries(contents).map(([path, content]) => ({ path, mode: '100644', type: 'blob' as const,
      objectId: sha, size: Buffer.byteLength(content) })),
    ...extra,
  ];
  const repository = {
    listEntriesAt: vi.fn(async () => entries),
    readFileAt: vi.fn(async (_commit: string, path: string) => {
      if (!Object.hasOwn(contents, path)) throw new Error('No public fixture content');
      return contents[path]!;
    }),
  };
  return { repository, entries };
}
const options: DocumentTraversalOptions = { entryPoints: ['docs/owner.md'], roots: ['docs'] };

it('retains a complete cited closure across cycles/shared descendants and reads each committed document once', async () => {
  const contents = {
    'docs/owner.md': '# Owner\nprivate-body-not-in-report\n[B](b.md) and [C](c.md)\n',
    'docs/b.md': '[Owner](owner.md)\n[Contract](contract.md)\n',
    'docs/c.md': '[First][contract]\n[Second][contract]\n\n[contract]: contract.md\n',
    'docs/contract.md': '# Shared contract\n',
  };
  const { repository } = fixture(contents);
  const report = await traverseDocuments(repository, sha, options);
  expect(report.coverage).toEqual({ complete: true, unvisited: [] });
  expect(report.documents.map(document => document.path)).toEqual(['docs/b.md', 'docs/c.md', 'docs/contract.md', 'docs/owner.md']);
  expect(report.documents.every(document => document.status === 'read')).toBe(true);
  expect(report.documents.find(document => document.path === 'docs/contract.md')?.reachedBy).toEqual([
    { sourcePath: 'docs/b.md', startLine: 2, endLine: 2 },
    { sourcePath: 'docs/c.md', startLine: 4, endLine: 4, referenceStartLine: 1, referenceEndLine: 1 },
    { sourcePath: 'docs/c.md', startLine: 4, endLine: 4, referenceStartLine: 2, referenceEndLine: 2 },
  ]);
  expect(report.documents.find(document => document.path === 'docs/owner.md')).toMatchObject({
    entryPoint: true, digest: createHash('sha256').update(contents['docs/owner.md']).digest('hex'),
    reachedBy: [{ sourcePath: 'docs/b.md', startLine: 1, endLine: 1 }],
  });
  expect(repository.readFileAt.mock.calls.map(call => call[1])).toEqual(['docs/owner.md', 'docs/b.md', 'docs/c.md', 'docs/contract.md']);
  expect(repository.readFileAt.mock.calls.every(call => call[0] === sha)).toBe(true);
  expect(report.links).toHaveLength(6);
  expect(JSON.stringify(report)).not.toContain('private-body-not-in-report');
});

it('computes the complete closure before comparison with extraction document and byte budgets', async () => {
  const { repository } = fixture({ 'docs/owner.md': '[Next](next.md)\n', 'docs/next.md': '[Last](last.md)\n', 'docs/last.md': 'Large final prose.\n' });
  const report = await traverseDocuments(repository, sha, { ...options, maxDocuments: 1, maxSourceBytes: 1 });
  expect(report.coverage.complete).toBe(true);
  expect(report.documents).toHaveLength(3);
  expect(repository.readFileAt).toHaveBeenCalledTimes(3);
  expect(report.budgets).toMatchObject({ documents: 3, maxDocuments: 1, maxSourceBytes: 1, withinLimits: false });
  expect(report.issues.map(issue => issue.code)).toEqual(['document-budget', 'source-byte-budget']);
});

it('exposes every discovered unread document when the traversal read-count safety limit stops closure', async () => {
  const { repository } = fixture({ 'docs/owner.md': '[B](b.md) [C](c.md)',
    'docs/b.md': '[Unknown yet](later.md)', 'docs/c.md': 'C', 'docs/later.md': 'later' });
  const report = await traverseDocuments(repository, sha, { ...options, maxReadDocuments: 1 });
  expect(report.coverage).toEqual({ complete: false, unvisited: ['docs/b.md', 'docs/c.md'] });
  expect(report.documents).toHaveLength(3);
  expect(report.documents.filter(document => document.status === 'unread')).toHaveLength(2);
  expect(repository.readFileAt).toHaveBeenCalledTimes(1);
  expect(report.issues.map(issue => issue.code)).toEqual(['document-read-count', 'document-read-count']);
});

it('uses committed blob sizes to stop oversized documents before any content read', async () => {
  const { repository, entries } = fixture({ 'docs/owner.md': 'small content that must never be read' });
  const index = entries.findIndex(entry => entry.path === 'docs/owner.md');
  entries[index] = { ...entries[index]!, size: 2 * 1024 * 1024 };
  const report = await traverseDocuments(repository, sha, options);
  expect(repository.readFileAt).not.toHaveBeenCalled();
  expect(report.coverage).toEqual({ complete: false, unvisited: ['docs/owner.md'] });
  expect(report.documents[0]).toMatchObject({ bytes: 2 * 1024 * 1024, status: 'unread' });
  expect(report.issues[0]?.code).toBe('document-read-bytes');
});

it('honors total read bytes without hiding the frontier or spending bytes on blocked documents', async () => {
  const owner = '[B](b.md) [C](c.md)';
  const { repository } = fixture({ 'docs/owner.md': owner, 'docs/b.md': 'B', 'docs/c.md': 'C' });
  const report = await traverseDocuments(repository, sha, { ...options, maxReadBytes: Buffer.byteLength(owner) });
  expect(report.coverage).toEqual({ complete: false, unvisited: ['docs/b.md', 'docs/c.md'] });
  expect(report.counters).toMatchObject({ readDocuments: 1, readBytes: Buffer.byteLength(owner), discoveredDocuments: 3 });
  expect(repository.readFileAt).toHaveBeenCalledTimes(1);
  expect(report.issues.every(issue => issue.code === 'total-read-bytes')).toBe(true);
});

it('reports every exclusion separately without following symlinks, gitlinks, directories or external URLs', async () => {
  const { repository } = fixture({
    'docs/owner.md': '[Missing](missing.md)\n[Outside](../other.md)\n[Directory](nested/)\n' +
      '[Symlink](link.md)\n[Submodule](module)\n[Malformed](bad%ZZ.md)\n[Escape](../../out.md)\n' +
      '[Remote](https://example.invalid/remote.md)\n[Fragment](#local)\n[Code](code.ts)\n',
    'docs/nested/file.md': '# Real directory child', 'docs/code.ts': 'export const value = 1;', 'other.md': '# Out of scope',
  }, [
    { path: 'docs/link.md', mode: '120000', type: 'blob', objectId: sha, size: 12 },
    { path: 'docs/module', mode: '160000', type: 'commit', objectId: sha },
  ]);
  const report = await traverseDocuments(repository, sha, options);
  expect(report.links.map(link => link.status)).toEqual(['missing', 'outside-scope', 'directory', 'symlink', 'submodule',
    'malformed', 'outside-repository', 'external', 'fragment', 'non-document']);
  expect(report.coverage.complete).toBe(false);
  expect(report.documents.map(document => document.path)).toEqual(['docs/owner.md']);
  expect(repository.readFileAt).toHaveBeenCalledTimes(1);
});

it('does not let a directory suffix turn an existing document into a traversable file', async () => {
  const { repository } = fixture({ 'docs/owner.md': '[Bad file](child.md/)\n[Root](/)\n', 'docs/child.md': 'child' });
  const report = await traverseDocuments(repository, sha, { entryPoints: ['docs/owner.md'] });
  expect(report.links.map(link => link.status)).toEqual(['unsupported', 'directory']);
  expect(repository.readFileAt).toHaveBeenCalledTimes(1);
  expect(report.coverage.complete).toBe(false);
});

it('bounds document traversal by roots while reporting committed code links outside them without reading code', async () => {
  for (const includeOutsideDocument of [false, true]) {
    const owner = '[Code](../src/worker.ts)' + (includeOutsideDocument ? '\n[Other intent](../outside/other.md)' : '');
    const { repository } = fixture({ 'docs/owner.md': owner,
      'src/worker.ts': 'export const implementation = "never read";', 'outside/other.md': '# Outside intent' });
    const report = await traverseDocuments(repository, sha, options);
    expect(report.links.map(link => link.status)).toEqual(includeOutsideDocument ? ['non-document', 'outside-scope'] : ['non-document']);
    expect(report.coverage.complete).toBe(!includeOutsideDocument);
    expect(report.documents.map(document => document.path)).toEqual(['docs/owner.md']);
    expect(repository.readFileAt.mock.calls).toEqual([[sha, 'docs/owner.md']]);
    expect(JSON.stringify(report)).not.toContain('never read');
  }
});

it('does not traverse a symlink or submodule ancestor when the linked suffix resembles a document', async () => {
  const { repository } = fixture({ 'docs/owner.md': '[Linked](linkDir/child.md) [Vendored](module/child.md)' }, [
    { path: 'docs/linkDir', mode: '120000', type: 'blob', objectId: sha, size: 12 },
    { path: 'docs/module', mode: '160000', type: 'commit', objectId: sha },
  ]);
  const report = await traverseDocuments(repository, sha, options);
  expect(report.links.map(link => link.status)).toEqual(['symlink', 'submodule']);
  expect(repository.readFileAt).toHaveBeenCalledTimes(1);
  expect(report.coverage.complete).toBe(false);
});

it('retains conflicting definition evidence instead of choosing the first link target', async () => {
  const { repository } = fixture({ 'docs/owner.md': '[Shared][rule]\n\n[rule]: first.md\n[rule]: second.md\n',
    'docs/first.md': '# first', 'docs/second.md': '# second' });
  const report = await traverseDocuments(repository, sha, options);
  expect(report.links).toEqual([expect.objectContaining({ status: 'ambiguous', sourcePath: 'docs/owner.md',
    definitions: [{ target: 'first.md', startLine: 3, endLine: 3 }, { target: 'second.md', startLine: 4, endLine: 4 }] })]);
  expect(report.coverage.complete).toBe(false);
  expect(repository.readFileAt).toHaveBeenCalledTimes(1);
});

it('preserves successful earlier reads when another committed document cannot be read', async () => {
  const { repository } = fixture({ 'docs/owner.md': '[B](b.md) [C](c.md)', 'docs/b.md': 'B', 'docs/c.md': 'C' });
  repository.readFileAt.mockImplementation(async (_commit, path) => {
    if (path === 'docs/b.md') throw new Error('Private provider-like error must not escape');
    return path === 'docs/owner.md' ? '[B](b.md) [C](c.md)' : 'C';
  });
  const report = await traverseDocuments(repository, sha, options);
  expect(report.coverage).toEqual({ complete: false, unvisited: ['docs/b.md'] });
  expect(report.documents.filter(document => document.status === 'read')).toHaveLength(2);
  expect(report.issues[0]?.code).toBe('document-read-failed');
  expect(JSON.stringify(report)).not.toContain('Private provider-like error');
});

it.each(['\uFFFD', '\0', 'different byte size'])(
  'refuses unsupported text representation %j without inventing a committed content digest', async content => {
    const { repository } = fixture({ 'docs/owner.md': 'expected' });
    repository.readFileAt.mockResolvedValue(content);
    const report = await traverseDocuments(repository, sha, options);
    expect(report.coverage.complete).toBe(false);
    expect(report.documents[0]?.digest).toBeUndefined();
    expect(report.issues[0]?.code).toBe('unsupported-document-encoding');
  });

it('reports unavailable repository metadata without claiming a complete empty traversal', async () => {
  const { repository } = fixture({ 'docs/owner.md': 'owner' });
  repository.listEntriesAt.mockRejectedValue(new Error('Infrastructure unavailable'));
  const report = await traverseDocuments(repository, sha, options);
  expect(report.coverage).toEqual({ complete: false, unvisited: ['docs/owner.md'] });
  expect(report.documents).toEqual([]);
  expect(report.issues[0]?.code).toBe('repository-index-unavailable');
  expect(repository.readFileAt).not.toHaveBeenCalled();
});

it('requires a resolved immutable commit rather than racing a moving ref between reads', async () => {
  const { repository } = fixture({ 'docs/owner.md': 'owner' });
  await expect(traverseDocuments(repository, 'HEAD', options)).rejects.toThrow('resolved immutable commit SHA');
  expect(repository.listEntriesAt).not.toHaveBeenCalled();
});

it.each([
  { entryPoints: [] }, { entryPoints: ['docs/owner.md', 'docs/owner.md'] }, { entryPoints: ['../owner.md'] },
  { entryPoints: ['./docs/owner.md'] }, { entryPoints: ['docs/*.md'] }, { entryPoints: ['docs/owner\n.md'] },
  { roots: ['/docs'] }, { roots: ['docs/'] }, { roots: ['docs', 'docs'] }, { roots: [] }, { maxReadDocuments: 0 },
  { maxReadDocuments: 10001 }, { maxReadBytes: 64 * 1024 * 1024 + 1 }, { maxDocumentBytes: 4 * 1024 * 1024 + 1 },
  { maxDocuments: 1.5 }, { maxSourceBytes: Infinity },
])('rejects invalid operation options before repository reads: %j', async invalid => {
  const { repository } = fixture({ 'docs/owner.md': 'owner' });
  await expect(traverseDocuments(repository, sha, { ...options, ...invalid })).rejects.toThrow();
  expect(repository.listEntriesAt).not.toHaveBeenCalled();
});
