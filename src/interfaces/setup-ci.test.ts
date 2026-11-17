import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { initializeProject } from './init.js';

it('previews/applies CI from another cwd without running selected scripts or requiring an agent client', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weftlet ci cli '));
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  const run = (...args: string[]) => promisify(execFile)(process.execPath,
    ['--import', tsx, resolve('src/cli.ts'), 'setup', 'ci', '--directory', root, ...args], { cwd: tmpdir(), timeout: 30_000 });
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'public-ci-fixture', private: true,
      devDependencies: { '@weftlet/toolkit': '0.9.0' }, scripts: { test: 'this-command-must-not-be-executed' } }));
    await writeFile(join(root, 'package-lock.json'), '{"lockfileVersion":3}');
    await initializeProject({ directory: root, clients: [] });
    const preview = JSON.parse((await run('--checks', '--test-script', 'test', '--json')).stdout);
    expect(preview.applied).toBe(false);
    expect(await readdir(root)).not.toContain('.github');
    await expect(run('--checks', '--apply', '--expect-plan', 'stale')).rejects.toThrow('stale');
    const applied = JSON.parse((await run('--checks', '--test-script', 'test', '--apply', '--expect-plan', preview.planId, '--json')).stdout);
    expect(applied.applied).toBe(true);
    expect(await readFile(join(root, applied.files[0].path), 'utf8')).toBe(preview.files[0].proposedContent);
    expect(await readdir(root)).not.toContain('.agents');
    await expect(run('--checks', '--provider-version', '0.153.4')).rejects.toThrow('require --generate');
    await expect(run('--apply', '--dry-run')).rejects.toThrow('Choose --apply');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 180_000);
