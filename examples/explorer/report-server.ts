import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** Public browser-test helper only; real static deployments supply their own access controls. */
export async function servePublicReport(directory: string) {
  const assets = new Map<string, { bytes: Buffer; type: string }>();
  for (const path of await readdir(directory, { recursive: true })) {
    if (!(await stat(join(directory, path))).isFile()) continue;
    const name = path.replaceAll('\\', '/');
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : name.endsWith('.json') ? 'application/json' : 'text/plain';
    assets.set(`/public-report/${name}`, { bytes: await readFile(join(directory, path)), type });
  }
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    const asset = assets.get(request.url === '/public-report/' ? '/public-report/index.html' : request.url ?? '');
    if (request.method !== 'GET' || !asset) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'no-store' }); response.end(asset.bytes);
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/public-report/`, requests, close: async () => {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  } };
}
