import { afterEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { initializeProject } from '../../../interfaces/init.js';
import { applyCiSetup, planCiSetup } from './plan.js';
import type { CiSetupOptions } from './project.js';

const roots: string[] = [];
async function fixture(manager: 'npm' | 'pnpm' = 'npm', nested = false) {
  const directory = await mkdtemp(join(tmpdir(), 'weftlet CI setup ')); roots.push(directory);
  const pkg = { name: 'public-ci-example', private: true, ...(manager === 'pnpm' ? { packageManager: 'pnpm@10.18.2' } : {}),
    devDependencies: { '@weftlet/toolkit': '0.9.0' }, scripts: { test: 'node --test', build: 'node build.mjs' } };
  await writeFile(join(directory, 'package.json'), JSON.stringify(pkg));
  await writeFile(join(directory, manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'), manager === 'npm' ? '{"lockfileVersion":3}' : "lockfileVersion: '9.0'\n");
  if (nested) {
    await mkdir(join(directory, 'tools', 'graph project'), { recursive: true });
    await writeFile(join(directory, 'tools/graph project/package.json'), JSON.stringify(pkg));
  }
  await initializeProject({ directory, clients: [] });
  return { directory, checks: true, ...(nested ? { workingDirectory: 'tools/graph project' } : {}) } satisfies CiSetupOptions;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function configure(options: CiSetupOptions, update: (value: any) => void) {
  const path = join(options.directory!, 'context-graph.config.json');
  const value = JSON.parse(await readFile(path, 'utf8')); update(value); await writeFile(path, JSON.stringify(value));
}
it('previews credential-free checks, preserves existing CI and config, and repeats unchanged', async () => {
  const options = await fixture(), root = options.directory!;
  await mkdir(join(root, '.github/workflows'), { recursive: true });
  const other = 'name: existing\non: push\npermissions: write-all\n# private-existing-token\njobs: {}\n';
  await writeFile(join(root, '.github/workflows/existing.yml'), other);
  await writeFile(join(root, '.npmrc'), '//registry.example/:_authToken=private-npm-token\n');
  await writeFile(join(root, 'architecture.policy.json'), JSON.stringify({ schemaVersion: 1, roots: ['src'], modules: [], rules: [], advisory: { maxLines: 400, maxComplexity: 20, duplicateMinTokens: 80 } }));
  const selected = { ...options, testScripts: ['test'], buildScript: 'build', architecturePolicy: 'architecture.policy.json' };
  const config = await readFile(join(root, 'context-graph.config.json'), 'utf8');
  const plan = await planCiSetup(selected), workflow = parse(plan.files[0]!.proposedContent);
  expect(await readdir(join(root, '.github/workflows'))).toEqual(['existing.yml']);
  expect(JSON.stringify(plan)).not.toMatch(/private-existing-token|private-npm-token/);
  expect(workflow.on).toEqual({ pull_request: {}, workflow_dispatch: {} });
  expect(workflow.permissions).toEqual({ contents: 'read' });
  const steps = workflow.jobs.checks.steps;
  expect(steps.some((step: any) => step.run === "npm run 'test'")).toBe(true);
  expect(steps.some((step: any) => step.run?.includes('govern --policy'))).toBe(true);
  expect(steps.some((step: any) => step.env || step.uses?.includes('upload-artifact'))).toBe(false);
  expect(plan.files[0]!.proposedContent).not.toContain('secrets.');
  await applyCiSetup(selected, plan.planId);
  expect(await readFile(join(root, '.github/workflows/existing.yml'), 'utf8')).toBe(other);
  expect(await readFile(join(root, 'context-graph.config.json'), 'utf8')).toBe(config);
  expect((await planCiSetup(selected)).files[0]!.action).toBe('unchanged');
});
it('handles a nested pnpm project and large frozen lockfile without replacing its bytes', async () => {
  const options = await fixture('pnpm', true), root = options.directory!;
  const lock = "lockfileVersion: '9.0'\n# " + 'x'.repeat(300_000);
  await writeFile(join(root, 'pnpm-lock.yaml'), lock);
  const plan = await planCiSetup(options), value = parse(plan.files[0]!.proposedContent);
  expect(value.defaults.run['working-directory']).toBe('tools/graph project');
  expect(value.jobs.checks.steps.find((s: any) => s.uses?.startsWith('pnpm/')).with.version).toBe('10.18.2');
  expect(value.jobs.checks.steps.find((s: any) => s.run === 'pnpm install --frozen-lockfile')['working-directory']).toBe('.');
  await applyCiSetup(options, plan.planId);
  expect(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')).toBe(lock);
});
it.each([
  ['codex-cli', '0.153.4', '@openai/codex', 'CODEX_API_KEY'],
  ['claude-cli', '2.1.321', '@anthropic-ai/claude-code', 'ANTHROPIC_API_KEY'],
  ['opencode-cli', '1.19.5', 'opencode-ai', 'WEFTLET_OPENCODE_API_KEY'],
])('generates provider-specific hosted API setup for %s with secrets only at hydration', async (provider, version, pkg, key) => {
  const options = await fixture();
  await configure(options, value => { value.semantic.provider = provider; value.semantic.auth = { mode: 'api-key' }; if (provider === 'opencode-cli') value.semantic.model = 'openai/gpt-example'; });
  const plan = await planCiSetup({ ...options, checks: false, generate: true, runner: 'hosted', environment: 'reviewed-generation', providerVersion: version });
  const workflow = parse(plan.files[0]!.proposedContent), job = workflow.jobs.generate;
  expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
  expect(workflow.on.workflow_dispatch.inputs.allow_model.default).toBe(false);
  expect(job.if).toContain('github.event.repository.default_branch');
  expect(job.if).toContain('inputs.allow_model');
  expect(job.environment).toBe('reviewed-generation');
  expect(job.steps.find((step: any) => step.run?.includes('npm install --global')).run).toContain(`${pkg}@${version}`);
  expect(job.steps.filter((step: any) => step.env)).toHaveLength(1);
  expect(job.steps.find((step: any) => step.env).env).toEqual({ [key!]: `\${{ secrets.${key} }}` });
  expect(job.steps.find((step: any) => step.env).run).toContain('hydrate --ref');
  expect(plan.files[0]!.proposedContent).not.toMatch(/pull_request|upload-artifact|id-token|contents: write/);
});
it('retains account authentication on an explicitly selected trusted self-hosted runner', async () => {
  const options = await fixture();
  const selected: CiSetupOptions = { ...options, checks: false, generate: true, runner: 'self-hosted', environment: 'reviewed-generation', providerVersion: '0.153.4' };
  const plan = await planCiSetup(selected), job = parse(plan.files[0]!.proposedContent).jobs.generate;
  expect(job['runs-on']).toEqual(['self-hosted', 'linux', 'weftlet-generation']);
  expect(plan.generation!.authentication).toBe('chatgpt');
  expect(plan.files[0]!.proposedContent).not.toMatch(/secrets\.|npm install --global.*codex|codex login/);
  await expect(planCiSetup({ ...selected, runner: 'hosted' })).rejects.toThrow('explicitly selected api-key');
});
it('refuses stale inputs and customized workflows even during managed updates', async () => {
  const options = await fixture(); const plan = await planCiSetup(options);
  await writeFile(join(options.directory!, 'package-lock.json'), '{"lockfileVersion":3,"changed":true}');
  await expect(applyCiSetup(options, plan.planId)).rejects.toThrow('stale');
  const fresh = await planCiSetup(options); await applyCiSetup(options, fresh.planId);
  const selected = { ...options, testScripts: ['test'] };
  expect((await planCiSetup(selected)).files[0]!.action).toBe('update-available');
  const updated = { ...selected, update: true }, update = await planCiSetup(updated);
  await applyCiSetup(updated, update.planId);
  const path = join(options.directory!, update.files[0]!.path);
  await writeFile(path, (await readFile(path, 'utf8')).replaceAll('\n', '\r\n'));
  expect((await planCiSetup(updated)).files[0]!.action).toBe('unchanged');
  await writeFile(path, `${await readFile(path, 'utf8')}# my customized workflow\n`);
  const blocked = await planCiSetup(updated);
  expect(blocked.ready).toBe(false);
  expect(blocked.files[0]!.action).toBe('conflict');
  await expect(applyCiSetup(updated, blocked.planId)).rejects.toThrow('preserves customized');
});
it('rejects ambiguous managers, missing scripts, unsafe paths and linked workflow directories', async () => {
  const options = await fixture(), root = options.directory!;
  await expect(planCiSetup({ ...options, testScripts: ['not-a-script'] })).rejects.toThrow('existing package script');
  await expect(planCiSetup({ ...options, configPath: '../escape.json' })).rejects.toThrow('inside');
  await expect(planCiSetup({ ...options, workingDirectory: '${{ secrets.TOKEN }}' })).rejects.toThrow('workflow expressions');
  await writeFile(join(root, 'pnpm-lock.yaml'), '{}');
  await expect(planCiSetup(options)).rejects.toThrow('exactly one root lockfile');
  await rm(join(root, 'pnpm-lock.yaml'));
  const outside = await fixture(); await mkdir(join(root, '.github'));
  await symlink(outside.directory!, join(root, '.github/workflows'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(planCiSetup(options)).rejects.toThrow('symbolic link or junction');
});
it('requires explicit generation budgets and rejects dangerous credential variable names', async () => {
  const options = await fixture();
  const selected: CiSetupOptions = { ...options, generate: true, runner: 'hosted', environment: 'reviewed-generation', providerVersion: '0.153.4' };
  await configure(options, value => { value.semantic.auth = { mode: 'api-key', apiKeyEnv: 'NODE_OPTIONS' }; });
  await expect(planCiSetup(selected)).rejects.toThrow('dedicated credential variable');
  await configure(options, value => { value.semantic.auth = { mode: 'api-key' }; delete value.semantic.maxDocuments; });
  await expect(planCiSetup(selected)).rejects.toThrow('explicit semantic.maxDocuments');
});
