import { mkdtemp, mkdir, readFile, rm, writeFile, symlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { assistedInputId, previewAssistedInputs, proposeAssistedSetup, reviewAssistedPlan, applyAssistedPlan, saveAssistedPlan } from './plan.js';
import { validateRecommendation, type SetupRecommendation } from './contract.js';
import { integrateChecks } from './workflow.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'weftlet-assist-')); roots.push(directory);
  const config = JSON.parse(await readFile('examples/generic-typescript/context-graph.config.json', 'utf8'));
  config.repositoryRoot = '.'; config.semanticSources = ['docs/old.md']; config.approvedIntentSources = ['docs/old.md'];
  config.semantic.provider = 'codex-cli'; config.semantic.auth = { mode: 'chatgpt' };
  await mkdir(join(directory, 'docs'));
  await writeFile(join(directory, 'context-graph.config.json'), JSON.stringify(config));
  await writeFile(join(directory, 'docs/new.md'), '# Proposal\nPlanning notes: use Claude for development.\n');
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'public-example', scripts: { test: 'echo never-execute', build: 'echo never-execute' }, devDependencies: { '@weftlet/toolkit': '0.9.0' } }));
  await writeFile(join(directory, 'package-lock.json'), '{"lockfileVersion":3}');
  await mkdir(join(directory, '.github/workflows'), { recursive: true });
  await writeFile(join(directory, '.github/workflows/ci.yml'), '# keep my comment\nname: Existing\non: [push, pull_request]\npermissions: {contents: read}\njobs:\n  existing:\n    runs-on: ubuntu-latest\n    steps: [{run: "echo keep"}]\n');
  return { directory, inputs: ['docs/new.md', 'package.json', '.github/workflows/ci.yml'] };
}
const recommendation = (): SetupRecommendation => ({ explanation: 'Add selected document, Claude instructions and isolated CI checks.',
  semanticSources: ['docs/old.md', 'docs/new.md'], approvedIntentSources: null, clients: ['claude'], mcp: true,
  ci: { workingDirectory: '.', buildScript: 'build', testScripts: ['test'], existingWorkflow: '.github/workflows/ci.yml' }, notes: ['Source ownership remains a user decision.'] });
