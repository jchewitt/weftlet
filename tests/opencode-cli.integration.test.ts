import { createServer } from 'node:http';
import { once } from 'node:events';
import { readdir } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { OpenCodeCliSemanticExtractor } from '../src/extraction/opencode.js';
import { openCodeProfile } from '../src/extraction/opencode-profile.js';
import { captureSemanticProcess } from '../src/extraction/semantic-process.js';

// Opt-in real CLI qualification with a loopback-only public HTTP fixture. No remote model/credentials.
const binary = process.env.WEFTLET_TEST_OPENCODE_BINARY;
it.skipIf(!binary)('runs the pinned native OpenCode CLI with one local request, no tools, and removable isolated sessions', async () => {
  const output = { assertions: [], diagnostics: [], oml: '' };
  const requests: { path: string | undefined; model: unknown; tools: number }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ path: request.url, model: body.model, tools: body.tools?.length ?? 0 });
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const [delta, finish] of [[{ role: 'assistant', content: JSON.stringify(output) }, null], [{}, 'stop']]) {
      response.write(`data: ${JSON.stringify({ id: 'public-fixture', object: 'chat.completion.chunk', created: 0, model: 'public',
        choices: [{ index: 0, delta, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`);
    }
    response.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw Error('No fixture port');
  let workspace = '';
  const config = { provider: 'opencode-cli' as const, model: 'fixture/public', reasoningEffort: 'default',
    auth: { mode: 'opencode-auth' as const }, promptVersion: '1', extractorVersion: '1', adapterVersion: '1',
    ontologyVersion: '1', minimumConfidence: 0.7, failOnUnresolved: true, concurrency: 1 };
  try {
    const extractor = new OpenCodeCliSemanticExtractor(config, {
      // Probe the same real binary using the isolated environment, without requiring PATH mutation.
      inspect: async (env, cwd, options) => {
        const version = (await captureSemanticProcess(binary!, ['--version'], cwd, '', env, 8192, options)).trim();
        return { available: true, supported: version === '1.19.5', version };
      },
      invocation: async () => ({ command: binary!, prefixArgs: [] }),
      authenticate: async () => ({ fixture: { type: 'api', key: 'public-fixture' } }),
      profile: config => ({ ...openCodeProfile(config), provider: { fixture: { npm: '@ai-sdk/openai-compatible',
        name: 'Public fixture', options: { baseURL: `http://127.0.0.1:${address.port}/v1`, apiKey: 'public-fixture' },
        models: { public: { name: 'Public', limit: { context: 32768, output: 4096 } } } } } }),
      run: (...args) => { workspace = args[2]; return captureSemanticProcess(...args); },
    });
    expect((await extractor.extract({ path: 'docs/public.md', content: '# Public\nNo rules.', digest: 'digest', stableSemanticId: 'public' },
      { repositoryId: 'public', repositoryRoot: '/not-available', ref: 'HEAD', commitSha: 'a'.repeat(40), snapshotId: 'fixture',
        changedPaths: [], deletedPaths: [], renamedPaths: {} }, { timeoutMs: 45000 })).parsed).toEqual(output);
    expect(requests).toEqual([{ path: '/v1/chat/completions', model: 'public', tools: 0 }]);
    await expect(readdir(workspace)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}, 60000);
