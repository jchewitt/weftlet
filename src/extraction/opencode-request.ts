import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContextGraphConfig } from '../configuration/config.js';
import { captureSemanticProcess, SemanticProviderError, type SemanticRunOptions } from './semantic-process.js';
import { openCodeEnvironment, openCodeProfile, supportedOpenCodeVersion } from './opencode-profile.js';
import { inspectOpenCodeInstallation, openCodeApiCredential, resolveOpenCodeInvocation } from './opencode-auth.js';
import { parseOpenCodeOutput } from './opencode-output.js';

export interface OpenCodeRuntime {
  readonly inspect?: typeof inspectOpenCodeInstallation;
  readonly authenticate?: typeof openCodeApiCredential;
  readonly invocation?: typeof resolveOpenCodeInvocation;
  readonly run?: typeof captureSemanticProcess;
  /** Test seam for the real CLI against a local, credential-free protocol fixture. */
  readonly profile?: typeof openCodeProfile;
}

export async function withOpenCodeWorkspace<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-opencode-'));
  try { return await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

export async function runOpenCodeStructuredRequest(config: ContextGraphConfig['semantic'], schema: unknown,
  prompt: string, maxOutputBytes: number, options: SemanticRunOptions = {}, runtime: OpenCodeRuntime = {}): Promise<unknown> {
  if (options.signal?.aborted) throw new SemanticProviderError('cancelled', 'Semantic extraction cancelled');
  return withOpenCodeWorkspace(async root => {
    const env = openCodeEnvironment(root, process.env);
    const installation = await (runtime.inspect ?? inspectOpenCodeInstallation)(env, root, options);
    if (!installation.supported) throw new SemanticProviderError('unavailable', `OpenCode ${supportedOpenCodeVersion} is required by this tested adapter contract; run doctor to inspect readiness`);
    env.OPENCODE_AUTH_CONTENT = JSON.stringify(await (runtime.authenticate ?? openCodeApiCredential)(config, process.env));
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify((runtime.profile ?? openCodeProfile)(config));
    const started = performance.now(), timeoutMs = options.timeoutMs ?? config.timeoutMs ?? 120_000;
    const invocation = await (runtime.invocation ?? resolveOpenCodeInvocation)(env, { ...options, timeoutMs });
    const remaining = Math.ceil(timeoutMs - (performance.now() - started));
    if (remaining <= 0) throw new SemanticProviderError('timeout', 'OpenCode executable discovery timed out');
    const args = ['run', '--pure', '--format', 'json', '--model', config.model, '--agent', 'weftlet', '--title', 'Weftlet extraction',
      ...(config.reasoningEffort === 'default' ? [] : ['--variant', config.reasoningEffort])];
    const input = `Return exactly one JSON object matching this schema, with no markdown fences or surrounding explanation. Do not use tools.\n${JSON.stringify(schema)}\n\n${prompt}`;
    const raw = await (runtime.run ?? captureSemanticProcess)(invocation.command, [...invocation.prefixArgs, ...args],
      root, input, env, maxOutputBytes, { ...options, timeoutMs: remaining });
    return parseOpenCodeOutput(raw);
  });
}
