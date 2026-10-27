import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const execute = promisify(execFile);
const cli = resolve('src/cli.ts');
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-coverage-cli-'));
  roots.push(root);
  await mkdir(join(root, 'docs/validation'), { recursive: true });
  await writeFile(join(root, '.gitignore'), '.context-graph/\n');
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(root, 'docs/owner.md'), '# Owner\n[Roadmap](roadmap.md) and [validation](validation/check.md).\n');
  await writeFile(join(root, 'docs/roadmap.md'), '# Roadmap\n[Queue](queue.md) and [draft](draft.md).\n');
  await writeFile(join(root, 'docs/queue.md'), '# Queue\n[Owner](owner.md) and [draft](draft.md).\n');
  await writeFile(join(root, 'docs/draft.md'), '# Draft\nPUBLIC_BODY_MUST_NOT_APPEAR_IN_COVERAGE\n');
  await writeFile(join(root, 'docs/validation/check.md'), '# Validation\nPUBLIC_CHECK_IS_NOT_APPROVED_INTENT\n');
  for (const name of ['provider', 'adapter']) {
    await writeFile(join(root, `${name}.mjs`), `import {writeFileSync} from 'node:fs';
writeFileSync(new URL('./unexpected-import', import.meta.url), '${name}');
throw Error('Coverage must not initialize ${name}');\n`);
  }
  const config = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  Object.assign(config, { repositoryId: 'public/coverage-cli', semanticSources: ['docs/owner.md'],
    approvedIntentSources: ['docs/owner.md'], evidenceRoots: ['docs/validation'], adapter: './adapter.mjs',
    runtimeEvidence: ['missing-runtime.json'],
    semantic: { ...config.semantic, provider: 'module', providerModule: './provider.mjs',
      providerIdentity: 'public-coverage-cli:1', maxDocuments: 8 },
    scip: { version: 'unavailable', command: 'unavailable-coverage-indexer', args: [] },
    ontology: { backend: 'opencaesar', toolVersion: 'unavailable', projectPath: 'unavailable-ontology', containerImage: 'unavailable' },
  });
  const configPath = join(root, 'context-graph.config.json');
  await writeFile(configPath, JSON.stringify(config));
  const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0', '--no-optional-locks', ...args], { cwd: root })).stdout.trim();
  await git('init', '--quiet');
  await git('add', '.');
  await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public coverage CLI');
  const commitSha = await git('rev-parse', 'HEAD');
  await mkdir(join(root, '.context-graph'));
  await writeFile(join(root, '.context-graph/retained.json'), '{"snapshot":"retained","artifact":"retained"}\n');
  const run = (...args: string[]) => execute(process.execPath, ['--import', tsx, cli, ...args], { cwd: root, timeout: 20_000 });
  return { root, config, configPath, git, commitSha, run };
}

async function failed(run: (...args: string[]) => Promise<{ stdout: string; stderr: string }>, ...args: string[]) {
  return run(...args).then(() => { throw Error('Expected rejected command'); },
    (error: { code: number; stdout: string; stderr: string }) => {
      expect(error.code).toBe(1);
      return error;
    });
}

