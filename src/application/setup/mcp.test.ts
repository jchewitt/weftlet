import { afterEach, expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeProject } from '../../interfaces/init.js';
import { applyProjectSetup, planProjectSetup, type ProjectSetupOptions } from './project.js';
import { verifyProjectSetup } from './verify.js';

const roots: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'weftlet mcp setup ')); roots.push(directory);
  await initializeProject({ directory, clients: [] });
  return { directory, clients: ['codex', 'claude', 'opencode'], mcp: true } as ProjectSetupOptions;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it('previews/apply/repeats all clients together without disclosing or changing unrelated credentials', async () => {
  const options = await fixture();
  const original = '{"mcpServers":{"other":{"env":{"TOKEN":"private-credential"}}}}';
  await writeFile(join(options.directory!, '.mcp.json'), original);
  if (process.platform !== 'win32') await chmod(join(options.directory!, '.mcp.json'), 0o600);
  const before = await readdir(options.directory!);
  const plan = await planProjectSetup(options);
  expect(plan.ready).toBe(true);
  expect(JSON.stringify(plan)).not.toContain('private-credential');
  expect(JSON.stringify(plan.mcp!.registrations)).not.toContain(options.directory!);
  expect(await readdir(options.directory!)).toEqual(before);
  await applyProjectSetup(options, plan.planId);
  const config = JSON.parse(await readFile(join(options.directory!, '.mcp.json'), 'utf8'));
  if (process.platform !== 'win32') expect((await stat(join(options.directory!, '.mcp.json'))).mode & 0o777).toBe(0o600);
  expect(config.mcpServers.other).toEqual(JSON.parse(original).mcpServers.other);
  const repeat = await planProjectSetup(options);
  expect(repeat.mcp!.registrations.every(item => item.action === 'unchanged')).toBe(true);
  expect(repeat.skill!.files.every(item => item.action === 'unchanged')).toBe(true);
  expect(repeat.mcp!.files.every(file => file.beforeSha256 === file.afterSha256)).toBe(true);
  await applyProjectSetup(options, repeat.planId);
});
it('binds plans to configuration bytes and rejects customized registrations before installing other files', async () => {
  const options = await fixture(), root = options.directory!;
  const plan = await planProjectSetup(options);
  const path = join(root, 'context-graph.config.json');
  await writeFile(path, `${await readFile(path, 'utf8')}\n`);
  await expect(applyProjectSetup(options, plan.planId)).rejects.toThrow('stale');
  await writeFile(join(root, '.mcp.json'), '{"mcpServers":{"weftlet":{"command":"custom"}}}');
  const blocked = await planProjectSetup({ ...options, update: true });
  expect(blocked.ready).toBe(false);
  await expect(applyProjectSetup({ ...options, update: true }, blocked.planId)).rejects.toThrow('customized');
  expect(await readdir(root)).not.toContain('.agents');
  expect((await verifyProjectSetup(options)).server.status).toBe('not-started');
});
it('supports managed updates to absolute launchers but never overwrites an edited launcher', async () => {
  const options = await fixture(), plan = await planProjectSetup(options);
  await applyProjectSetup(options, plan.planId);
  expect((await planProjectSetup({ ...options, absoluteLauncher: true })).ready).toBe(false);
  const next = { ...options, absoluteLauncher: true, update: true };
  const update = await planProjectSetup(next);
  expect(update.mcp!.registrations.every(item => item.action === 'update')).toBe(true);
  await applyProjectSetup(next, update.planId);
  const launcher = join(options.directory!, plan.mcp!.launcher.path);
  await writeFile(launcher, `${await readFile(launcher, 'utf8')}\n// customized\n`);
  const blocked = await planProjectSetup(next);
  expect(blocked.mcp!.launcher.action).toBe('conflict');
  await expect(applyProjectSetup(next, blocked.planId)).rejects.toThrow('customized');
});
it('preserves an existing OpenCode JSONC file and rejects ambiguous files or invalid receipts', async () => {
  const options = await fixture(), root = options.directory!;
  await writeFile(join(root, 'opencode.jsonc'), '{\n// project\n"theme":"dark",\n}\n');
  const plan = await planProjectSetup(options);
  expect(plan.mcp!.registrations.find(item => item.client === 'opencode')!.path).toBe('opencode.jsonc');
  await applyProjectSetup(options, plan.planId);
  expect(await readFile(join(root, 'opencode.jsonc'), 'utf8')).toContain('// project');
  await writeFile(join(root, 'opencode.json'), '{}');
  await expect(planProjectSetup(options)).rejects.toThrow('Both opencode');
  await rm(join(root, 'opencode.json'));
  await writeFile(join(root, '.weftlet/mcp-setup.json'), '{"schemaVersion":2}');
  await expect(planProjectSetup(options)).rejects.toThrow('Invalid .weftlet');
});
it('rejects linked client directories and config paths outside the configured root', async () => {
  const options = await fixture(), outside = await fixture();
  await symlink(outside.directory!, join(options.directory!, '.codex'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(planProjectSetup(options)).rejects.toThrow('symbolic link or junction');
  await expect(planProjectSetup({ ...options, configPath: '../context-graph.config.json' })).rejects.toThrow('inside');
});
it('reports a missing project installation without starting npx or a model', async () => {
  const options = await fixture(), plan = await planProjectSetup(options);
  await applyProjectSetup(options, plan.planId);
  await expect(verifyProjectSetup(options)).rejects.toThrow('Install @weftlet/toolkit');
  expect(await readdir(options.directory!)).not.toContain('node_modules');
});
