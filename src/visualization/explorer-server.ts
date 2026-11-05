import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseGraphCatalogRequest, parseGraphFactRequest } from '../graph/discovery-request.js';
import { parseGraphNeighborsRequest } from '../graph/neighborhood-request.js';
import { parseGraphPathsRequest } from '../graph/path-request.js';
import type { ExplorerService } from '../application/explorer-service.js';
import { sourceLink } from './source-links.js';
import { explorerAssetsRoot } from './explorer-assets.js';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']], ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/assets/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/assets/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/assets/app.js.LEGAL.txt', ['app.js.LEGAL.txt', 'text/plain; charset=utf-8']],
  ['/assets/CYTOSCAPE-LICENSE.txt', ['CYTOSCAPE-LICENSE.txt', 'text/plain; charset=utf-8']],
]);
async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > 32 * 1024) { request.resume(); throw new Error('Query request exceeds 32 KiB'); }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function query(service: ExplorerService, value: unknown): Promise<unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a query object');
  const envelope = value as Record<string, unknown>;
  if (Object.keys(envelope).sort().join(',') !== 'method,params') throw new Error('Expected method and params');
  const methods = {
    'graph.catalog': (params: unknown) => service.discovery.catalog(parseGraphCatalogRequest(params)),
    'graph.fact': (params: unknown) => service.discovery.fact(parseGraphFactRequest(params)),
    'graph.neighbors': (params: unknown) => service.exploration.neighbors(parseGraphNeighborsRequest(params)),
    'graph.paths': (params: unknown) => service.paths.paths(parseGraphPathsRequest(params)),
  };
  if (typeof envelope.method !== 'string' || !Object.hasOwn(methods, envelope.method)) throw new Error('Unsupported read query');
  const params = envelope.params as { snapshotId?: unknown } | undefined;
  if (!params || params.snapshotId !== service.index.snapshot.manifest.snapshotId) throw new Error('Query must use the pinned snapshot');
  await service.pinned();
  const result = await methods[envelope.method as keyof typeof methods](params);
  await service.pinned();
  return result;
}

/** Local-only server. Hosting/authentication is a separate deployment milestone. */
export async function startExplorerServer(service: ExplorerService, options: { port?: number; assetsRoot?: URL; sourceUrlTemplate?: string } = {}) {
  const port = options.port ?? 4173;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid viewer port');
  if (options.sourceUrlTemplate) sourceLink({ path: 'README.md', startLine: 1, endLine: 1,
    commitSha: service.index.snapshot.manifest.commitSha, digest: '' }, options.sourceUrlTemplate);
  const assetsRoot = options.assetsRoot ?? explorerAssetsRoot();
  // Fail before announcing a URL if the installed package omitted browser assets.
  const assetBytes = new Map<string, Buffer>();
  for (const [name] of assets.values()) if (!assetBytes.has(name!)) assetBytes.set(name!, await readFile(new URL(name!, assetsRoot)));
  let actualPort = port;
  let activeQueries = 0;
  const send = (response: ServerResponse, status: number, value: unknown) => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value));
  };
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
    const allowedHosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
    if (!allowedHosts.includes(request.headers.host ?? '') ||
      (request.headers.origin !== undefined && !allowedHosts.map(host => `http://${host}`).includes(request.headers.origin))) {
      send(response, 403, { error: 'Explorer access is limited to its loopback origin' }); return;
    }
    try {
      if (request.method === 'GET' && request.url === '/explorer.json') {
        send(response, 200, { ...await service.metadata(), ...(options.sourceUrlTemplate ? { sourceUrlTemplate: options.sourceUrlTemplate } : {}) }); return;
      }
      const asset = assets.get(request.url ?? '');
      if (request.method === 'GET' && asset) {
        response.writeHead(200, { 'Content-Type': asset[1]! }); response.end(assetBytes.get(asset[0]!)); return;
      }
      if (request.url !== '/api/query') { send(response, 404, { error: 'Unknown explorer resource' }); return; }
      if (request.method !== 'POST') { send(response, 405, { error: 'Use POST for bounded read queries' }); return; }
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') { send(response, 415, { error: 'Use application/json' }); return; }
      if (activeQueries >= 4) { send(response, 429, { error: 'Explorer is busy; retry after current reads complete' }); return; }
      activeQueries++;
      try { send(response, 200, await query(service, await jsonBody(request))); }
      finally { activeQueries--; }
    } catch (error) { send(response, 400, { error: error instanceof Error ? error.message : 'Read query failed' }); }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  actualPort = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${actualPort}`, close: async () => {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  } };
}
