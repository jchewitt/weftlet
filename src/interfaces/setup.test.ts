import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const execute = promisify(execFile);
const cli = resolve('src/cli.ts');
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

it('sets up an existing project from another cwd with explicit preview identity and preserves its config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weftlet setup cli '));
  const run = (...args: string[]) => execute(process.execPath, ['--import', tsx, cli, 'setup', '--directory', root, ...args],
    { cwd: tmpdir(), timeout: 30_000 });
  try {
    await writeFile(join(root, 'context-graph.config.json'), '{"existing":"left alone"}');
    const preview = JSON.parse((await run('--client', 'claude', '--dry-run', '--json')).stdout);
    expect(preview.applied).toBe(false);
    expect(await readdir(root)).toEqual(['context-graph.config.json']);
    await expect(run('--client', 'claude', '--apply', '--expect-plan', 'stale')).rejects.toThrow('stale');
    const result = JSON.parse((await run('--client', 'claude', '--apply', '--expect-plan', preview.planId, '--json')).stdout);
    expect(result.applied).toBe(true);
    expect(await readFile(join(root, result.files[0].path), 'utf8')).toContain('impact.scan');
    expect(await readFile(join(root, 'context-graph.config.json'), 'utf8')).toBe('{"existing":"left alone"}');
    expect(JSON.parse((await run('--client', 'claude', '--apply', '--json')).stdout).files[0].action).toBe('unchanged');
    await expect(run('--client', 'claude', '--apply', '--dry-run')).rejects.toThrow('Choose --apply');
    await expect(run('--client', 'other')).rejects.toThrow('Choose at least');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 180_000);
