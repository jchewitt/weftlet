import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { assistedInputId, previewAssistedInputs, proposeAssistedSetup, saveAssistedPlan } from '../application/setup/assist/plan.js';

const exec = promisify(execFile);
it('source CLI previews, reviews and applies a saved proposal from another cwd without a provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'assist-cli-'));
  try {
    const config = JSON.parse(await readFile('examples/generic-typescript/context-graph.config.json', 'utf8'));
    config.repositoryRoot = '.'; config.semantic.provider = 'codex-cli'; config.semantic.auth = { mode: 'chatgpt' };
    await writeFile(join(root, 'context-graph.config.json'), JSON.stringify(config));
    await mkdir(join(root, 'docs')); await writeFile(join(root, 'docs/intent.md'), '# Public intent');
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
    const base = ['--import', tsx, resolve('src/cli.ts'), 'setup', 'assist', '--directory', root];
    const result = await exec(process.execPath, [...base, '--input', 'docs/intent.md', '--dry-run', '--json'], { cwd: tmpdir() });
    expect(JSON.parse(result.stdout)).toMatchObject({ modelCalled: false, requests: 1, retries: 0 });
    const options = { directory: root, inputs: ['docs/intent.md'] };
    const recommendation = { explanation: 'Install Claude skill', semanticSources: null, approvedIntentSources: null, clients: ['claude'], mcp: false, ci: null, notes: [] };
    const plan = await proposeAssistedSetup(options, { allowModel: true, expectedInputId: assistedInputId(await previewAssistedInputs(options)) }, {}, {
      codex: { authenticate: async () => ({}), invocation: async () => ({ command: 'fake', prefixArgs: [] }),
        run: async (_cmd, args) => { await writeFile(args[args.indexOf('--output-last-message') + 1]!, JSON.stringify(recommendation)); } },
    });
    await saveAssistedPlan(root, '.weftlet/plan.json', plan);
    const review = await exec(process.execPath, [...base, '--plan', '.weftlet/plan.json'], { cwd: tmpdir() });
    expect(JSON.parse(review.stdout)).toMatchObject({ planId: plan.planId, applied: false });
    const applied = await exec(process.execPath, [...base, '--plan', '.weftlet/plan.json', '--apply', '--expect-plan', plan.planId], { cwd: tmpdir() });
    expect(JSON.parse(applied.stdout).applied).toBe(true);
    expect(await readFile(join(root, '.claude/skills/context-graph-development/SKILL.md'), 'utf8')).toContain('context-graph');
    for (const flags of [ ['--input', 'docs/intent.md', '--allow-model'], ['--input', 'docs/intent.md', '--apply'], ['--plan', '.weftlet/plan.json', '--allow-model'], ['--allow-model', '--dry-run', '--input', 'docs/intent.md'] ]) {
      await expect(exec(process.execPath, [...base, ...flags], { cwd: tmpdir() })).rejects.toThrow();
    }
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);
