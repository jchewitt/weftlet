import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { ExtractionContext, SemanticSource } from '@weftlet/core';
import { ClaudeCliSemanticExtractor } from './claude.js';
import { prepareClaudeAuthentication } from './claude-auth.js';
import { runClaudeStructuredRequest, type ClaudeRuntime } from './claude-request.js';
import { SemanticHydrator, type SemanticOutput } from './semantic.js';
import { semanticProviderIdentity } from './semantic-identity.js';
import { SemanticProviderError } from './semantic-process.js';
import { SemanticArtifactStore } from '../storage/storage.js';
import { semanticCachePartition } from '../configuration/cache.js';
import { prepareProjectConfig } from '../interfaces/init.js';
import { createMappingProvider } from './mapping-provider.js';

const config = { provider: 'claude-cli' as const, model: 'public-model', reasoningEffort: 'medium',
  auth: { mode: 'claude-login' as const }, promptVersion: '1', extractorVersion: '1', adapterVersion: '1',
  ontologyVersion: '1', minimumConfidence: 0.7, failOnUnresolved: true, concurrency: 1 };
const source: SemanticSource = { path: 'docs/public.md', content: '# Public\nSearch uses a worker.\n', digest: 'digest', stableSemanticId: 'public' };
const context: ExtractionContext = { repositoryId: 'example/public', repositoryRoot: '/not-available', ref: 'HEAD',
  commitSha: 'a'.repeat(40), snapshotId: 'test', changedPaths: [], deletedPaths: [], renamedPaths: {} };
const output: SemanticOutput = { assertions: [{ subject: { id: 'capability:search', label: 'Search', kind: 'Capability' },
  predicate: 'implementedBy', object: { id: 'component:file:src/worker.ts', label: 'Worker', kind: 'Component' },
  confidence: 0.95, citation: { startLine: 2, endLine: 2 } }], diagnostics: [], oml: '' };
const envelope = (structured_output: unknown) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false,
  session_id: 'private-session-metadata', structured_output });
const runtime = (run: ClaudeRuntime['run']): ClaudeRuntime => ({
  authenticate: async () => ({ PATH: '/fixture' }),
  inspect: async () => ({ available: true, supported: true, version: '2.1.321' }),
  invocation: async () => ({ command: 'fixture-claude', prefixArgs: [] }), run,
});
const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

