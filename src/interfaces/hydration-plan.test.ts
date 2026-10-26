import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const cli = resolve('src/cli.ts');
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-plan-cli-'));
  temporaryRoots.push(root);
  await mkdir(join(root, 'docs/validation'), { recursive: true });
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  const owner = '# Public owner\nThe queue accepts committed jobs.\n';
  await writeFile(join(root, 'docs/owner.md'), owner);
  await writeFile(join(root, 'docs/validation/check.md'), '# Validation evidence\nThe queue fixture checks successful delivery.\n');
  for (const name of ['provider', 'adapter']) {
    await writeFile(join(root, `${name}.mjs`), `import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./unexpected-import', import.meta.url), '${name}');
throw new Error('Preview must not import the configured ${name}');\n`);
  }
  const config = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  Object.assign(config, {
    repositoryId: 'public/plan-cli', semanticSources: ['docs'],
    approvedIntentSources: ['docs/owner.md'], evidenceRoots: ['docs/validation'],
    adapter: './adapter.mjs', runtimeEvidence: ['missing-runtime.json'],
    semantic: { ...config.semantic, provider: 'module', providerModule: './provider.mjs',
      providerIdentity: 'public-plan-cli:1', maxDocuments: 8 },
    scip: { version: 'unavailable', command: 'weftlet-test-missing-indexer', args: [] },
    ontology: { backend: 'opencaesar', toolVersion: 'unavailable',
      containerImage: 'unavailable', projectPath: 'missing-ontology' },
  });
  const configPath = join(root, 'context-graph.config.json');
  await writeFile(configPath, JSON.stringify(config));
  const git = (...args: string[]) => execute('git', args, { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  const commit = async () => {
    await git('add', '.');
    await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public plan fixture');
    return (await git('rev-parse', 'HEAD')).stdout.trim();
  };
  await git('init', '--quiet');
  const commitSha = await commit();
  const run = (...args: string[]) => execute(process.execPath, ['--import', tsx, cli, ...args], { cwd: root });
  return { root, config, configPath, owner, commitSha, git, commit, run };
}

describe('hydrate --plan CLI', () => {
  it('renders JSON and human previews before loading configured execution adapters', async () => {
    const { root, owner, commitSha, git, run } = await fixture();
    const dirty = '# Uncommitted draft\nThis checkout must stay untouched.\n';
    await writeFile(join(root, 'docs/owner.md'), dirty);
    const status = (await git('status', '--porcelain=v1')).stdout;
    const index = await readFile(join(root, '.git/index'));
    const response = await run('hydrate', '--plan', '--json');
    expect(response.stderr).toBe('');
    const plan = JSON.parse(response.stdout);
    expect(plan).toMatchObject({ schemaVersion: 1, kind: 'hydration-plan',
      repositoryId: 'public/plan-cli', commitSha, ready: true,
      estimates: { reusableArtifacts: 0, extractions: 2, unknownArtifacts: 0 } });
    expect(plan.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'docs/owner.md', bytes: Buffer.byteLength(owner),
        sourceAuthority: 'declared', extractionReview: 'unreviewed' }),
      expect.objectContaining({ path: 'docs/validation/check.md', role: 'validation-evidence',
        sourceAuthority: 'inferred', extractionReview: 'unreviewed' }),
    ]));
    expect(plan.excludedWorkingChanges).toContain('docs/owner.md');
    expect(response.stdout).not.toContain('The queue accepts committed jobs');
    expect(response.stdout).not.toContain('This checkout must stay untouched');
    const human = await run('hydrate', '--plan');
    expect(human.stderr).toBe('');
    expect(human.stdout).toContain('Hydration plan: public/plan-cli');
    expect(human.stdout).toContain(`Commit: ${commitSha}`);
    expect(human.stdout).toContain('Expected cache reuse: 0; extractions: 2');
    expect(human.stdout).toContain('source declared, extraction unreviewed');
    expect(human.stdout).toContain('Working changes excluded: "docs/owner.md"');
    expect(await readFile(join(root, 'docs/owner.md'), 'utf8')).toBe(dirty);
    expect(await readFile(join(root, '.git/index'))).toEqual(index);
    expect((await git('status', '--porcelain=v1')).stdout).toBe(status);
    await expect(readFile(join(root, 'unexpected-import'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(root, '.context-graph'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('passes historical refs and forced extraction, and emits a complete blocked plan with exit 1', async () => {
    const { root, config, configPath, commitSha, commit, run } = await fixture();
    await writeFile(join(root, 'docs/new.md'), '# New source\nLater work.\n');
    const laterSha = await commit();
    expect(laterSha).not.toBe(commitSha);
    const historical = JSON.parse((await run('hydrate', '--plan', '--json', '--ref', commitSha, '--force-semantic')).stdout);
    expect(historical.commitSha).toBe(commitSha);
    expect(historical.documents.map((item: { path: string }) => item.path)).toEqual(['docs/owner.md', 'docs/validation/check.md']);
    expect(historical.documents.every((item: { cache: { status: string } }) => item.cache.status === 'forced')).toBe(true);
    expect(historical.estimates).toMatchObject({ reusableArtifacts: 0, extractions: 2 });

    config.semantic.maxDocuments = 1;
    await writeFile(configPath, JSON.stringify(config));
    const failed = await run('hydrate', '--plan', '--json').then(
      () => { throw new Error('Budget violation should return exit 1'); },
      (error: { code: number; stdout: string; stderr: string }) => error,
    );
    expect(failed.code).toBe(1);
    expect(failed.stderr).toBe('');
    const blocked = JSON.parse(failed.stdout);
    expect(blocked.ready).toBe(false);
    expect(blocked.documents).toHaveLength(3);
    expect(blocked.budgets).toMatchObject({ selectedDocuments: 3, maxDocuments: 1 });
    expect(blocked.issues.some((issue: { severity: string }) => issue.severity === 'error')).toBe(true);

    config.semantic.maxDocuments = 8;
    config.semanticSources = ['docs', 'docs/missing.md'];
    await writeFile(configPath, JSON.stringify(config));
    const advisory = await run('hydrate', '--plan').then(
      () => { throw new Error('Incomplete selection should return exit 1'); },
      (error: { code: number; stdout: string; stderr: string }) => error,
    );
    expect(advisory.code).toBe(1);
    expect(advisory.stderr).toBe('');
    expect(advisory.stdout).toContain('Source/cache/budget checks: needs review');
    expect(advisory.stdout).toContain('WARNING');
    expect(advisory.stdout).not.toContain('Source/cache/budget checks: blocked');
    await expect(readFile(join(root, 'unexpected-import'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(root, '.context-graph'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
