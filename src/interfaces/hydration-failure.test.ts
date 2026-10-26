import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { GraphSnapshot } from '@weftlet/core';
import { FileSnapshotStore } from '../storage/storage.js';

const execute = promisify(execFile);
const cli = resolve('src/cli.ts');
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const temporaryRoots: string[] = [];
const privateText = 'PRIVATE_SOURCE_SENTINEL';
const privateError = 'PRIVATE_PROVIDER_SENTINEL';
const privateCredential = 'PRIVATE_CREDENTIAL_SENTINEL';

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(mode: 'timeout' | 'error') {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-failure-cli-'));
  temporaryRoots.push(root);
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(root, '.gitignore'), '.context-graph/\ncalls.txt\n');
  for (const name of ['a', 'b', 'c']) {
    await writeFile(join(root, `docs/${name}.md`), `# Public fixture ${name}\n${privateText}\n`);
  }
  await writeFile(join(root, 'provider.mjs'), `
    import { appendFile } from 'node:fs/promises';
    export const createSemanticExtractor = () => ({
      identity: 'public-failure-cli:1',
      async extract(source) {
        await appendFile(new URL('./calls.txt', import.meta.url), source.path + '\\n');
        if (source.path === 'docs/b.md') {
          ${mode === 'timeout' ? 'return new Promise(() => {});' :
            `throw new Error(${JSON.stringify(privateError)} + ' ' + source.path + ' ' + source.content + ' ' + process.env.WEFTLET_TEST_SECRET);`}
        }
        return { parsed: { assertions: [], diagnostics: [], oml: '' }, rawModelOutput: '{}' };
      },
    });
  `);
  const config = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  Object.assign(config, {
    repositoryId: 'public/failure-cli', semanticSources: ['docs'], approvedIntentSources: [],
    codeRoots: [], evidenceRoots: [], runtimeEvidence: [],
    semantic: { ...config.semantic, provider: 'module', providerModule: './provider.mjs',
      providerIdentity: 'public-failure-cli:1', timeoutMs: 250, concurrency: 1 },
    scip: { version: 'unavailable', command: 'weftlet-test-missing-indexer', args: [] },
  });
  await writeFile(join(root, 'context-graph.config.json'), JSON.stringify(config));
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  await git('init', '--quiet');
  await git('add', '.');
  await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public failure fixture');
  const commitSha = (await git('rev-parse', 'HEAD')).stdout.trim();
  const snapshot: GraphSnapshot = {
    manifest: { schemaVersion: 1, repositoryId: config.repositoryId, ref: 'HEAD', commitSha,
      snapshotId: 'prior', configurationDigest: 'prior-config', scope: ['docs'],
      ontologyVersion: '1', extractorVersions: {}, semanticModel: 'public-fixture',
      semanticPromptVersion: '1', generatedAt: '2026-01-01T00:00:00Z', contentDigest: 'prior-digest',
      semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
    facts: [], invariants: [], runtimeEvidence: [], unresolved: [],
  };
  const store = new FileSnapshotStore(join(root, '.context-graph'));
  await store.write(snapshot);
  await store.updateHead('default', snapshot.manifest.snapshotId);
  const headPath = join(root, '.context-graph/heads/default.json');
  const snapshotPath = join(root, '.context-graph/snapshots/prior.json');
  const priorHead = await readFile(headPath);
  const priorSnapshot = await readFile(snapshotPath);
  const run = (...args: string[]) => execute(process.execPath, ['--import', tsx, cli, ...args], {
    cwd: root, env: { ...process.env, WEFTLET_TEST_SECRET: privateCredential },
    timeout: 20_000, maxBuffer: 2 * 1024 * 1024,
  });
  const assertPreserved = async () => {
    expect(await readFile(headPath)).toEqual(priorHead);
    expect(await readFile(snapshotPath)).toEqual(priorSnapshot);
    expect(await readdir(join(root, '.context-graph/snapshots'))).toEqual(['prior.json']);
  };
  return { root, commitSha, run, assertPreserved };
}

async function failure(run: Promise<{ stdout: string; stderr: string }>) {
  return run.then(() => { throw new Error('Fixture must fail'); },
    (error: { code: number; stdout: string; stderr: string }) => error);
}

