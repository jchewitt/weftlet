import { expect, it } from 'vitest';
import { graphCatalogRequestFromArgs, graphFactRequestFromArgs, handleGraphDiscovery, handleGraphDiscoveryTool } from './graph-discovery.js';
import { SnapshotGraphDiscoveryService } from '../graph/discovery.js';
import { explorerFixture } from '../../examples/explorer/fixture.js';

it('shares CLI/MCP discovery semantics, with bounded exact evidence and normalized literal search', async () => {
  const saved = explorerFixture(0), service = new SnapshotGraphDiscoveryService({ read: async () => saved });
  const request = graphCatalogRequestFromArgs(['--snapshot', saved.manifest.snapshotId, '--view', 'intent', '--search', ' ORDER ', '--max-nodes', '2', '--json']);
  expect(request).toEqual({ snapshotId: saved.manifest.snapshotId, view: 'intent', search: 'order', maxNodes: 2 });
  expect(await handleGraphDiscovery(service, 'graph.catalog', request)).toEqual(await service.catalog(request));
  const fact = graphFactRequestFromArgs(['--snapshot', saved.manifest.snapshotId, '--fact', 'policy-code', '--config', 'local.json']);
  expect(await handleGraphDiscovery(service, 'graph.fact', fact)).toEqual(await service.fact(fact));
  const mcp = await handleGraphDiscoveryTool(service, 'graph.fact', fact);
  expect(JSON.parse(mcp.content[1]!.text)).toEqual(await service.fact(fact));
  expect(await handleGraphDiscoveryTool(service, 'graph.catalog', {})).toMatchObject({ isError: true });
  expect(() => graphCatalogRequestFromArgs(['--snapshot', 's', '--view', 'all', '--max-nodes', '101'])).toThrow();
  expect(() => graphFactRequestFromArgs(['--snapshot', 's', '--fact', 'id', '--search', 'code'])).toThrow();
});