function runtime(result: unknown) {
  const run = vi.fn(async (_command: string, args: readonly string[], cwd: string, prompt: string) => {
    expect(prompt).toContain('untrusted data'); expect(prompt).not.toContain('echo never-execute');
    expect(cwd).not.toContain('weftlet-assist-'); expect(args).toContain('read-only');
    await writeFile(args[args.indexOf('--output-last-message') + 1]!, JSON.stringify(result));
  });
  return { codex: { authenticate: async () => ({}), invocation: async () => ({ command: 'fake', prefixArgs: [] }), run } };
}
async function propose(options: Awaited<ReturnType<typeof fixture>>, result = recommendation()) {
  const summary = await previewAssistedInputs(options), hooks = runtime(result);
  const plan = await proposeAssistedSetup(options, { allowModel: true, expectedInputId: assistedInputId(summary) }, {}, hooks);
  expect(hooks.codex.run).toHaveBeenCalledOnce(); return plan;
}
it('previews inputs without providers, proposes a typed diff and applies without another model request', async () => {
  const options = await fixture(), root = options.directory;
  const beforeConfig = JSON.parse(await readFile(join(root, 'context-graph.config.json'), 'utf8'));
  const beforeWorkflow = parse(await readFile(join(root, '.github/workflows/ci.yml'), 'utf8'));
  const plan = await propose(options);
  expect(plan.preview.authorityChanged).toBe(false);
  expect(plan.preview.files.map(file => file.path)).toContain('.claude/skills/context-graph-development/SKILL.md');
  expect(JSON.stringify(plan)).not.toContain('echo never-execute');
  expect(JSON.parse(await readFile(join(root, 'context-graph.config.json'), 'utf8'))).toEqual(beforeConfig);
  await saveAssistedPlan(root, '.weftlet/proposal.json', plan);
  expect((await reviewAssistedPlan(JSON.parse(await readFile(join(root, '.weftlet/proposal.json'), 'utf8')))).plan).toEqual(plan);
  await applyAssistedPlan(plan, plan.planId);
  const config = JSON.parse(await readFile(join(root, 'context-graph.config.json'), 'utf8'));
  expect(config).toEqual({ ...beforeConfig, semanticSources: ['docs/old.md', 'docs/new.md'] });
  const workflowText = await readFile(join(root, '.github/workflows/ci.yml'), 'utf8'), workflow = parse(workflowText);
  expect(workflowText).toContain('# keep my comment');
  expect(workflow.on).toEqual(beforeWorkflow.on); expect(workflow.permissions).toEqual(beforeWorkflow.permissions);
  expect(workflow.jobs.existing).toEqual(beforeWorkflow.jobs.existing);
  expect(workflow.jobs.weftlet_checks.permissions).toEqual({ contents: 'read' });
  expect(workflow.jobs.weftlet_checks.defaults.run['working-directory']).toBe('.');
  expect(workflow.jobs.weftlet_checks.env.WEFTLET_CONFIG).toBe('context-graph.config.json');
  await expect(stat(join(root, '.github/workflows/weftlet-check.yml'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(applyAssistedPlan(plan, plan.planId)).rejects.toThrow('stale');
  const next = await propose(options); expect(next.preview.files).toEqual([]);
});
it('requires input consent and separate explicit bulk authority acceptance', async () => {
  const options = await fixture(), hooks = runtime(recommendation());
  await expect(proposeAssistedSetup(options, { allowModel: false, expectedInputId: '' }, {}, hooks)).rejects.toThrow('allow-model');
  await expect(proposeAssistedSetup(options, { allowModel: true, expectedInputId: 'wrong' }, {}, hooks)).rejects.toThrow('selection changed');
  expect(hooks.codex.run).not.toHaveBeenCalled();
  const plan = await propose(options, { ...recommendation(), approvedIntentSources: ['docs/old.md', 'docs/new.md'] });
  await expect(applyAssistedPlan(plan, plan.planId)).rejects.toThrow('accept-authority');
  await expect(stat(join(options.directory, '.mcp.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  await applyAssistedPlan(plan, plan.planId, true);
  expect(JSON.parse(await readFile(join(options.directory, 'context-graph.config.json'), 'utf8')).approvedIntentSources).toEqual(['docs/old.md', 'docs/new.md']);
});
it('rejects stale guards, tampered plans and edited managed files before writing', async () => {
  const options = await fixture(), plan = await propose(options);
  await expect(applyAssistedPlan({ ...plan, recommendation: { ...plan.recommendation, clients: ['codex'] } }, plan.planId)).rejects.toThrow('stale');
  await writeFile(join(options.directory, 'package-lock.json'), '{"lockfileVersion":3,"changed":true}');
  await expect(applyAssistedPlan(plan, plan.planId)).rejects.toThrow('stale');
  await expect(stat(join(options.directory, '.mcp.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  await mkdir(join(options.directory, '.claude/skills/context-graph-development'), { recursive: true });
  await writeFile(join(options.directory, '.claude/skills/context-graph-development/SKILL.md'), 'custom policy');
  await expect(propose(options)).rejects.toThrow('Customized');
});
it('rejects arbitrary patches, invented source paths/scripts and privileged CI integration', async () => {
  const options = await fixture();
  expect(() => validateRecommendation({ ...recommendation(), commands: ['curl unsafe'] })).toThrow('fields');
  for (const response of [
    { ...recommendation(), semanticSources: ['**/*'] },
    { ...recommendation(), ci: { ...recommendation().ci!, testScripts: ['invented'] } },
    { ...recommendation(), ci: { ...recommendation().ci!, workingDirectory: '../escape' } },
  ]) await expect(propose(options, response)).rejects.toThrow();
  await writeFile(join(options.directory, '.github/workflows/ci.yml'), 'on: pull_request_target\njobs: {existing: {runs-on: ubuntu-latest}}\n');
  await expect(propose(options)).rejects.toThrow('privileged');
});
it('limits selected input size/types and refuses credential-looking content or filesystem links', async () => {
  const options = await fixture();
  for (const path of ['.env', '.codex/config.toml', '../secret.md', 'node_modules/readme.md']) {
    await expect(previewAssistedInputs({ ...options, inputs: [path] })).rejects.toThrow();
  }
  await writeFile(join(options.directory, 'package.json'), 'not-json-private-fixture');
  await expect(previewAssistedInputs({ ...options, inputs: ['package.json'] })).rejects.toThrow('Selected package manifest is not valid JSON');
  await writeFile(join(options.directory, 'package.json'), '{}');
  await writeFile(join(options.directory, 'docs/new.md'), 'api_key: "a-public-fixture-secret"');
  await expect(previewAssistedInputs(options)).rejects.toThrow('credentials');
  await writeFile(join(options.directory, 'docs/new.md'), 'x'.repeat(65_537));
  await expect(previewAssistedInputs(options)).rejects.toThrow('65536');
  if (process.platform !== 'win32') {
    await rm(join(options.directory, 'docs/new.md')); await symlink('old.md', join(options.directory, 'docs/new.md'));
    await expect(previewAssistedInputs(options)).rejects.toThrow('symbolic');
  }
});
it('preserves private existing client settings while exposing only the new MCP entry', async () => {
  const options = await fixture();
  await writeFile(join(options.directory, '.mcp.json'), JSON.stringify({ mcpServers: { existing: { command: 'existing', env: { TOKEN: 'private-client-value' } } } }));
  const plan = await propose(options);
  expect(JSON.stringify(plan)).not.toContain('private-client-value');
  await applyAssistedPlan(plan, plan.planId);
  expect(JSON.parse(await readFile(join(options.directory, '.mcp.json'), 'utf8')).mcpServers.existing.env.TOKEN).toBe('private-client-value');
});
it('detects files edited during the request and never applies partial model output', async () => {
  const options = await fixture(), summary = await previewAssistedInputs(options), hooks = runtime(recommendation());
  const original = hooks.codex.run;
  hooks.codex.run = vi.fn(async (...args: Parameters<typeof original>) => {
    await original(...args); await writeFile(join(options.directory, 'docs/new.md'), 'changed during request');
  });
  await expect(proposeAssistedSetup(options, { allowModel: true, expectedInputId: assistedInputId(summary) }, {}, hooks)).rejects.toThrow('changed during planning');
});
it('refuses alias expansion/duplicate keys and replacement of an existing check job', () => {
  const scaffold = 'env: {WEFTLET_CONFIG: x}\ndefaults: {run: {shell: bash}}\njobs: {checks: {runs-on: ubuntu-latest}}\n';
  expect(() => integrateChecks('on: push\njobs: &jobs {other: {runs-on: ubuntu-latest}}\nextra: *jobs\n', scaffold)).toThrow();
  expect(() => integrateChecks('on: push\non: pull_request\njobs: {}', scaffold)).toThrow();
  expect(() => integrateChecks('on: push\njobs: {weftlet_checks: {runs-on: self-hosted}}', scaffold)).toThrow('differs');
});

it('rejects inherited workflow environments and preserves every file when assisted CI isolation cannot be established', async () => {
  const options = await fixture();
  const workflowPath = join(options.directory, '.github/workflows/ci.yml');
  const before = await readFile(workflowPath, 'utf8');
  const configPath = join(options.directory, 'context-graph.config.json');
  const configBefore = await readFile(configPath);
  for (const environment of ['env: {DEPLOY_TOKEN: "${{ secrets.DEPLOY_TOKEN }}"}', 'env: {NODE_ENV: test}', 'env: "${{ vars }}"']) {
    const content = `${environment}\n${before}`;
    await writeFile(workflowPath, content);
    await expect(propose(options)).rejects.toThrow('workflow-level environment');
    expect(await readFile(workflowPath, 'utf8')).toBe(content);
    expect(await readFile(configPath)).toEqual(configBefore);
    await expect(stat(join(options.directory, '.mcp.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  }
  await writeFile(workflowPath, `env: {}\n${before}`);
  const plan = await propose(options);
  await applyAssistedPlan(plan, plan.planId);
  const applied = parse(await readFile(workflowPath, 'utf8'));
  expect(applied.env).toEqual({});
  expect(applied.jobs.existing).toEqual(parse(before).jobs.existing);
});
