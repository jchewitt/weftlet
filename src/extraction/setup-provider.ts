import type { ContextGraphConfig } from '../configuration/config.js';
import { runCodexStructuredRequest, type CodexStructuredRuntime } from './codex-request.js';
import { runClaudeStructuredRequest, type ClaudeRuntime } from './claude-request.js';
import { runOpenCodeStructuredRequest, type OpenCodeRuntime } from './opencode-request.js';
import { SemanticProviderError, type SemanticRunOptions } from './semantic-process.js';

export interface SetupProviderRuntime { codex?: CodexStructuredRuntime; claude?: ClaudeRuntime; opencode?: OpenCodeRuntime }
/** Dedicated setup contract: one selected CLI, no retries, fallback, extraction or executable model output. */
export async function runSetupProvider(config: ContextGraphConfig['semantic'], schema: unknown, prompt: string,
  maxOutputBytes: number, options: SemanticRunOptions = {}, runtime: SetupProviderRuntime = {}) {
  if (config.provider === 'module') throw new SemanticProviderError('unavailable', 'Assisted setup currently supports Codex, Claude and OpenCode CLI contracts; semantic modules are not setup planners');
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : [])]);
  const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? 120_000;
  const timer = setTimeout(() => controller.abort(new SemanticProviderError('timeout', 'Assisted setup timed out')), timeoutMs);
  try {
    signal.throwIfAborted();
    const bounded = { ...options, signal, timeoutMs };
    if (config.provider === 'claude-cli') return await runClaudeStructuredRequest(config, schema, prompt, maxOutputBytes, bounded, runtime.claude);
    if (config.provider === 'opencode-cli') return await runOpenCodeStructuredRequest(config, schema, prompt, maxOutputBytes, bounded, runtime.opencode);
    return await runCodexStructuredRequest(config, schema, prompt, maxOutputBytes, bounded, runtime.codex);
  } finally { clearTimeout(timer); }
}
