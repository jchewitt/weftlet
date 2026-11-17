import { writeFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { loadConfig } from '../configuration/config.js';
import { runSetupProvider } from './setup-provider.js';
import { SemanticProviderError } from './semantic-process.js';
import { setupOutputSchema } from '../application/setup/assist/contract.js';

const response = { explanation: 'No changes', semanticSources: null, approvedIntentSources: null, clients: [], mcp: false, ci: null, notes: [] };
async function config() { return (await loadConfig('examples/generic-typescript/context-graph.config.json')).config.semantic; }
it('uses Codex account authentication, isolated tools and exactly one request despite extraction retries', async () => {
  const c = { ...await config(), provider: 'codex-cli' as const, auth: { mode: 'chatgpt' as const }, retries: 2 };
  const authenticate = vi.fn(async () => ({}));
  const run = vi.fn(async (_cmd: string, args: readonly string[], cwd: string) => {
    expect(args).toContain('--ignore-user-config'); expect(args).toContain('--disable'); expect(args).toContain('shell_tool');
    expect(args[args.indexOf('--cd') + 1]).toBe(cwd);
    await writeFile(args[args.indexOf('--output-last-message') + 1]!, JSON.stringify(response));
  });
  expect(await runSetupProvider(c, setupOutputSchema, 'selected public input', 65_536, {}, {
    codex: { authenticate, invocation: async () => ({ command: 'fake-codex', prefixArgs: [] }), run },
  })).toEqual(response);
  expect(authenticate.mock.calls[0]).toEqual(expect.arrayContaining([{ mode: 'chatgpt' }])); expect(run).toHaveBeenCalledOnce();
});
it('uses Claude alone and retains login authentication with disabled tools and no session persistence', async () => {
  const c = { ...await config(), provider: 'claude-cli' as const, model: 'sonnet', auth: { mode: 'claude-login' as const } };
  const authenticate = vi.fn(async () => ({})), codex = vi.fn(async () => { throw Error('must not use Codex'); });
  const run = vi.fn(async (_cmd: string, args: readonly string[]) => {
    expect(args).toContain('--safe-mode'); expect(args).toContain('--no-session-persistence'); expect(args).not.toContain('--bare');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    return JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: response });
  });
  expect(await runSetupProvider(c, setupOutputSchema, 'public', 65_536, {}, {
    claude: { inspect: async () => ({ available: true, supported: true, version: '2.1.321' }), authenticate,
      invocation: async () => ({ command: 'fake-claude', prefixArgs: [] }), run }, codex: { authenticate: codex },
  })).toEqual(response);
  expect(authenticate.mock.calls[0]?.[0]).toEqual({ mode: 'claude-login' }); expect(run).toHaveBeenCalledOnce(); expect(codex).not.toHaveBeenCalled();
});
it('uses isolated OpenCode API credentials without Codex or subscription fallback', async () => {
  const c = { ...await config(), provider: 'opencode-cli' as const, model: 'openai/public-model', auth: { mode: 'api-key' as const, apiKeyEnv: 'PUBLIC_TEST_KEY' } };
  const authenticate = vi.fn(async () => ({ openai: { type: 'api' as const, key: 'public-fixture-key' } }));
  const run = vi.fn(async (_cmd: string, args: readonly string[], _cwd: string, prompt: string, env: NodeJS.ProcessEnv) => {
    expect(args).toContain('--pure'); expect(prompt).toContain('No shell commands');
    expect(JSON.parse(env.OPENCODE_AUTH_CONTENT!)).toEqual({ openai: { type: 'api', key: 'public-fixture-key' } });
    const event = (type: string, part: object) => JSON.stringify({ type, sessionID: 'public-session', part: {
      id: type, sessionID: 'public-session', messageID: 'public-message', ...part } });
    return [event('step_start', { type: 'step-start' }),
      event('text', { type: 'text', text: JSON.stringify(response), time: { end: 1 } }),
      event('step_finish', { type: 'step-finish', reason: 'stop' })].join('\n');
  });
  expect(await runSetupProvider(c, setupOutputSchema, 'No shell commands', 65_536, {}, {
    opencode: { inspect: async () => ({ available: true, supported: true, version: '1.19.5' }), authenticate,
      invocation: async () => ({ command: 'fake-opencode', prefixArgs: [] }), run },
  })).toEqual(response);
  expect(run).toHaveBeenCalledOnce();
});
it('honors cancellation/deadlines and reports failures without retry or fallback', async () => {
  const c = { ...await config(), provider: 'codex-cli' as const, retries: 2 };
  const run = vi.fn(async () => { throw new SemanticProviderError('exit', 'Public provider failure', true); });
  const hooks = { codex: { authenticate: async () => ({}), invocation: async () => ({ command: 'fake', prefixArgs: [] }), run } };
  await expect(runSetupProvider(c, setupOutputSchema, 'public', 65_536, {}, hooks)).rejects.toThrow('Public provider failure');
  expect(run).toHaveBeenCalledOnce();
  const controller = new AbortController(); controller.abort();
  await expect(runSetupProvider(c, setupOutputSchema, 'public', 65_536, { signal: controller.signal }, hooks)).rejects.toThrow();
  expect(run).toHaveBeenCalledOnce();
  // Use the actual process contract's signal; no child process/provider runs in this test.
  await expect(runSetupProvider(c, setupOutputSchema, 'public', 65_536, { timeoutMs: 10 }, { codex: {
    authenticate: async () => ({}), invocation: async () => ({ command: 'fake', prefixArgs: [] }),
    run: async (_command, _args, _cwd, _prompt, _env, options) => new Promise((_resolve, reject) => {
      if (options?.signal?.aborted) reject(options.signal.reason);
      else options?.signal?.addEventListener('abort', () => reject(options.signal!.reason), { once: true });
    }),
  } })).rejects.toThrow('timed out');
  await expect(runSetupProvider({ ...c, provider: 'module' }, setupOutputSchema, 'public', 65_536)).rejects.toThrow('not setup planners');
});
