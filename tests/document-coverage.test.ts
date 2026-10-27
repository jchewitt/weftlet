import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { planDocumentCoverage } from '../src/application/document-coverage.js';
import { planHydration } from '../src/application/hydration-plan.js';
import { sha256 } from '../src/infrastructure/util.js';

const execute = promisify(execFile);
const roots: string[] = [];
const sources: Record<string, string> = {
  'docs/sot.md': '# Public SOT\nApproved discovery begins here.\n[Discovery](discovery.md) and [draft](draft.md).\n',
  'docs/discovery.md': '# Discovery\n[Analysis](analysis.md)\n',
  'docs/analysis.md': '# Analysis\n[Admission](admission.md) and [queue contract](contracts/queue.md).\n',
  'docs/admission.md': '# Admission\n[Planning](planning.md)\n',
  'docs/planning.md': '# Planning\n[Execution](execution.md) and [queue contract](contracts/queue.md).\n',
  'docs/execution.md': '# Execution\n[Outcomes and learning](outcomes.md), [implementation](../src/worker.ts), [validation](validation/check.md).\n',
  'docs/outcomes.md': '# Outcomes and learning\n[Discovery feedback](sot.md)\n',
  'docs/contracts/queue.md': '# Queue contract\nPUBLIC_QUEUE_BODY_NOT_INCLUDED_IN_REPORT\n',
  'docs/draft.md': '# Draft\nPUBLIC_DRAFT_ASSERTION_NOT_APPROVED_BY_REACHABILITY\n',
  'docs/validation/check.md': '# Validation\nPUBLIC_VALIDATION_TEXT_IS_SEPARATE_EVIDENCE\n',
  'src/worker.ts': 'export const deliver = (job: string) => job;\n',
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-document-coverage-'));
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
throw Error('Coverage must not initialize ${name}');\n`);
  }
  const config = JSON.parse(await readFile(new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  Object.assign(config, { repositoryId: 'public/document-coverage', semanticSources: ['docs/sot.md'],
    approvedIntentSources: ['docs/sot.md'], evidenceRoots: ['docs/validation'],
    adapter: './adapter.mjs', runtimeEvidence: ['unavailable-runtime.json'],
    semantic: { ...config.semantic, provider: 'module', providerModule: './provider.mjs',
      providerIdentity: 'public-coverage:1', maxDocuments: 20, maxSourceBytes: 65_536 },
    scip: { version: 'unavailable', command: 'unavailable-coverage-indexer', args: [] },
    ontology: { backend: 'opencaesar', toolVersion: 'unavailable', projectPath: 'unavailable-ontology', containerImage: 'unavailable' },
  });
  const configPath = join(root, 'context-graph.config.json');
  await writeFile(configPath, JSON.stringify(config));
  const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0', '--no-optional-locks', ...args], { cwd: root })).stdout.trim();
  const commit = async () => {
    await git('add', '.');
    await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public document coverage');
    return git('rev-parse', 'HEAD');
  };
  await git('init', '--quiet');
  const commitSha = await commit();
  await mkdir(join(root, '.context-graph'), { recursive: true });
  await writeFile(join(root, '.context-graph/snapshot.json'), '{"existing":"snapshot"}\n');
  await writeFile(join(root, '.context-graph/completed-artifact.json'), '{"existing":"artifact"}\n');
  return { root, config, configPath, git, commit, commitSha };
}

it('previews the committed product flow without changing actual hydration selection or approval', async () => {
  const { root, configPath, git, commitSha } = await fixture();
  const baseline = await planHydration(configPath, { ref: commitSha });
  expect(baseline.documents.map(doc => doc.path)).toEqual(['docs/sot.md']);
  await writeFile(join(root, 'docs/sot.md'), '# Dirty owner\n[Uncommitted](uncommitted.md)\n');
  await writeFile(join(root, 'docs/uncommitted.md'), '# Uncommitted product draft\n');
  const status = await git('status', '--porcelain=v1');
  const index = await readFile(join(root, '.git/index'));
  const configBytes = await readFile(configPath);
  const retainedFiles = await readdir(join(root, '.context-graph'));
  const retainedBytes = await Promise.all(retainedFiles.map(path => readFile(join(root, '.context-graph', path))));
  const report = await planDocumentCoverage(configPath, { ref: commitSha, entryPoints: ['docs/sot.md'], roots: ['.'] });
  expect(report).toMatchObject({ schemaVersion: 1, kind: 'document-coverage-plan', mode: 'prospective',
    changesHydrationSelection: false, repositoryId: 'public/document-coverage', commitSha, ready: true,
    coverage: { complete: true, unvisited: [] }, budgets: { documents: 10, withinLimits: true } });
  expect(report).not.toHaveProperty('estimates');
  expect(report.documents.map(doc => doc.path)).toEqual(Object.keys(sources).filter(path => path.endsWith('.md')).sort());
  expect(report.documents.find(doc => doc.path === 'docs/sot.md')).toMatchObject({
    digest: sha256(sources['docs/sot.md']!), sourceAuthority: 'declared', approvedBy: ['docs/sot.md'], extractionReview: 'unreviewed' });
  expect(report.documents.find(doc => doc.path === 'docs/draft.md')).toMatchObject({
    sourceAuthority: 'inferred', approvedBy: [], extractionReview: 'unreviewed' });
  expect(report.documents.find(doc => doc.path === 'docs/validation/check.md')).toMatchObject({
    role: 'validation-evidence', sourceAuthority: 'inferred', approvedBy: [], extractionReview: 'unreviewed' });
  expect(report.documents.find(doc => doc.path === 'docs/contracts/queue.md')?.reachedBy).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourcePath: 'docs/analysis.md', startLine: 2, endLine: 2 }),
    expect.objectContaining({ sourcePath: 'docs/planning.md', startLine: 2, endLine: 2 }),
  ]));
  expect(report.excludedWorkingChanges).toEqual(expect.arrayContaining(['docs/sot.md', 'docs/uncommitted.md']));
  const serialized = JSON.stringify(report);
  expect(serialized).not.toContain('PUBLIC_QUEUE_BODY_NOT_INCLUDED');
  expect(serialized).not.toContain('PUBLIC_DRAFT_ASSERTION');
  expect(serialized).not.toContain('PUBLIC_VALIDATION_TEXT');
  const after = await planHydration(configPath, { ref: commitSha });
  expect(after.documents).toEqual(baseline.documents);
  expect(after.estimates).toEqual(baseline.estimates);
  expect(await readFile(configPath)).toEqual(configBytes);
  expect(await readFile(join(root, '.git/index'))).toEqual(index);
  expect(await git('status', '--porcelain=v1')).toBe(status);
  expect(await readdir(join(root, '.context-graph'))).toEqual(retainedFiles);
  expect(await Promise.all(retainedFiles.map(path => readFile(join(root, '.context-graph', path))))).toEqual(retainedBytes);
  await expect(readFile(join(root, 'unexpected-import'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('reports the full closure above extraction budgets and exposes unread safety frontiers separately', async () => {
  const { root, config, configPath, commitSha } = await fixture();
  config.semantic.maxDocuments = 2;
  await writeFile(configPath, JSON.stringify(config));
  const full = await planDocumentCoverage(configPath, { entryPoints: ['docs/sot.md'], ref: commitSha });
  expect(full).toMatchObject({ ready: false, coverage: { complete: true, unvisited: [] },
    budgets: { maxDocuments: 2, documents: 10, withinLimits: false } });
  expect(full.documents).toHaveLength(10);
  expect(full.documents.every(doc => doc.status === 'read')).toBe(true);
  const limited = await planDocumentCoverage(configPath, {
    entryPoints: ['docs/sot.md'], ref: commitSha, maxReadDocuments: 1,
  });
  expect(limited.ready).toBe(false);
  expect(limited.coverage.complete).toBe(false);
  expect(limited.coverage.unvisited).toEqual(expect.arrayContaining(['docs/discovery.md', 'docs/draft.md']));
  expect(limited.documents.filter(doc => doc.status === 'read').map(doc => doc.path)).toEqual(['docs/sot.md']);
  expect(limited.documents.filter(doc => doc.status === 'unread').map(doc => doc.path)).toEqual(limited.coverage.unvisited);
  await expect(readFile(join(root, 'unexpected-import'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('retains configured validation-root glob labels without treating linked sources as approved', async () => {
  const { config, configPath } = await fixture();
  config.evidenceRoots = ['docs/vali*'];
  await writeFile(configPath, JSON.stringify(config));
  const report = await planDocumentCoverage(configPath, { entryPoints: ['docs/sot.md'] });
  expect(report.documents.find(doc => doc.path === 'docs/validation/check.md')).toMatchObject({
    role: 'validation-evidence', sourceAuthority: 'inferred', approvedBy: [], extractionReview: 'unreviewed',
  });
  expect(report.documents.find(doc => doc.path === 'docs/draft.md')?.role).toBe('semantic-document');
});

it.each(['.', './'])('labels every document under repository evidence root %s without propagating approval', async evidenceRoot => {
  const { config, configPath } = await fixture();
  config.evidenceRoots = [evidenceRoot];
  await writeFile(configPath, JSON.stringify(config));
  const report = await planDocumentCoverage(configPath, { entryPoints: ['docs/sot.md'] });
  expect(report.documents).toHaveLength(10);
  expect(report.documents.every(document => document.role === 'validation-evidence')).toBe(true);
  expect(report.documents.filter(document => document.sourceAuthority === 'declared').map(document => document.path)).toEqual(['docs/sot.md']);
  expect(report.documents.every(document => document.extractionReview === 'unreviewed')).toBe(true);
});

it('recomputes reachability for renames and deletions while preserving historical committed coverage', async () => {
  const { root, configPath, git, commit, commitSha } = await fixture();
  await rename(join(root, 'docs/draft.md'), join(root, 'docs/proposal.md'));
  await writeFile(join(root, 'docs/sot.md'), sources['docs/sot.md']!.replace('draft.md', 'proposal.md'));
  const renamed = await commit();
  const renamedReport = await planDocumentCoverage(configPath, { entryPoints: ['docs/sot.md'], ref: renamed });
  expect(renamedReport.ready).toBe(true);
  expect(renamedReport.documents.map(doc => doc.path)).toContain('docs/proposal.md');
  expect(renamedReport.documents.map(doc => doc.path)).not.toContain('docs/draft.md');
  expect(renamedReport.documents.find(doc => doc.path === 'docs/proposal.md')?.digest).toBe(sha256(sources['docs/draft.md']!));
  await rm(join(root, 'docs/proposal.md'));
  const deleted = await commit();
  const broken = await planDocumentCoverage(configPath, { entryPoints: ['docs/sot.md'], ref: deleted });
  expect(broken.ready).toBe(false);
  expect(broken.coverage.complete).toBe(false);
  expect(broken.links).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'missing', path: 'docs/proposal.md' })]));
  const historical = await planDocumentCoverage(configPath, { entryPoints: ['docs/sot.md'], ref: commitSha });
  expect(historical.ready).toBe(true);
  expect(historical.documents.map(doc => doc.path)).toContain('docs/draft.md');
  expect(historical.documents.map(doc => doc.path)).not.toContain('docs/proposal.md');
  expect(await git('rev-parse', 'HEAD')).toBe(deleted);
});
