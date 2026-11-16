import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContextGraphConfig } from '../configuration/config.js';
import { prepareCodexAuthentication } from './codex-auth.js';
import { resolveCodexInvocation } from './codex-command.js';
import { runSemanticProcess, SemanticProviderError, type SemanticRunOptions } from './semantic-process.js';

export interface CodexStructuredRuntime {
  readonly authenticate?: typeof prepareCodexAuthentication;
  readonly invocation?: typeof resolveCodexInvocation;
  readonly run?: typeof runSemanticProcess;
}
/** An isolated, tool-disabled structured request with the configured authentication. */
export async function runCodexStructuredRequest(config: ContextGraphConfig['semantic'], schema: unknown,
  prompt: string, maxOutputBytes: number, options: SemanticRunOptions = {}, runtime: CodexStructuredRuntime = {}): Promise<unknown> {
  const env = await (runtime.authenticate ?? prepareCodexAuthentication)(config.auth, process.env, 'codex', options);
  const invocation = await (runtime.invocation ?? resolveCodexInvocation)('codex', env, process.platform, options);
  options.signal?.throwIfAborted();
  const root = await mkdtemp(join(tmpdir(), 'weftlet-structured-'));
  try {
    const schemaPath = join(root, 'schema.json'), output = join(root, 'output.json');
    await writeFile(schemaPath, JSON.stringify(schema));
    const args = ['exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
      '--disable', 'shell_tool', '--cd', root, '--sandbox', 'read-only', '--model', config.model,
      '-c', `model_reasoning_effort="${config.reasoningEffort}"`, '--output-schema', schemaPath, '--output-last-message', output, '-'];
    await (runtime.run ?? runSemanticProcess)(invocation.command, [...invocation.prefixArgs, ...args], root, prompt, env, options);
    if ((await stat(output)).size > maxOutputBytes) throw new SemanticProviderError('invalid-output', 'Structured output exceeds the byte limit');
    try { return JSON.parse(await readFile(output, 'utf8')); }
    catch { throw new SemanticProviderError('invalid-output', 'Structured output is not JSON'); }
  } finally { await rm(root, { recursive: true, force: true }); }
}
