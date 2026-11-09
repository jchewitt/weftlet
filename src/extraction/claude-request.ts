import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContextGraphConfig } from '../configuration/config.js';
import { captureSemanticProcess, SemanticProviderError, type SemanticRunOptions } from './semantic-process.js';
import { claudeCommandEnvironment, inspectClaudeInstallation, prepareClaudeAuthentication, resolveClaudeInvocation } from './claude-auth.js';

export interface ClaudeRuntime {
  readonly inspect?: typeof inspectClaudeInstallation;
  readonly authenticate?: typeof prepareClaudeAuthentication;
  readonly invocation?: typeof resolveClaudeInvocation;
  readonly run?: typeof captureSemanticProcess;
}

/** One explicit Claude request. Caller controls any retries; there is no provider fallback. */
export async function runClaudeStructuredRequest(config: ContextGraphConfig['semantic'], schema: unknown,
  prompt: string, maxOutputBytes: number, options: SemanticRunOptions = {}, runtime: ClaudeRuntime = {}): Promise<unknown> {
  const installation = await (runtime.inspect ?? inspectClaudeInstallation)(claudeCommandEnvironment(process.env), options);
  if (!installation.available || !installation.supported) throw new SemanticProviderError('unavailable',
    'Claude Code 2.1.321 or later in major version 2 is required; run doctor to inspect readiness');
  const environment = await (runtime.authenticate ?? prepareClaudeAuthentication)(config.auth, process.env, options);
  const root = await mkdtemp(join(tmpdir(), 'weftlet-claude-'));
  try {
    const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? 120_000;
    const started = performance.now();
    const invocation = await (runtime.invocation ?? resolveClaudeInvocation)(environment, { ...options, timeoutMs });
    const remaining = Math.ceil(timeoutMs - (performance.now() - started));
    if (remaining <= 0) throw new SemanticProviderError('timeout', 'Claude executable discovery timed out');
    const args = ['--print', '--output-format', 'json', '--json-schema', JSON.stringify(schema),
      '--model', config.model, '--effort', config.reasoningEffort,
      '--safe-mode', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--tools', '', '--disable-slash-commands', '--no-session-persistence', '--no-chrome',
      '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
      ...(config.auth?.mode === 'api-key' ? ['--bare'] : [])];
    const raw = await (runtime.run ?? captureSemanticProcess)(invocation.command, [...invocation.prefixArgs, ...args],
      root, prompt, environment, maxOutputBytes, { ...options, timeoutMs: remaining });
    return parseClaudeResult(raw);
  } finally { await rm(root, { recursive: true, force: true }); }
}

function parseClaudeResult(raw: string): unknown {
  let result;
  try { result = JSON.parse(raw); }
  catch { throw new SemanticProviderError('invalid-output', 'Claude output is not a JSON result'); }
  if (result?.type !== 'result' || result.subtype !== 'success' || result.is_error !== false ||
    result.structured_output === undefined || result.structured_output === null) {
    throw new SemanticProviderError('invalid-output', 'Claude did not return a successful structured result');
  }
  return result.structured_output;
}
