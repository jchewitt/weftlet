import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExtractionContext } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import { GitRepository } from '../repository/git.js';
import { SemanticHydrator } from '../extraction/semantic.js';
import { semanticProviderIdentity } from '../extraction/semantic-identity.js';
import { SemanticArtifactStore } from '../storage/storage.js';
import { sha256 } from '../infrastructure/util.js';

const execute = promisify(execFile);
const cli = resolve('src/cli.ts');
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root =>
    rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

async function files(root: string, prefix = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(result, await files(root, path));
    else result[path] = sha256(await readFile(join(root, path)));
  }
  return result;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-cache-cli-'));
  temporaryRoots.push(root);
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(root, '.gitignore'), '.context-graph/\n');
  await writeFile(join(root, 'docs/owner.md'), '# Public owner\nThe worker accepts queued jobs.\n');
  await writeFile(join(root, 'adapter.mjs'), `import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./unexpected-adapter-import', import.meta.url), 'loaded');
throw new Error('Cache adoption must not load the repository adapter');\n`);
  const template = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  const config: ContextGraphConfig = { ...template, repositoryId: 'public/cache-cli',
    adapter: './adapter.mjs', approvedIntentSources: ['docs/owner.md'],
    semantic: { ...template.semantic, timeoutMs: 240_000, maxDocuments: 8 },
    scip: { version: 'missing', command: 'weftlet-test-missing-indexer', args: [] },
    ontology: { backend: 'opencaesar', toolVersion: 'missing', containerImage: 'missing', projectPath: 'missing' },
    runtimeEvidence: ['missing-runtime.json'],
  };
  const configPath = join(root, 'context-graph.config.json');
  const previousPath = join(root, 'previous.config.json');
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(previousPath, JSON.stringify({ ...config, semantic: { ...config.semantic, timeoutMs: 120_000 } }));
  const git = (...args: string[]) => execute('git', ['-c', 'maintenance.auto=false', '-c', 'gc.auto=0',
    '--no-optional-locks', ...args], { cwd: root });
  const commit = async () => {
    await git('add', '.');
    await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public cache adoption fixture');
    return (await git('rev-parse', 'HEAD')).stdout.trim();
  };
  await git('init', '--quiet');
  const commitSha = await commit();
  const context: ExtractionContext = { repositoryRoot: root, repositoryId: config.repositoryId,
    ref: 'HEAD', commitSha, snapshotId: 'public-cache-cli', changedPaths: [], deletedPaths: [], renamedPaths: {} };
  const source = (await new GitRepository(root).semanticSources(context, config.semanticSources))[0]!;
  const store = new SemanticArtifactStore(join(root, '.context-graph'));
  const semantic = new SemanticHydrator(config.semantic, store, {
    identity: semanticProviderIdentity(config.semantic),
    async extract() {
      return { parsed: { assertions: [{
        subject: { id: 'capability:queue', kind: 'Capability', label: 'Queue' }, predicate: 'implementedBy',
        object: { id: 'component:worker', kind: 'Component', label: 'Worker' },
        citation: { startLine: 2, endLine: 2 }, confidence: 0.95,
      }], diagnostics: [], oml: '' }, rawModelOutput: 'public fixture output' };
    },
  });
  const { artifact } = await semantic.hydrate(source, context);
  const artifactPath = join(root, '.context-graph/artifacts/semantic', `${artifact.key}.json`);
  const run = (...args: string[]) => execute(process.execPath, ['--import', tsx, cli, ...args],
    { cwd: root, timeout: 20_000, maxBuffer: 2 * 1024 * 1024 });
  return { root, config, configPath, previousPath, commitSha, commit, artifact, artifactPath, run };
}

async function failure(run: Promise<{ stdout: string; stderr: string }>) {
  return run.then(() => { throw new Error('Expected CLI exit 1'); },
    (error: { code: number; stdout: string; stderr: string }) => error);
}

