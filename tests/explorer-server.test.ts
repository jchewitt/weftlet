import { expect, it } from 'vitest';
import { createGraphReadClient } from '../src/infrastructure/graph-read-client.js';
import { request } from 'node:http';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createExplorerFixtureProject } from '../examples/explorer/create-project.js';
import { createExplorerService } from '../src/application/explorer-service.js';
import { startExplorerServer } from '../src/visualization/explorer-server.js';

it('serves pinned evidence and packaged assets without adapters/providers, preserving parity and all saved bytes', async () => {
  const fixture = await createExplorerFixtureProject(100);
  let server: Awaited<ReturnType<typeof startExplorerServer>> | undefined;
  try {
    const snapshotId = fixture.snapshot.manifest.snapshotId;
    const file = join(fixture.root, '.context-graph/snapshots', (await readdir(join(fixture.root, '.context-graph/snapshots')))[0]!);
    const before = await readFile(file);
    const service = await createExplorerService(fixture.configPath, snapshotId);
    server = await startExplorerServer(service, { port: 0 });
    const metadata = await (await fetch(`${server.url}/explorer.json`)).json();
    expect(metadata).toMatchObject({ mode: 'local', snapshot: { snapshotId }, checkout: { state: { eligibleForCurrentDiffValidation: false } } });
    const queries = [
      ['graph.catalog', { snapshotId }, () => service.discovery.catalog({ snapshotId })],
      ['graph.neighbors', { snapshotId, nodeId: 'workflow:reserve', maxFacts: 1 }, () => service.exploration.neighbors({ snapshotId, nodeId: 'workflow:reserve', maxFacts: 1 })],
      ['graph.fact', { snapshotId, factId: 'policy-queue' }, () => service.discovery.fact({ snapshotId, factId: 'policy-queue' })],
      ['graph.paths', { snapshotId, fromNodeId: 'workflow:reserve', toNodeId: 'workflow:ship' }, () => service.paths.paths({ snapshotId, fromNodeId: 'workflow:reserve', toNodeId: 'workflow:ship' })],
    ] as const;
    for (const [method, params, expected] of queries) {
      const result = await fetch(`${server.url}/api/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, params }) });
      expect(result.status).toBe(200); expect(await result.json()).toEqual(await expected());
    }
    const client = createGraphReadClient({ baseUrl: server.url, snapshotId, contentDigest: metadata.snapshot.contentDigest });
    expect(await client.catalog()).toEqual(await service.discovery.catalog({ snapshotId }));
    expect(await client.fact({ factId: 'policy-queue' })).toEqual(await service.discovery.fact({ snapshotId, factId: 'policy-queue' }));
    const endpoints = { fromNodeId: 'workflow:reserve', toNodeId: 'workflow:ship' };
    expect(await client.paths(endpoints)).toEqual(await service.paths.paths({ snapshotId, ...endpoints }));
    const node = { nodeId: 'workflow:reserve', maxFacts: 1 };
    const page = await client.neighbors(node);
    expect(page).toEqual(await service.exploration.neighbors({ snapshotId, ...node }));
    const continuation = page.selection.continuation;
    expect(continuation).toBeTruthy();
    expect(await client.neighbors({ ...node, continuation })).toEqual(await service.exploration.neighbors({ snapshotId, ...node, continuation }));
    await expect(client.catalog({ snapshotId: 'other' })).rejects.toThrow('pinned snapshot');
    await expect(client.catalog({ maxNodes: 1000 })).rejects.toThrow('HTTP 400');
    const wrongDigest = createGraphReadClient({ baseUrl: server.url, snapshotId, contentDigest: 'different' });
    await expect(wrongDigest.catalog()).rejects.toThrow('pinned snapshot');
    const html = await fetch(server.url);
    expect(html.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await html.text()).toContain('Evidence explorer');
    for (const asset of ['app.js', 'style.css', 'app.js.LEGAL.txt', 'CYTOSCAPE-LICENSE.txt']) expect((await fetch(`${server.url}/assets/${asset}`)).status).toBe(200);
    await writeFile(join(fixture.root, 'uncommitted.md'), 'Working change excluded from saved evidence.');
    const dirty = await (await fetch(`${server.url}/explorer.json`)).json();
    expect(dirty.checkout.state.excludedWorkingChanges).toContain('uncommitted.md');
    expect(await readFile(file)).toEqual(before);
    await writeFile(file, JSON.stringify({ ...fixture.snapshot, facts: fixture.snapshot.facts.slice(1) }));
    expect((await fetch(`${server.url}/explorer.json`)).status).toBe(400);
  } finally { await server?.close(); await fixture.cleanup(); }
});

it('rejects cross-origin/rebinding access, writes, arbitrary files and unbounded/unpinned queries', async () => {
  const fixture = await createExplorerFixtureProject(0);
  const service = await createExplorerService(fixture.configPath, fixture.snapshot.manifest.snapshotId);
  const server = await startExplorerServer(service, { port: 0 });
  try {
    expect((await fetch(`${server.url}/explorer.json`, { headers: { Origin: 'https://untrusted.invalid' } })).status).toBe(403);
    const wrongHost = await new Promise<number>(resolve => {
      const req = request(server.url + '/explorer.json', { headers: { Host: 'untrusted.invalid' } }, response => { response.resume(); resolve(response.statusCode!); }); req.end();
    });
    expect(wrongHost).toBe(403);
    for (const path of ['/assets/../../context-graph.config.json', '/.git/config', '/api/hydrate', '/assets/%2e%2e/config.json']) {
      expect((await fetch(server.url + path)).status).toBe(404);
    }
    for (const body of [{ method: 'hydrate', params: { snapshotId: 'public-explorer' } },
      { method: 'graph.catalog', params: { snapshotId: 'other' } },
      { method: 'graph.catalog', params: { snapshotId: 'public-explorer', maxNodes: 1000 } },
      { method: 'graph.catalog', params: { snapshotId: 'public-explorer' }, other: true }]) {
      const response = await fetch(`${server.url}/api/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      expect(response.status).toBe(400);
    }
    expect((await fetch(`${server.url}/api/query`)).status).toBe(405);
    expect((await fetch(`${server.url}/api/query`, { method: 'POST', body: '{}' })).status).toBe(415);
    const oversized = await fetch(`${server.url}/api/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(33 * 1024) }) });
    expect(oversized.status).toBe(400);
    expect(await oversized.json()).toEqual({ error: 'Query request exceeds 32 KiB' });
    expect((await fetch(`${server.url}/explorer.json`)).status).toBe(200);
  } finally { await server.close(); await fixture.cleanup(); }
});

it('requires the credential for every public-origin route and checks the exact host and browser origin', async () => {
  const { createHostedAccess } = await import('../src/visualization/hosted-access.js');
  const origin = 'https://graphs.example.org';
  const token = 'public-fixture-'.repeat(3);
  expect(() => createHostedAccess(origin, undefined)).toThrow('WEFTLET_VIEWER_TOKEN');
  for (const invalid of ['http://graphs.example.org', origin + '/mount', origin + '?query', 'https://user@graphs.example.org']) {
    expect(() => createHostedAccess(invalid, token)).toThrow();
  }
  const fixture = await createExplorerFixtureProject(0);
  const id = fixture.snapshot.manifest.snapshotId;
  const service = await createExplorerService(fixture.configPath, id);
  const server = await startExplorerServer(service, { port: 0, hostedAccess: createHostedAccess(origin, token) });
  // Simulate a reverse proxy preserving the public Host on its loopback connection.
  const proxy = (path: string, headers: Record<string, string> = {}, body?: string) =>
    new Promise<number>((resolve, reject) => {
      const req = request(server.url + path, { method: body ? 'POST' : 'GET',
        headers: { Host: 'graphs.example.org', 'Content-Type': 'application/json', ...headers } }, response => {
        response.resume(); resolve(response.statusCode!);
      });
      req.on('error', reject); req.end(body);
    });
  try {
    const auth = { Authorization: 'Bearer ' + token };
    for (const path of ['/explorer.json', '/', '/assets/app.js', '/api/v1/query', '/api/query']) {
      expect(await proxy(path)).toBe(401);
    }
    expect(await proxy('/explorer.json', { Authorization: 'Bearer wrong' })).toBe(401);
    expect(await proxy('/explorer.json', { Authorization: 'Basic ' + Buffer.from('weftlet:' + token).toString('base64') })).toBe(200);
    expect(await proxy('/explorer.json', { ...auth, Host: '127.0.0.1' })).toBe(403);
    expect(await proxy('/explorer.json', { ...auth, Origin: 'https://other.example.org' })).toBe(403);
    expect(await proxy('/api/v1/query', { ...auth, Origin: origin },
      JSON.stringify({ method: 'graph.catalog', params: { snapshotId: id } }))).toBe(200);
    expect(await proxy('/api/v1/query', auth,
      JSON.stringify({ method: 'graph.catalog', params: { snapshotId: 'other-project' } }))).toBe(400);
  } finally { await server.close(); await fixture.cleanup(); }
});
