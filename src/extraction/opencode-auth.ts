import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import type { ContextGraphConfig } from '../configuration/config.js';
import type { SemanticCommandEnvironment } from './semantic-environment.js';
import { resolveCliInvocation } from './cli-command.js';
import { openCodeBackend, supportedOpenCodeVersion } from './opencode-profile.js';
import { SemanticProviderError, type SemanticRunOptions } from './semantic-process.js';

export const resolveOpenCodeInvocation = (env: SemanticCommandEnvironment, options: SemanticRunOptions = {},
  platform: NodeJS.Platform = process.platform) =>
  resolveCliInvocation('opencode', 'opencode-ai', 'OpenCode', 'opencode', env, platform, options);

export async function inspectOpenCodeInstallation(env: SemanticCommandEnvironment, cwd: string, options: SemanticRunOptions = {}) {
  try {
    const started = performance.now(), timeoutMs = Math.min(options.timeoutMs ?? 5000, 5000);
    const invocation = await resolveOpenCodeInvocation(env, { ...options, timeoutMs });
    const remaining = Math.ceil(timeoutMs - (performance.now() - started));
    if (remaining <= 0) throw Error('deadline');
    const { stdout } = await promisify(execFile)(invocation.command, [...invocation.prefixArgs, '--version'],
      { cwd, env, timeout: remaining, signal: options.signal, maxBuffer: 8192, windowsHide: true });
    const version = /^\d+\.\d+\.\d+$/.test(stdout.trim()) ? stdout.trim() : undefined;
    return { available: true, supported: version === supportedOpenCodeVersion, version };
  } catch {
    if (options.signal?.aborted) throw new SemanticProviderError('cancelled', 'OpenCode status check cancelled');
    return { available: false, supported: false, version: undefined };
  }
}

/** Only the explicitly selected backend's saved API entry is forwarded, in memory. */
export async function openCodeApiCredential(config: ContextGraphConfig['semantic'], source: Readonly<Record<string, string | undefined>>) {
  const backend = openCodeBackend(config.model);
  if (config.auth?.mode === 'api-key') {
    const name = config.auth.apiKeyEnv ?? 'WEFTLET_OPENCODE_API_KEY';
    const key = source[name];
    if (!key?.trim()) throw new SemanticProviderError('unavailable',
      `OpenCode API authentication requires the ${name} environment variable; no saved-login fallback was attempted`);
    return { [backend]: { type: 'api', key } };
  }
  if (config.auth !== undefined && config.auth.mode !== 'opencode-auth') throw new SemanticProviderError('unavailable', 'Unsupported OpenCode authentication mode');
  const data = source.XDG_DATA_HOME;
  const root = data && isAbsolute(data) ? data : join(homedir(), '.local', 'share');
  const saved = await readAuthStore(join(root, 'opencode', 'auth.json'));
  const entry = saved?.[backend];
  if (entry?.type !== 'api' || typeof entry.key !== 'string' || !entry.key.trim()) {
    throw new SemanticProviderError('unavailable',
      'The selected OpenCode backend needs a saved API credential. Subscription/OAuth refresh is not supported by this adapter yet; no provider or billing fallback was attempted');
  }
  return { [backend]: { type: 'api', key: entry.key } };
}

async function readAuthStore(path: string): Promise<Record<string, { type?: unknown; key?: unknown }> | undefined> {
  try {
    const handle = await open(path, 'r');
    try {
      const bytes = Buffer.alloc(262_145);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 262_144) return;
      const value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
    } finally { await handle.close(); }
  } catch { return undefined; }
}
