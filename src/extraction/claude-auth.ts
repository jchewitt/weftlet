import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import type { ContextGraphConfig } from '../configuration/config.js';
import { resolveCliInvocation } from './cli-command.js';
import { semanticCommandEnvironment, type SemanticCommandEnvironment } from './semantic-environment.js';
import { SemanticProviderError, type SemanticRunOptions } from './semantic-process.js';

export const resolveClaudeInvocation = (environment: SemanticCommandEnvironment, options: SemanticRunOptions = {},
  platform: NodeJS.Platform = process.platform) =>
  resolveCliInvocation('claude', '@anthropic-ai/claude-code', 'Claude Code', 'claude', environment, platform, options);

export function claudeCommandEnvironment(source: Readonly<Record<string, string | undefined>>): SemanticCommandEnvironment {
  const environment = semanticCommandEnvironment(source);
  delete environment.CODEX_HOME;
  if (source.CLAUDE_CONFIG_DIR) environment.CLAUDE_CONFIG_DIR = source.CLAUDE_CONFIG_DIR;
  // Do not inherit API keys, OAuth tokens, endpoints, provider switches, plugins or project settings.
  environment.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  return environment;
}

async function probe(args: readonly string[], environment: SemanticCommandEnvironment, options: SemanticRunOptions) {
  const started = performance.now();
  const timeout = Math.min(options.timeoutMs ?? 5000, 5000);
  const invocation = await resolveClaudeInvocation(environment, { ...options, timeoutMs: timeout });
  const remaining = Math.ceil(timeout - (performance.now() - started));
  if (remaining <= 0) throw new SemanticProviderError('timeout', 'Claude Code status check timed out');
  return promisify(execFile)(invocation.command, [...invocation.prefixArgs, ...args], {
    cwd: tmpdir(), env: environment, timeout: remaining, signal: options.signal, maxBuffer: 8192, windowsHide: true,
  });
}

/** Contract inspected with 2.1.321. Earlier CLI customization-isolation contracts are not qualified. */
export async function inspectClaudeInstallation(environment: SemanticCommandEnvironment, options: SemanticRunOptions = {}) {
  try {
    const { stdout } = await probe(['--version'], environment, options);
    const version = /^(\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(stdout.trim());
    const supported = !!version && Number(version[1]) === 2 &&
      (Number(version[2]) > 1 || (Number(version[2]) === 1 && Number(version[3]) >= 321));
    return { available: true, supported, version: version?.[0].trim() };
  } catch {
    if (options.signal?.aborted) throw new SemanticProviderError('cancelled', 'Claude Code status check cancelled');
    return { available: false, supported: false, version: undefined };
  }
}

export type ClaudeLoginMode = 'claude-login' | 'other' | 'unavailable';
/** Never expose status JSON: it can include account details. No authentication mutation. */
export async function readClaudeLoginMode(environment: SemanticCommandEnvironment, options: SemanticRunOptions = {}): Promise<ClaudeLoginMode> {
  try {
    const { stdout } = await probe(['--safe-mode', '--setting-sources', '', 'auth', 'status', '--json'], environment, options);
    const status = JSON.parse(stdout);
    return status.loggedIn === true && status.authMethod === 'claude.ai' && status.apiProvider === 'firstParty'
      ? 'claude-login' : 'other';
  } catch {
    if (options.signal?.aborted) throw new SemanticProviderError('cancelled', 'Claude Code status check cancelled');
    return 'unavailable';
  }
}

export async function prepareClaudeAuthentication(auth: ContextGraphConfig['semantic']['auth'],
  source: Readonly<Record<string, string | undefined>>, options: SemanticRunOptions = {},
  loginProbe: typeof readClaudeLoginMode = readClaudeLoginMode): Promise<SemanticCommandEnvironment> {
  if (options.signal?.aborted) throw new SemanticProviderError('cancelled', 'Semantic extraction cancelled');
  const environment = claudeCommandEnvironment(source);
  if (auth?.mode === 'api-key') {
    const name = auth.apiKeyEnv ?? 'ANTHROPIC_API_KEY';
    const key = source[name];
    if (!key?.trim()) throw new SemanticProviderError('unavailable',
      `Claude API-key authentication requires the ${name} environment variable; no login fallback was attempted`);
    environment.ANTHROPIC_API_KEY = key;
    return environment;
  }
  if (auth !== undefined && auth.mode !== 'claude-login') throw new SemanticProviderError('unavailable', 'Unsupported Claude authentication mode');
  if (await loginProbe(environment, options) !== 'claude-login') throw new SemanticProviderError('unavailable',
    'Claude account authentication requires Claude Code signed in with Claude (claude auth login). Status could not confirm that login type; no API fallback was attempted');
  return environment;
}
