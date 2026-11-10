import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { ExtractionContext, SemanticSource } from '@weftlet/core';
import { OpenCodeCliSemanticExtractor } from './opencode.js';
import { openCodeApiCredential } from './opencode-auth.js';
import { openCodeEnvironment, openCodeProfile } from './opencode-profile.js';
import { parseOpenCodeOutput } from './opencode-output.js';
import { type OpenCodeRuntime } from './opencode-request.js';
import { SemanticHydrator, type SemanticOutput } from './semantic.js';
import { semanticProviderIdentity } from './semantic-identity.js';
import { SemanticProviderError } from './semantic-process.js';
import { SemanticArtifactStore } from '../storage/storage.js';
import { semanticCachePartition } from '../configuration/cache.js';
import { prepareProjectConfig } from '../interfaces/init.js';
import { createMappingProvider } from './mapping-provider.js';

const config = { provider: 'opencode-cli' as const, model: 'fixture/public', reasoningEffort: 'default',
  auth: { mode: 'opencode-auth' as const }, promptVersion: '1', extractorVersion: '1', adapterVersion: '1',
  ontologyVersion: '1', minimumConfidence: 0.7, failOnUnresolved: true, concurrency: 1 };
const source: SemanticSource = { path: 'docs/public.md', content: '# Public\nSearch uses a worker.\n', digest: 'digest', stableSemanticId: 'public' };
const context: ExtractionContext = { repositoryId: 'example/public', repositoryRoot: '/not-available', ref: 'HEAD',
  commitSha: 'a'.repeat(40), snapshotId: 'test', changedPaths: [], deletedPaths: [], renamedPaths: {} };
const output: SemanticOutput = { assertions: [{ subject: { id: 'capability:search', label: 'Search', kind: 'Capability' },
  predicate: 'implementedBy', object: { id: 'component:file:src/worker.ts', label: 'Worker', kind: 'Component' },
  confidence: 0.95, citation: { startLine: 2, endLine: 2 } }], diagnostics: [], oml: '' };
const event = (type: string, part: Record<string, unknown>) => ({ type, sessionID: 'session',
  part: { id: type, sessionID: 'session', messageID: 'message', ...part } });
const events = (value: unknown) => [event('step_start', { type: 'step-start' }),
  event('text', { type: 'text', text: JSON.stringify(value), time: { end: 1 } }), event('step_finish', { type: 'step-finish', reason: 'stop' })];
const encode = (value: unknown[]) => value.map(v => JSON.stringify(v)).join('\n');
const runtime = (run: OpenCodeRuntime['run']): OpenCodeRuntime => ({ authenticate: async () => ({ fixture: { type: 'api', key: 'fixture' } }),
  inspect: async () => ({ available: true, supported: true, version: '1.19.5' }),
  invocation: async () => ({ command: 'fixture-opencode', prefixArgs: [] }), run });
const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

