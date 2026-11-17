import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { initializeRetentionPolicy, retentionOperation } from '../src/application/retention/operations.js';
import { runCacheRetention } from '../src/interfaces/cache-retention.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-retention-cli-')); roots.push(root);
  const cache = join(root, 'cache'); await mkdir(join(cache, 'snapshots'), { recursive: true });
  await writeFile(join(cache, 'snapshots/saved.json'), JSON.stringify({ manifest: { schemaVersion: 1, snapshotId: 'saved',
    repositoryId: 'public/demo', commitSha: 'a'.repeat(40), contentDigest: 'b'.repeat(64) }, facts: [] }));
  return { root, cache, policyPath: join(root, 'retention.json'), planPath: join(root, 'review.json') };
}
it('initializes conservatively, checks saved limits and refuses overwrites or edited reports without touching cache bytes', async () => {
  const f = await fixture();
  const snapshot = await readFile(join(f.cache, 'snapshots/saved.json'));
  await initializeRetentionPolicy(f.policyPath);
  const before = await readFile(f.policyPath);
  await expect(initializeRetentionPolicy(f.policyPath)).rejects.toMatchObject({ code: 'EEXIST' });
  expect(await readFile(f.policyPath)).toEqual(before);
  const report = await retentionOperation('plan', { ...f, root: f.cache, maxEntries: 123, maxBytes: 100_000 });
  expect(report).toMatchObject({ readyForReview: true, canApply: false, totals: { candidateFiles: 0 } });
  await writeFile(f.planPath, JSON.stringify(report));
  expect(await retentionOperation('check', { ...f, root: f.cache })).toMatchObject({ unchanged: true, canApply: false });
  const edited = { ...report, canApply: true }; await writeFile(f.planPath, JSON.stringify(edited));
  await expect(retentionOperation('check', { ...f, root: f.cache })).rejects.toThrow('edited');
  await writeFile(f.planPath, JSON.stringify(report).replace('"canApply":false', '"canApply":false,"canApply":false'));
  await expect(retentionOperation('check', { ...f, root: f.cache })).rejects.toThrow('Duplicate');
  await writeFile(f.policyPath, before.toString().replace('"pins": []', String.raw`"pins": [], "p\u0069ns": []`));
  await expect(retentionOperation('plan', { ...f, root: f.cache })).rejects.toThrow('Duplicate');
  expect(await readFile(join(f.cache, 'snapshots/saved.json'))).toEqual(snapshot);
  expect(await readdir(join(f.cache, 'snapshots'))).toEqual(['saved.json']);
});
it('runs the installed-style CLI from a directory with no Git, config or providers and reports stale state with exit 1', async () => {
  const f = await fixture();
  const execute = promisify(execFile), cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  const run = (...args: string[]) => execute(process.execPath, ['--import', tsx, cli, 'cache', 'retention', ...args, '--json', '--quiet'], { cwd: f.root, timeout: 30_000 });
  expect(JSON.parse((await run('init', '--file', f.policyPath)).stdout).initialized).toBe(true);
  const plan = JSON.parse((await run('plan', '--root', f.cache, '--policy', f.policyPath)).stdout);
  expect(plan).toMatchObject({ readyForReview: true, canApply: false });
  await writeFile(f.planPath, JSON.stringify(plan));
  await writeFile(join(f.cache, 'new-unknown.txt'), 'Kept');
  const error = await run('check', '--root', f.cache, '--policy', f.policyPath, '--plan', f.planPath).catch(e => e);
  expect(error.code).toBe(1);
  expect(JSON.parse(error.stdout)).toMatchObject({ unchanged: false, canApply: false });
  expect(await readFile(join(f.cache, 'new-unknown.txt'), 'utf8')).toBe('Kept');
}, 120_000);
it('rejects apply/delete, missing arguments and unknown or duplicate switches before any operation', async () => {
  for (const args of [ ['apply', '--root', 'cache'], ['plan', '--policy', 'policy'], ['init', '--file', 'file', '--file', 'other'], ['plan', '--root', 'cache', '--policy', 'policy', '--force'] ]) {
    await expect(runCacheRetention(['cache', 'retention', ...args])).rejects.toThrow();
  }
  expect(await runCacheRetention(['cache', 'usage'])).toBe(false);
});
