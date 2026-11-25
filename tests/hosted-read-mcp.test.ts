import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, it } from 'vitest';
import { createExplorerFixtureProject } from '../examples/explorer/create-project.js';
import { createExplorerService } from '../src/application/explorer-service.js';
import { createGraphReadClient } from '../src/infrastructure/graph-read-client.js';
import { parseImpactScanRequest } from '../src/graph/impact-request.js';
import { SnapshotImpactQueryService } from '../src/graph/query.js';
import { startExplorerServer } from '../src/visualization/explorer-server.js';

it('reads the pinned graph over real stdio and HTTP with filesystem impact parity, continuation and explicit offline errors', async () => {
  const fixture = await createExplorerFixtureProject(10, true);
  const cwd = await mkdtemp(join(tmpdir(), 'weftlet-remote-mcp-'));
  const id = fixture.snapshot.manifest.snapshotId;
  const server = await startExplorerServer(await createExplorerService(fixture.configPath, id), { port: 0 });
  const client = new Client({ name: 'hosted-read-test', version: '1' });
  const args = [resolve(import.meta.dirname, '../dist/mcp.js'), '--graph-url', server.url,
    '--snapshot', id];
  const transport = new StdioClientTransport({ command: process.execPath, args, cwd, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk; });
  const http = createGraphReadClient({ baseUrl: server.url, snapshotId: id });
  let closed = false;
  try {
    try { await client.connect(transport); } catch (error) { throw Error('MCP fixture startup failed: ' + stderr, { cause: error }); }
    const listed = (await client.listTools()).tools;
    expect(listed.map(t => t.name).sort()).toEqual(['graph.catalog', 'graph.fact', 'graph.neighbors', 'graph.paths', 'impact.scan']);
    for (const tool of listed) expect(tool.annotations?.readOnlyHint).toBe(true);
    async function result(name: string, params: Record<string, unknown>) {
      const reply = await client.callTool({ name, arguments: params });
      expect(reply.isError).toBeFalsy();
      const content = reply.content as { text: string }[];
      const json = JSON.parse(content[1]!.text);
      expect(content[0]!.text).toBe(json.markdown);
      return json;
    }
    const local = new SnapshotImpactQueryService(fixture.store, 'default');
    const scan = { changedFiles: ['src/worker.ts'], maxFacts: 1, maxDepth: 3 };
    const page = await local.scan(parseImpactScanRequest({ ...scan, snapshotId: id }));
    expect(page.exploration?.continuation).toBeTruthy();
    expect(await result('impact.scan', scan)).toEqual(page);
    const next = { ...scan, continuation: page.exploration!.continuation };
    expect(await result('impact.scan', next)).toEqual(await local.scan(parseImpactScanRequest({ ...next, snapshotId: id })));
    expect(await http.scan(scan)).toEqual(page);
    const node = { nodeId: 'workflow:reserve', maxFacts: 1 }, fact = { factId: 'policy-queue' };
    const paths = { fromNodeId: 'workflow:reserve', toNodeId: 'workflow:ship' };
    expect(await result('graph.catalog', {})).toEqual(await http.catalog());
    expect(await result('graph.fact', fact)).toEqual(await http.fact(fact));
    expect(await result('graph.neighbors', node)).toEqual(await http.neighbors(node));
    expect(await result('graph.paths', paths)).toEqual(await http.paths(paths));
    for (const [name, params] of [['impact.scan', { snapshotId: 'other' }], ['impact.scan', { maxFacts: 201 }], ['hydrate', {}]] as const) {
      expect((await client.callTool({ name, arguments: params })).isError).toBe(true);
    }
    await server.close(); closed = true;
    expect((await client.callTool({ name: 'impact.scan', arguments: scan })).isError).toBe(true);
  } finally {
    await client.close(); await transport.close();
    if (!closed) await server.close();
    await fixture.cleanup(); await rm(cwd, { recursive: true, force: true });
  }
}, 60_000);

it('rejects unsafe URL and credential configuration before any protocol output', async () => {
  const launch = promisify(execFile);
  for (const [url, diagnostic, token] of [
    ['http://graph.example.org', 'HTTPS or a loopback URL', 'x'.repeat(32)],
    ['https://user:never-print-this@graph.example.org', 'omit credentials', 'x'.repeat(32)],
    ['https://graph.example.org', 'WEFTLET_VIEWER_TOKEN', 'never-print-this-credential-around-a\nline-break'],
  ] as const) {
    try {
      await launch(process.execPath, [resolve(import.meta.dirname, '../dist/mcp.js'), '--graph-url', url, '--snapshot', 'public'], { env: { ...process.env, WEFTLET_VIEWER_TOKEN: token } });
      throw Error('Expected hosted configuration rejection');
    } catch (error) {
      const result = error as { code: number; stdout: string; stderr: string };
      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(diagnostic);
      expect(result.stderr).not.toContain('never-print-this');
    }
  }
}, 60_000);