function assertSafe(output: string, root: string) {
  for (const secret of [privateText, privateError, privateCredential, root, 'docs/a.md', 'docs/b.md', 'provider.mjs']) {
    expect(output).not.toContain(secret);
  }
  expect(output).not.toContain('at ContextGraphHydrator');
}

describe('semantic hydration failure CLI', () => {
  it('reports a safe timeout, maps its source in local preview and retains completed artifacts and the old head', async () => {
    const { root, commitSha, run, assertPreserved } = await fixture('timeout');
    const first = await failure(run('hydrate'));
    expect(first.code).toBe(1);
    expect(first.stdout).toBe('');
    expect(first.stderr).toContain('Semantic hydration timeout: source-');
    expect(first.stderr).toContain('semantic-source-started');
    expect(first.stderr).toContain('1/3 completed (1 extracted, 0 reused)');
    expect(first.stderr).toContain('configured module-execution timeout 250 ms');
    assertSafe(first.stderr, root);
    await assertPreserved();

    const preview = await run('hydrate', '--plan', '--json');
    expect(preview.stderr).toBe('');
    const plan = JSON.parse(preview.stdout);
    const source = plan.documents.find((item: { path: string }) => item.path === 'docs/b.md');
    expect(source.sourceId).toMatch(/^source-[a-f0-9]{64}$/);
    expect(first.stderr).toContain(source.sourceId);
    expect(plan.estimates).toMatchObject({ reusableArtifacts: 1, extractions: 2 });
    const human = await run('hydrate', '--plan');
    expect(human.stdout).toContain(`"docs/b.md" [${source.sourceId}]`);

    const second = await failure(run('hydrate', '--json', '--quiet'));
    expect(second.code).toBe(1);
    expect(second.stdout).toBe('');
    const report = JSON.parse(second.stderr);
    expect(report).toMatchObject({ schemaVersion: 1, kind: 'semantic-hydration-failure',
      code: 'timeout', category: 'timeout', sourceId: source.sourceId, commitSha,
      phase: 'semantic-extract', timeoutMs: 250, timeoutScope: 'module-execution',
      progress: { total: 3, completed: 1, extracted: 0, reused: 1, failed: 1,
        cancelled: 0, notStarted: 1, remaining: 2 } });
    expect(report.elapsedMs).toBeGreaterThanOrEqual(200);
    expect(report.recovery.join(' ')).toContain('hydrate --plan');
    assertSafe(second.stderr, root);
    expect((await readFile(join(root, 'calls.txt'), 'utf8')).trim().split('\n'))
      .toEqual(['docs/a.md', 'docs/b.md', 'docs/b.md']);
    await assertPreserved();
  }, 30_000);

  it('sanitizes arbitrary provider exceptions without labeling them as timeouts', async () => {
    const { root, run, assertPreserved } = await fixture('error');
    const response = await failure(run('hydrate', '--json', '--quiet'));
    expect(response.code).toBe(1);
    expect(response.stdout).toBe('');
    const report = JSON.parse(response.stderr);
    expect(report).toMatchObject({ code: 'provider-failure', category: 'provider', phase: 'semantic-extract',
      progress: { completed: 1, extracted: 1, reused: 0, failed: 1, cancelled: 0, remaining: 2 } });
    assertSafe(response.stderr, root);
    await assertPreserved();
  }, 20_000);

  it('reports missing provider infrastructure without exposing its local module path', async () => {
    const { root, run, assertPreserved } = await fixture('error');
    await rm(join(root, 'provider.mjs'));
    const response = await failure(run('hydrate', '--json', '--quiet'));
    expect(response.code).toBe(1);
    expect(response.stdout).toBe('');
    const report = JSON.parse(response.stderr);
    expect(report).toMatchObject({ code: 'unavailable', category: 'infrastructure', phase: 'semantic-extract',
      progress: { total: 3, completed: 0, extracted: 0, reused: 0, failed: 1,
        cancelled: 0, notStarted: 2, remaining: 3 } });
    expect(report.recovery.join(' ')).toContain('doctor');
    assertSafe(response.stderr, root);
    await expect(readFile(join(root, 'calls.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await assertPreserved();
  }, 20_000);

  it('documents the local source mapping and stderr JSON mode', async () => {
    const { run } = await fixture('error');
    const response = await run('--help');
    expect(response.stderr).toBe('');
    expect(response.stdout).toContain('hydrate --json --quiet');
    expect(response.stdout).toContain('hydrate --plan maps opaque source IDs');
  }, 20_000);
});