describe('cache adopt CLI', () => {
  it('emits dry-run JSON without application initialization, cache writes or checkout changes', async () => {
    const { root, artifact, artifactPath, commitSha, run } = await fixture();
    await writeFile(join(root, 'docs/owner.md'), '# Uncommitted draft\nKeep this working change.\n');
    const before = await files(root);
    const originalArtifact = await readFile(artifactPath);
    const response = await run('cache', 'adopt', '--from-config', 'previous.config.json', '--dry-run');
    expect(response.stderr).toBe('');
    const report = JSON.parse(response.stdout);
    expect(report).toMatchObject({ schemaVersion: 1, kind: 'semantic-cache-adoption',
      repositoryId: 'public/cache-cli', commitSha, ref: 'HEAD', dryRun: true, ready: true,
      counts: { adopted: 0, reusable: 1, planned: 0 } });
    expect(report.configurationDigest).not.toBe(report.previousConfigurationDigest);
    expect(report.records).toEqual([expect.objectContaining({ path: 'docs/owner.md', key: artifact.key, status: 'reusable' })]);
    expect(response.stdout).not.toContain('public fixture output');
    expect(response.stdout).not.toContain('Keep this working change');
    expect(await files(root)).toEqual(before);
    const repeated = JSON.parse((await run('cache', 'adopt', '--from-config', 'previous.config.json',
      '--config', 'context-graph.config.json', '--ref', commitSha)).stdout);
    expect(repeated).toMatchObject({ dryRun: false, ready: true, commitSha, counts: { reusable: 1, adopted: 0 } });
    expect(await readFile(artifactPath)).toEqual(originalArtifact);
    expect(await files(root)).toEqual(before);
    await expect(readFile(join(root, 'unexpected-adapter-import'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns structured exit-1 reports for corrupt artifacts and budget violations with historical ref support', async () => {
    const { root, config, configPath, commitSha, commit, artifactPath, run } = await fixture();
    await writeFile(artifactPath, 'PUBLIC_INVALID_ARTIFACT_JSON');
    await writeFile(join(root, 'docs/later.md'), '# Later document\nMore committed evidence.\n');
    await commit();
    const corruptBefore = await files(root);
    const corrupt = await failure(run('cache', 'adopt', '--from-config', 'previous.config.json', '--ref', commitSha));
    expect(corrupt).toMatchObject({ code: 1, stderr: '' });
    const report = JSON.parse(corrupt.stdout);
    expect(report).toMatchObject({ ready: false, commitSha, counts: { corrupt: 1, adopted: 0 },
      budgets: { selectedDocuments: 1 } });
    expect(corrupt.stdout).not.toContain('PUBLIC_INVALID_ARTIFACT_JSON');
    expect(await files(root)).toEqual(corruptBefore);

    await writeFile(configPath, JSON.stringify({ ...config, semantic: { ...config.semantic, maxDocuments: 1 } }));
    const budgetBefore = await files(root);
    const blocked = await failure(run('cache', 'adopt', '--from-config', 'previous.config.json'));
    expect(blocked).toMatchObject({ code: 1, stderr: '' });
    const budget = JSON.parse(blocked.stdout);
    expect(budget).toMatchObject({ ready: false, records: [], budgets: { selectedDocuments: 2, maxDocuments: 1 } });
    expect(budget.issues).toContainEqual(expect.objectContaining({ code: 'document-budget', severity: 'error' }));
    expect(await files(root)).toEqual(budgetBefore);
  });

  it('rejects unsupported cache operations and missing previous-config values before loading the application', async () => {
    const { root, run } = await fixture();
    for (const args of [['cache', 'clear'], ['cache', 'adopt'], ['cache', 'adopt', '--from-config', '--dry-run']]) {
      const result = await failure(run(...args));
      expect(result).toMatchObject({ code: 1, stdout: '' });
      expect(result.stderr).toContain('Usage: weftlet cache adopt --from-config');
      expect(result.stderr).not.toContain('Cache adoption must not load');
    }
    const help = await run('cache', '--help');
    expect(help.stdout).toContain('cache adopt --from-config');
    expect(help.stdout).toContain('--dry-run performs no cache writes');
    await expect(readFile(join(root, 'unexpected-adapter-import'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