it('isolates configuration, sessions, external credentials and tools without changing HOME', async () => {
  const env = openCodeEnvironment('/isolated', { PATH: '/bin', HOME: '/operator', CODEX_HOME: '/codex',
    OPENCODE_CONFIG_CONTENT: 'private', OPENAI_API_KEY: 'private', XDG_CONFIG_HOME: '/private', HTTP_PROXY: 'proxy' });
  expect(env.HOME).toBe('/operator'); expect(env.HTTP_PROXY).toBe('proxy');
  expect(env.CODEX_HOME).toBeUndefined(); expect(env.OPENAI_API_KEY).toBeUndefined(); expect(env.OPENCODE_CONFIG_CONTENT).toBeUndefined();
  expect(env.OPENCODE_TEST_HOME).toBe('/isolated'); expect(env.XDG_CONFIG_HOME).toBe(join('/isolated', 'xdg_config_home'));
  expect(env.OPENCODE_DISABLE_DEFAULT_PLUGINS).toBe('true'); expect(env.OPENCODE_DISABLE_PROJECT_CONFIG).toBe('true');
  expect(env.OPENCODE_AUTH_CONTENT).toBe('{}');
  expect(openCodeProfile(config)).toMatchObject({ enabled_providers: ['fixture'], permission: { '*': 'deny' },
    mcp: {}, instructions: [], plugin: [], share: 'disabled', agent: { weftlet: { steps: 1 }, title: { disable: true } } });
  let directory = '';
  const run = vi.fn<NonNullable<OpenCodeRuntime['run']>>(async (command, args, cwd, prompt, childEnv, limit, options) => {
    directory = cwd; expect(command).toBe('fixture-opencode');
    expect(args).toEqual(['run', '--pure', '--format', 'json', '--model', 'fixture/public', '--agent', 'weftlet', '--title', 'Weftlet extraction']);
    expect(prompt).toContain('2|Search uses a worker.'); expect(prompt).toContain('"assertions"');
    expect(JSON.parse(childEnv.OPENCODE_AUTH_CONTENT!)).toEqual({ fixture: { type: 'api', key: 'fixture' } });
    expect(limit).toBe(2 * 1024 * 1024); expect(options?.timeoutMs).toBeGreaterThan(599000);
    return encode(events(output));
  });
  const result = await new OpenCodeCliSemanticExtractor({ ...config, timeoutMs: 600000 }, runtime(run)).extract(source, context);
  expect(result).toEqual({ parsed: output, rawModelOutput: JSON.stringify(output) }); expect(run).toHaveBeenCalledOnce();
  await expect(readdir(directory)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('reads only the selected saved API entry and leaves the credential store byte-identical', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opencode-auth-')); roots.push(root);
  await mkdir(join(root, 'opencode'));
  const path = join(root, 'opencode/auth.json');
  await writeFile(path, JSON.stringify({ fixture: { type: 'api', key: 'selected' }, other: { type: 'api', key: 'unselected' } }));
  const before = await readFile(path), env = { XDG_DATA_HOME: root, SELECTED_KEY: 'explicit' };
  expect(await openCodeApiCredential(config, env)).toEqual({ fixture: { type: 'api', key: 'selected' } });
  expect(await openCodeApiCredential({ ...config, auth: { mode: 'api-key', apiKeyEnv: 'SELECTED_KEY' } }, env))
    .toEqual({ fixture: { type: 'api', key: 'explicit' } });
  await expect(openCodeApiCredential({ ...config, auth: { mode: 'api-key', apiKeyEnv: 'MISSING' } }, env)).rejects.toThrow('no saved-login fallback');
  expect(await readFile(path)).toEqual(before);
  await writeFile(path, JSON.stringify({ fixture: { type: 'oauth', access: 'private', refresh: 'private' } }));
  const oauth = await readFile(path);
  await expect(openCodeApiCredential(config, env)).rejects.toThrow('Subscription/OAuth refresh is not supported');
  expect(await readFile(path)).toEqual(oauth);
});

it('accepts only a complete single-message successful JSON event stream', () => {
  const valid = events(output); expect(parseOpenCodeOutput(encode(valid))).toEqual(output);
  expect(parseOpenCodeOutput(encode([valid[0], valid[1], valid[1], valid[2]]))).toEqual(output);
  for (const bad of ['', 'private non-json', encode(valid.slice(0, 2)), encode(valid.slice(1)),
    encode([...valid, valid[1]]), encode([valid[0], event('text', { type: 'text', text: '{}', time: {} }), valid[2]]),
    encode([valid[0], valid[1], event('step_finish', { type: 'step-finish', reason: 'length' })]),
    encode([valid[0], event('tool_use', { type: 'tool', result: 'private' }), valid[2]]),
    encode([valid[0], event('text', { type: 'text', text: '{}', time: { end: 1 }, messageID: 'other' }), valid[2]]),
    encode([valid[0], valid[1], event('text', { type: 'text', text: '{}', time: { end: 1 } }), valid[2]]),
    encode([valid[0], event('error', { type: 'error' }), valid[2]])]) {
    expect(() => parseOpenCodeOutput(bad)).toThrow('one complete successful structured response');
  }
});

it('rejects invalid citations and canonical kinds before caching, without automatic retry', async () => {
  for (const assertion of [{ ...output.assertions[0], citation: { startLine: 999, endLine: 999 } },
    { ...output.assertions[0], object: { ...output.assertions[0]!.object, kind: 'Evidence' } }]) {
    let directory = '';
    const run = vi.fn<NonNullable<OpenCodeRuntime['run']>>(async (_cmd, _args, cwd) => { directory = cwd; return encode(events({ ...output, assertions: [assertion] })); });
    await expect(new OpenCodeCliSemanticExtractor({ ...config, retries: 2 }, runtime(run)).extract(source, context)).rejects.toThrow();
    expect(run).toHaveBeenCalledOnce(); await expect(readdir(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  }
});

it('reuses unchanged artifacts after timeout changes, with separate provider/auth/model identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opencode-cache-')); roots.push(root);
  const store = new SemanticArtifactStore(root), run = vi.fn<NonNullable<OpenCodeRuntime['run']>>(async () => encode(events(output)));
  const first = await new SemanticHydrator(config, store, new OpenCodeCliSemanticExtractor(config, runtime(run))).hydrate(source, context);
  const path = join(root, 'artifacts/semantic', `${first.artifact.key}.json`), before = await readFile(path);
  const changed = { ...config, timeoutMs: 600000, retries: 2, concurrency: 2 };
  const repeat = await new SemanticHydrator(changed, store, new OpenCodeCliSemanticExtractor(changed, runtime(run))).hydrate(source, context);
  expect(repeat.reused).toBe(true); expect(repeat.artifact).toEqual(first.artifact); expect(await readFile(path)).toEqual(before);
  expect(run).toHaveBeenCalledOnce();
  const base = (await prepareProjectConfig({ directory: root, provider: 'opencode-cli', model: config.model })).config;
  expect(semanticCachePartition(root, { ...base, semantic: config })).toBe(semanticCachePartition(root, { ...base, semantic: changed }));
  for (const change of [{ provider: 'codex-cli' as const }, { provider: 'claude-cli' as const }, { model: 'other/model' },
    { reasoningEffort: 'high' }, { promptVersion: 'next' }, { auth: { mode: 'api-key' as const } }]) {
    expect(semanticProviderIdentity({ ...config, ...change })).not.toBe(semanticProviderIdentity(config));
  }
});

it('bounds source size, cancellation, retries and unsupported CLI versions', async () => {
  const run = vi.fn<NonNullable<OpenCodeRuntime['run']>>(async () => encode(events(output)));
  await expect(new OpenCodeCliSemanticExtractor({ ...config, maxSourceBytes: 1 }, runtime(run)).extract(source, context)).rejects.toThrow('byte budget');
  await expect(new OpenCodeCliSemanticExtractor(config, runtime(run)).extract(source, context, { signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'cancelled' });
  await expect(new OpenCodeCliSemanticExtractor(config, { ...runtime(run), inspect: async () => ({ available: true, supported: false, version: '1.19.4' }) })
    .extract(source, context)).rejects.toMatchObject({ code: 'unavailable' });
  expect(run).not.toHaveBeenCalled();
  run.mockRejectedValueOnce(new SemanticProviderError('exit', 'Transient public fixture', true));
  await new OpenCodeCliSemanticExtractor({ ...config, retries: 1 }, runtime(run)).extract(source, context); expect(run).toHaveBeenCalledTimes(2);
});

it('routes optional mappings to the selected OpenCode backend without Codex or Claude fallback', async () => {
  const forbidden = vi.fn(async () => { throw new Error('Other provider must not run'); });
  const result = { decision: 'abstained', reason: 'Public fixture', proposals: [] };
  const run = vi.fn<NonNullable<OpenCodeRuntime['run']>>(async (_cmd, _args, _cwd, _prompt, _env, limit) => {
    expect(limit).toBe(131072); return encode(events(result));
  });
  const provider = createMappingProvider(config, '/not-available', { authenticate: forbidden, run: forbidden,
    claude: { run: forbidden }, opencode: runtime(run) });
  expect(await provider.propose({ ruleId: 'invariant:public', subjectEvidence: [], associations: [], candidates: [],
    document: { source: { path: source.path, startLine: 1, endLine: 1, digest: 'digest', commitSha: context.commitSha }, text: source.content } },
  { signal: new AbortController().signal, timeoutMs: 600000 })).toEqual(result);
  expect(run).toHaveBeenCalledOnce(); expect(forbidden).not.toHaveBeenCalled();
});
