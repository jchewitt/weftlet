import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runCacheInspection } from '../src/interfaces/cache-inspection.js';

const roots: string[] = [];
const exitCode = process.exitCode;
afterEach(async () => {
  process.exitCode = exitCode; vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-inspection-cli-')); roots.push(root);
  const template = JSON.parse(await readFile(new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  // A missing executable adapter must not be imported for a saved-file inspection.
  template.semantic.provider = 'module'; template.semantic.providerModule = './missing-provider.mjs';
  template.semantic.providerIdentity = 'missing:1';
  const config = join(root, 'context-graph.config.json');
  await writeFile(config, JSON.stringify(template));
  const path = join(root, '.context-graph/snapshots/saved.json');
  await mkdir(join(root, '.context-graph/snapshots'), { recursive: true });
  await writeFile(path, JSON.stringify({ manifest: { schemaVersion: 1, snapshotId: 'saved', repositoryId: 'public/cli',
    commitSha: 'a'.repeat(40), contentDigest: 'b'.repeat(64) }, facts: [] }));
  return { root, config, path };
}
it('profiles saved files without Git or provider initialization and writes only report output', async () => {
  const { root, config, path } = await fixture();
  const names = await readdir(root, { recursive: true }), before = await readFile(path);
  let output = '';
  vi.spyOn(process.stdout, 'write').mockImplementation(value => { output += value.toString(); return true; });
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  expect(await runCacheInspection(['cache', 'profile', '--snapshot', 'saved', '--config', config, '--json'], () => { throw Error('unexpected default'); })).toBe(true);
  expect(JSON.parse(output)).toMatchObject({ jsonComplete: true, snapshot: { snapshotId: 'saved' } });
  output = '';
  await runCacheInspection(['cache', 'usage', '--root', join(root, '.context-graph'), '--verify', '--json'], () => { throw Error('no config needed'); });
  expect(JSON.parse(output)).toMatchObject({ complete: true, danglingHeads: [] });
  expect(await readdir(root, { recursive: true })).toEqual(names);
  expect(await readFile(path)).toEqual(before);
  await expect(runCacheInspection(['cache', 'profile', '--snapshot', 'missing', '--config', config], () => config)).rejects.toThrow('absent');
});
it('rejects ambiguous flags and returns failure status for limited or malformed inventory', async () => {
  const { root, path } = await fixture();
  vi.spyOn(process.stdout, 'write').mockReturnValue(true); vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  for (const args of [ ['profile', '--file', path, '--snapshot', 'saved'], ['usage', '--root', root, '--config', 'config.json'],
    ['usage', '--verify', '--verify'], ['usage', '--max-entries', '0'], ['profile', '--file'], ['usage', '--unknown'] ]) {
    await expect(runCacheInspection(['cache', ...args], () => 'missing')).rejects.toThrow();
  }
  expect(await runCacheInspection(['cache', 'adopt'], () => 'missing')).toBe(false);
  await runCacheInspection(['cache', 'usage', '--root', root, '--max-entries', '1', '--quiet'], () => 'missing');
  expect(process.exitCode).toBe(1); process.exitCode = exitCode;
  await writeFile(path, '{bad');
  await runCacheInspection(['cache', 'usage', '--root', root, '--verify', '--quiet'], () => 'missing');
  expect(process.exitCode).toBe(1);
});


it('dispatches actual CLI root/file inspection before unrelated document option guards', async () => {
  const { root, path } = await fixture();
  const execute = promisify(execFile);
  const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
  const run = async (...args: string[]) => JSON.parse((await execute(process.execPath,
    ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href, cli, 'cache', ...args, '--json', '--quiet'],
    { cwd: root, timeout: 30_000, maxBuffer: 1024 * 1024 })).stdout);
  expect(await run('usage', '--root', join(root, '.context-graph'))).toMatchObject({ complete: true });
  expect(await run('profile', '--file', path)).toMatchObject({ jsonComplete: true });
}, 60_000);
