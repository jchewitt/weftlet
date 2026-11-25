import { graphReadCredential } from '../infrastructure/graph-read-credential.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createGraphReadClient } from '../infrastructure/graph-read-client.js';
import { toolkitIdentity } from '../infrastructure/package-identity.js';
import { graphCatalogTool, graphFactTool, handleGraphDiscovery } from './graph-discovery.js';
import { graphNeighborsTool, handleGraphNeighbors } from './graph-exploration.js';
import { graphPathsTool, handleGraphPaths } from './graph-paths.js';
import { impactScanTool } from './mcp-facade.js';
import { parseImpactScanRequest } from '../graph/impact-request.js';

function options(args: readonly string[]) {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]!, value = args[i + 1];
    if (!['--graph-url', '--snapshot', '--content-digest'].includes(name) || !value || value.startsWith('--') || flags.has(name)) {
      throw Error('Use weftlet-mcp --graph-url <url> --snapshot <id> [--content-digest <sha256>]');
    }
    flags.set(name, value);
  }
  const base = flags.get('--graph-url');
  const snapshotId = flags.get('--snapshot');
  const contentDigest = flags.get('--content-digest');
  if (!base || !snapshotId?.trim()) throw Error('Hosted MCP requires --graph-url and --snapshot');
  if (contentDigest !== undefined && !/^[a-f0-9]{64}$/.test(contentDigest)) throw Error('--content-digest requires a saved SHA-256');
  const baseUrl = new URL(base);
  if (baseUrl.protocol !== 'https:' && !(baseUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname))) {
    throw Error('Use HTTPS or a loopback URL for graph access');
  }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw Error('Graph service URL must omit credentials, query and fragment');
  return { baseUrl, snapshotId, contentDigest };
}

export async function startHostedMcp(args: readonly string[]) {
  const pinned = options(args);
  const configuredToken = process.env.WEFTLET_VIEWER_TOKEN;
  const token = configuredToken === undefined ? undefined : graphReadCredential(configuredToken);
  const identity = await toolkitIdentity();
  const server = new Server({ name: 'weftlet-hosted-reader', version: identity.version }, {
    capabilities: { tools: {} },
    instructions: 'Use impact.scan during planning and inspect cited cross-domain handoffs. Follow graph.catalog, graph.fact, graph.neighbors and graph.paths for exact evidence. Each tool uses the configured saved snapshot. Checkout freshness is unavailable. Run current-diff checks in the source checkout.',
  });
  const tools = [impactScanTool, graphCatalogTool, graphFactTool, graphNeighborsTool, graphPathsTool];
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map(tool => ({
    ...tool, inputSchema: { ...tool.inputSchema, required: 'required' in tool.inputSchema
      ? tool.inputSchema.required.filter(key => key !== 'snapshotId') : [] },
  })) }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      const params = { snapshotId: pinned.snapshotId, ...request.params.arguments };
      if (params.snapshotId !== pinned.snapshotId) throw Error('Query must use the pinned snapshot');
      const name = request.params.name;
      const reader = createGraphReadClient({ ...pinned, async fetch(url, init) {
        const headers = new Headers(init?.headers);
        if (token) headers.set('Authorization', 'Bearer ' + token);
        const response = await fetch(url, { ...init, headers, signal: extra.signal });
        if (!response.ok) {
          await response.body?.cancel();
          throw Error(`Hosted graph read failed (HTTP ${response.status})`);
        }
        return response;
      } });
      const result = name === impactScanTool.name ? await reader.scan(parseImpactScanRequest(params))
        : name === graphNeighborsTool.name ? await handleGraphNeighbors(reader, params)
        : name === graphPathsTool.name ? await handleGraphPaths(reader, params)
        : await handleGraphDiscovery(reader, name, params);
      return { content: [{ type: 'text', text: result.markdown }, { type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Hosted graph query failed' }] };
    }
  });
  await server.connect(new StdioServerTransport());
}