it('renders a prospective JSON/human plan from committed bytes without execution or state writes', async () => {
  const { root, configPath, git, commitSha, run } = await fixture();
  await writeFile(join(root, 'docs/owner.md'), '# Dirty checkout\n[Untracked](untracked.md)\n');
  await writeFile(join(root, 'docs/untracked.md'), '# New uncommitted intent\n');
  const status = await git('status', '--porcelain=v1');
  const index = await readFile(join(root, '.git/index'));
  const config = await readFile(configPath);
  const saved = await readFile(join(root, '.context-graph/retained.json'));
  const args = ['documents', 'plan', '--entry', 'docs/owner.md', '--entry', 'docs/roadmap.md', '--root', 'docs', '--ref', commitSha];
  const response = await run(...args, '--json');
  expect(response.stderr).toBe('');
  const plan = JSON.parse(response.stdout);
  expect(plan).toMatchObject({ kind: 'document-coverage-plan', schemaVersion: 1, mode: 'prospective',
    changesHydrationSelection: false, commitSha, ready: true, coverage: { complete: true, unvisited: [] } });
  expect(plan.documents).toHaveLength(5);
  expect(plan.documents).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'docs/owner.md', sourceAuthority: 'declared', extractionReview: 'unreviewed' }),
    expect.objectContaining({ path: 'docs/draft.md', sourceAuthority: 'inferred', extractionReview: 'unreviewed' }),
    expect.objectContaining({ path: 'docs/validation/check.md', role: 'validation-evidence', sourceAuthority: 'inferred' }),
  ]));
  expect(plan).not.toHaveProperty('estimates');
  expect(plan.excludedWorkingChanges).toEqual(expect.arrayContaining(['docs/owner.md', 'docs/untracked.md']));
  expect(response.stdout).not.toContain('PUBLIC_BODY_MUST_NOT_APPEAR');
  expect(response.stdout).not.toContain('PUBLIC_CHECK_IS_NOT_APPROVED');
  const human = await run(...args);
  expect(human.stderr).toBe('');
  expect(human.stdout).toMatch(/prospective/i);
  expect(human.stdout).toContain(commitSha);
  expect(human.stdout).toContain('docs/draft.md');
  expect(human.stdout).not.toContain('PUBLIC_BODY_MUST_NOT_APPEAR');
  const actual = JSON.parse((await run('hydrate', '--plan', '--json', '--ref', commitSha)).stdout);
  expect(actual.documents.map((doc: { path: string }) => doc.path)).toEqual(['docs/owner.md']);
  expect(actual.estimates).toMatchObject({ reusableArtifacts: 0, extractions: 1 });
  expect(await readFile(configPath)).toEqual(config);
  expect(await readFile(join(root, '.git/index'))).toEqual(index);
  expect(await git('status', '--porcelain=v1')).toBe(status);
  expect(await readdir(join(root, '.context-graph'))).toEqual(['retained.json']);
  expect(await readFile(join(root, '.context-graph/retained.json'))).toEqual(saved);
  await expect(readFile(join(root, 'unexpected-import'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('returns complete budget failures and explicit safety frontiers with exit 1', async () => {
  const { root, config, configPath, run } = await fixture();
  config.semantic.maxDocuments = 1;
  await writeFile(configPath, JSON.stringify(config));
  const exceeded = await failed(run, 'documents', 'plan', '--entry', 'docs/owner.md', '--json');
  expect(exceeded.stderr).toBe('');
  const full = JSON.parse(exceeded.stdout);
  expect(full).toMatchObject({ ready: false, coverage: { complete: true, unvisited: [] },
    budgets: { maxDocuments: 1, documents: 5, withinLimits: false } });
  expect(full.documents).toHaveLength(5);
  const bounded = await failed(run, 'documents', 'plan', '--entry', 'docs/owner.md', '--max-read-documents', '1', '--json');
  expect(bounded.stderr).toBe('');
  const limited = JSON.parse(bounded.stdout);
  expect(limited.ready).toBe(false);
  expect(limited.coverage.complete).toBe(false);
  expect(limited.coverage.unvisited.length).toBeGreaterThan(0);
  expect(limited.documents.filter((doc: { status: string }) => doc.status === 'read')).toHaveLength(1);
  await expect(readFile(join(root, 'unexpected-import'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects missing, unknown and misplaced traversal arguments before application startup', async () => {
  const { root, run } = await fixture();
  for (const args of [
    ['documents', 'plan', '--json'],
    ['documents', 'plan', '--entry', '--json'],
    ['documents', 'plan', '--entry', 'docs/owner.md', '--unexpected'],
    ['documents', 'plan', '--entry', 'docs/owner.md', '--max-read-documents', '0'],
    ['hydrate', '--entry', 'docs/owner.md'],
  ]) {
    const result = await failed(run, ...args);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/entry|usage|unknown|unexpected|limit|positive|integer|documents/i);
    await expect(readFile(join(root, 'unexpected-import'))).rejects.toMatchObject({ code: 'ENOENT' });
  }
});

it('loads an operation policy and reports source classification separately without changing hydration inputs', async () => {
  const { root, configPath, git, run } = await fixture();
  const policy = { schemaVersion: 1, roles: ['roadmap', 'queue', 'draft'].map(name => ({
    id: `plan-${name}`, pattern: `docs/${name}.md`, role: 'plan',
  })), owners: [{ id: 'public-owner', pattern: 'docs/*.md', ownerDocument: 'docs/owner.md' }] };
  await writeFile(join(root, 'documents.policy.json'), JSON.stringify(policy));
  const before = JSON.parse((await run('hydrate', '--plan', '--json')).stdout);
  const configBytes = await readFile(configPath);
  const index = await readFile(join(root, '.git/index'));
  const status = await git('status', '--porcelain=v1');
  const saved = await readFile(join(root, '.context-graph/retained.json'));
  const args = ['documents', 'plan', '--entry', 'docs/owner.md', '--document-policy', 'documents.policy.json'];
  const plan = JSON.parse((await run(...args, '--json')).stdout);
  expect(plan).toMatchObject({ ready: true, classification: { complete: true }, changesHydrationSelection: false });
  expect(plan.documents.find((document: { path: string }) => document.path === 'docs/draft.md')).toMatchObject({
    sourceRole: 'plan', sourceAuthority: 'inferred', extractionReview: 'unreviewed',
    ownership: { status: 'resolved', ownerDocuments: ['docs/owner.md'], mappingIds: ['public-owner'] },
  });
  expect(plan.documents.find((document: { path: string }) => document.path === 'docs/validation/check.md')).toMatchObject({
    sourceRole: 'validation', role: 'validation-evidence', ownership: { status: 'not-required' },
  });
  const human = (await run(...args)).stdout;
  expect(human).toContain('Source classification: complete');
  expect(human).toContain('separate from traversal/budget readiness');
  expect(human).toContain('owner resolved "docs/owner.md"');
  const after = JSON.parse((await run('hydrate', '--plan', '--json')).stdout);
  expect(after).toEqual(before);
  expect(await readFile(configPath)).toEqual(configBytes);
  expect(await readFile(join(root, '.git/index'))).toEqual(index);
  expect(await git('status', '--porcelain=v1')).toBe(status);
  expect(await readFile(join(root, '.context-graph/retained.json'))).toEqual(saved);
  await expect(readFile(join(root, 'unexpected-import'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps ambiguous roles and ineligible owners visible when traversal and budgets pass', async () => {
  const { root, run } = await fixture();
  await writeFile(join(root, 'documents.policy.json'), JSON.stringify({ schemaVersion: 1,
    roles: [{ id: 'owner-is-validation', pattern: 'docs/owner.md', role: 'validation' },
      { id: 'draft-plan', pattern: 'docs/draft.md', role: 'plan' },
      { id: 'draft-reference', pattern: 'docs/draft.md', role: 'reference' }],
    owners: [{ id: 'public-owner', pattern: 'docs/*.md', ownerDocument: 'docs/owner.md' }],
  }));
  const args = ['documents', 'plan', '--entry', 'docs/owner.md', '--document-policy', 'documents.policy.json'];
  const plan = JSON.parse((await run(...args, '--json')).stdout);
  expect(plan).toMatchObject({ ready: true, coverage: { complete: true }, classification: { complete: false } });
  expect(plan.documents.find((document: { path: string }) => document.path === 'docs/draft.md')).toMatchObject({
    sourceRole: 'unclassified', roleStatus: 'ambiguous', sourceAuthority: 'inferred', ownership: { status: 'ineligible' },
  });
  const human = (await run(...args)).stdout;
  expect(human).toContain('Source classification: gaps');
  expect(human).toContain('CLASSIFICATION');
  expect(human).toContain('role unclassified (ambiguous)');
  expect(human).not.toContain('PUBLIC_BODY_MUST_NOT_APPEAR');
  await expect(readFile(join(root, 'unexpected-import'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects malformed, oversized and misplaced document policy before execution starts', async () => {
  const { root, run } = await fixture();
  const args = ['documents', 'plan', '--entry', 'docs/owner.md', '--document-policy', 'bad.policy.json'];
  for (const content of ['{"schemaVersion":', '{"schemaVersion":1,"unknown":"PRIVATE_POLICY_TEXT"}',
    'PRIVATE_POLICY_TEXT'.repeat(5000)]) {
    await writeFile(join(root, 'bad.policy.json'), content);
    const result = await failed(run, ...args);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/policy|JSON|65536/i);
    expect(result.stderr).not.toContain('PRIVATE_POLICY_TEXT');
  }
  const misplaced = await failed(run, 'hydrate', '--document-policy', 'bad.policy.json');
  expect(misplaced.stdout).toBe('');
  expect(misplaced.stderr).toContain('documents plan');
  await expect(readFile(join(root, 'unexpected-import'))).rejects.toMatchObject({ code: 'ENOENT' });
});