it('uses Claude structured output with tools, skills, MCP, sessions and customizations disabled', async () => {
  let directory = '';
  const run = vi.fn<NonNullable<ClaudeRuntime['run']>>(async (command, args, cwd, prompt, env, limit, options) => {
    directory = cwd;
    expect(command).toBe('fixture-claude'); expect(args).not.toContain('--bare');
    expect(args).toEqual(expect.arrayContaining(['--safe-mode', '--disable-slash-commands', '--no-session-persistence', '--strict-mcp-config']));
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
    expect(JSON.parse(args[args.indexOf('--mcp-config') + 1]!)).toEqual({ mcpServers: {} });
    expect(JSON.parse(args[args.indexOf('--json-schema') + 1]!).required).toContain('assertions');
    expect(prompt).toContain('2|Search uses a worker.'); expect(prompt).toContain('scripts/check.ts is Component');
    expect(prompt).not.toContain('source.md file');
    expect(env).toEqual({ PATH: '/fixture' }); expect(limit).toBe(2 * 1024 * 1024);
    expect(options?.timeoutMs).toBeGreaterThan(599_000); expect(options?.timeoutMs).toBeLessThanOrEqual(600_000);
    expect(await readdir(cwd)).toEqual([]);
    return envelope(output);
  });
  const result = await new ClaudeCliSemanticExtractor({ ...config, timeoutMs: 600_000 }, runtime(run)).extract(source, context);
  expect(result.parsed).toEqual(output);
  expect(result.rawModelOutput).toBe(JSON.stringify(output));
  expect(result.rawModelOutput).not.toContain('private-session-metadata');
  expect(run).toHaveBeenCalledOnce();
  await expect(readdir(directory)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps account login and explicitly selected API credentials separate, with no fallback', async () => {
  const env = { PATH: '/public', HOME: '/public/home', CLAUDE_CONFIG_DIR: '/public/settings',
    CODEX_HOME: '/must-not-pass', ANTHROPIC_API_KEY: 'must-not-pass', OPENAI_API_KEY: 'must-not-pass',
    CLAUDE_CODE_OAUTH_TOKEN: 'must-not-pass', ANTHROPIC_BASE_URL: 'must-not-pass', PRIVATE: 'must-not-pass',
    WEFTLET_CLAUDE_KEY: 'selected' };
  const probe = vi.fn(async () => 'claude-login' as const);
  const login = await prepareClaudeAuthentication(config.auth, env, {}, probe);
  expect(login).toEqual({ PATH: env.PATH, HOME: env.HOME, CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
  expect(probe).toHaveBeenCalledOnce();
  const api = await prepareClaudeAuthentication({ mode: 'api-key', apiKeyEnv: 'WEFTLET_CLAUDE_KEY' }, env, {}, probe);
  expect(api).toEqual({ ...login, ANTHROPIC_API_KEY: 'selected' }); expect(probe).toHaveBeenCalledOnce();
  await expect(prepareClaudeAuthentication({ mode: 'api-key', apiKeyEnv: 'ABSENT' }, env, {}, probe)).rejects.toThrow('no login fallback');
  await expect(prepareClaudeAuthentication(config.auth, env, {}, async () => 'other')).rejects.toThrow('no API fallback');
  await expect(prepareClaudeAuthentication({ mode: 'chatgpt' }, env, {}, probe)).rejects.toThrow('Unsupported Claude');
  const run = vi.fn<NonNullable<ClaudeRuntime['run']>>(async (_command, args) => {
    expect(args).toContain('--bare'); return envelope(output);
  });
  await runClaudeStructuredRequest({ ...config, auth: { mode: 'api-key' } }, {}, 'public', 10000, {}, runtime(run));
});

it('rejects malformed envelopes, invalid citations and wrong canonical kinds without retries or retained workspaces', async () => {
  for (const raw of ['not JSON', JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'PRIVATE' }),
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(output) }),
    envelope({ ...output, assertions: [{ ...output.assertions[0], citation: { startLine: 999, endLine: 999 } }] }),
    envelope({ ...output, assertions: [{ ...output.assertions[0], object: { ...output.assertions[0]!.object, kind: 'Evidence' } }] })]) {
    let directory = '';
    const run = vi.fn<NonNullable<ClaudeRuntime['run']>>(async (_command, _args, cwd) => { directory = cwd; return raw; });
    await expect(new ClaudeCliSemanticExtractor({ ...config, retries: 2 }, runtime(run)).extract(source, context)).rejects.toThrow();
    expect(run).toHaveBeenCalledOnce();
    await expect(readdir(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  }
});

it('reuses unchanged artifacts after operational changes, retains authority and separates providers/models', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-cache-')); roots.push(root);
  const store = new SemanticArtifactStore(root);
  const run = vi.fn<NonNullable<ClaudeRuntime['run']>>(async () => envelope(output));
  const first = await new SemanticHydrator(config, store, new ClaudeCliSemanticExtractor(config, runtime(run))).hydrate(source, context);
  const path = join(root, 'artifacts/semantic', `${first.artifact.key}.json`), bytes = await readFile(path);
  const changed = { ...config, timeoutMs: 600_000, retries: 2, concurrency: 2 };
  const repeat = await new SemanticHydrator(changed, store, new ClaudeCliSemanticExtractor(changed, runtime(run))).hydrate(source, context);
  expect(repeat.reused).toBe(true); expect(repeat.artifact).toEqual(first.artifact); expect(await readFile(path)).toEqual(bytes);
  expect(run).toHaveBeenCalledOnce();
  expect(first.artifact.facts[0]).toMatchObject({ predicate: 'implementedBy',
    provenance: { path: source.path, commitSha: context.commitSha, startLine: 2, endLine: 2 } });
  const base = (await prepareProjectConfig({ directory: root, provider: 'claude-cli' })).config;
  expect(semanticCachePartition(root, { ...base, semantic: config })).toBe(semanticCachePartition(root, { ...base, semantic: changed }));
  for (const change of [{ provider: 'codex-cli' as const }, { model: 'other-model' }, { reasoningEffort: 'high' },
    { promptVersion: 'next' }, { auth: { mode: 'api-key' as const } }]) {
    expect(semanticProviderIdentity({ ...config, ...change })).not.toBe(semanticProviderIdentity(config));
  }
});

it('bounds source size, cancellation and explicit retries, and rejects unsupported CLIs before extraction', async () => {
  const run = vi.fn<NonNullable<ClaudeRuntime['run']>>(async () => envelope(output));
  await expect(new ClaudeCliSemanticExtractor({ ...config, maxSourceBytes: 1 }, runtime(run)).extract(source, context)).rejects.toThrow('byte budget');
  await expect(new ClaudeCliSemanticExtractor(config, runtime(run)).extract(source, context, { signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'cancelled' });
  await expect(new ClaudeCliSemanticExtractor(config, { ...runtime(run), inspect: async () => ({ available: true, supported: false, version: '2.1.1' }) })
    .extract(source, context)).rejects.toMatchObject({ code: 'unavailable' });
  expect(run).not.toHaveBeenCalled();
  run.mockRejectedValueOnce(new SemanticProviderError('exit', 'Transient fixture', true));
  await new ClaudeCliSemanticExtractor({ ...config, retries: 1 }, runtime(run)).extract(source, context);
  expect(run).toHaveBeenCalledTimes(2);
});

it('routes optional mapping proposals to Claude with one request, never to the Codex runtime', async () => {
  const codex = vi.fn(async () => { throw new Error('Codex must not run'); });
  const result = { decision: 'abstained', reason: 'Public fixture', proposals: [] };
  const run = vi.fn<NonNullable<ClaudeRuntime['run']>>(async (_command, _args, _cwd, prompt, _env, limit) => {
    expect(limit).toBe(131_072); expect(prompt).toContain('untrusted data'); return envelope(result);
  });
  const provider = createMappingProvider(config, '/not-available', { authenticate: codex, run: codex, claude: runtime(run) });
  expect(await provider.propose({ ruleId: 'invariant:public', subjectEvidence: [], associations: [], candidates: [],
    document: { source: { path: source.path, startLine: 1, endLine: 1, digest: 'digest', commitSha: context.commitSha }, text: source.content } },
  { signal: new AbortController().signal, timeoutMs: 600_000 })).toEqual(result);
  expect(run).toHaveBeenCalledOnce(); expect(codex).not.toHaveBeenCalled();
});
