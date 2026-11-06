import { expect, it } from 'vitest';
import { explorerFixture } from '../../examples/explorer/fixture.js';
import { SnapshotGraphDiscoveryService } from './discovery.js';
import { SnapshotGraphExplorationService } from './neighborhood.js';
import { SnapshotGraphPathService } from './paths.js';
import { SnapshotIndexReader } from './snapshot-index.js';
import { SnapshotImpactQueryService } from './query.js';
import { CG, RdfEvidenceGraph } from './rdf.js';
import { parseGraphCatalogRequest, parseGraphFactRequest } from './discovery-request.js';

it('discovers saved intent outside an impact page without approving inference or treating code/validation/plans as intent', async () => {
  const saved = explorerFixture();
  const read = async () => saved;
  const service = new SnapshotGraphDiscoveryService({ read });
  const scan = new SnapshotImpactQueryService({ read, readHead: read, write: async () => {}, updateHead: async () => {} }, 'default');
  const impact = await scan.scan({ changedFiles: ['src/noise-50.ts'], maxDepth: 1, maxFacts: 60 });
  expect(impact.facts.every(fact => fact.authority === 'implemented')).toBe(true);
  const result = await service.catalog({ snapshotId: saved.manifest.snapshotId });
  expect(result.nodes.map(item => item.node.id)).toEqual(['capability:orders', 'workflow:reserve', 'workflow:ship', 'contract:reservation']);
  expect(result.overview).toMatchObject({ scope: 'saved-snapshot', facts: saved.facts.length,
    views: { intent: { facts: 4, nodes: 4 } }, diagnosticCounts: { implementationGaps: 1 } });
  const reserve = result.nodes.find(item => item.node.id === 'workflow:reserve')!;
  expect(reserve.authorities).toEqual({ declared: 1, inferred: 2 });
  expect(reserve.sourceAuthorities).toEqual({ declared: 3 });
  expect(reserve.extractionReviews).toEqual({ approved: 1, unreviewed: 2 });
  expect(result.markdown).toContain('does not grant approval');
  expect(result.nodes.some(item => item.node.kind === 'Component')).toBe(false);
  expect((await service.catalog({ snapshotId: saved.manifest.snapshotId, view: 'evidence' })).nodes.map(item => item.node.id))
    .toContain('document:validation.md');
  expect((await new RdfEvidenceGraph(saved).validate()).conforms).toBe(true);
});

it('pages deterministic search over the whole snapshot and keeps exact RDF facts, citations and relationship direction', async () => {
  const saved = explorerFixture(0), before = JSON.stringify(saved);
  const reader = { read: async () => saved, readRevision: async () => 'unchanged' };
  const indexes = new SnapshotIndexReader(reader), service = new SnapshotGraphDiscoveryService(reader, indexes);
  const request = { snapshotId: saved.manifest.snapshotId, maxNodes: 2 };
  const first = await service.catalog(request), second = await service.catalog({ ...request, continuation: first.selection.continuation });
  expect([...first.nodes, ...second.nodes].map(item => item.node.id)).toEqual(
    (await service.catalog({ snapshotId: request.snapshotId })).nodes.map(item => item.node.id));
  expect(second.selection).toMatchObject({ remainingNodes: 0, truncated: false, offset: 2 });
  expect((await service.catalog({ ...request, search: '  RESERVE  ' })).nodes.map(item => item.node.id)).toEqual(['workflow:reserve']);
  expect((await service.catalog({ ...request, search: 'docs/order-policy.md', maxNodes: 100 })).nodes).toHaveLength(4);
  expect((await service.catalog({ ...request, search: 'nonexistent' })).selection).toMatchObject({ matchingNodes: 0, truncated: false });
  const fact = await service.fact({ snapshotId: request.snapshotId, factId: 'policy-queue' });
  const rdf = await new RdfEvidenceGraph(saved).select(`SELECT ?record WHERE { ?f <${CG}record> ?record }`);
  expect(fact.fact).toEqual(rdf.rows.map(row => JSON.parse(row.record!)).find(item => item.id === 'policy-queue'));
  const neighbor = await new SnapshotGraphExplorationService(reader, indexes).neighbors({ snapshotId: request.snapshotId, nodeId: 'workflow:reserve' });
  expect(neighbor.facts).toContainEqual(fact.fact);
  const path = await new SnapshotGraphPathService(reader, indexes).paths({ snapshotId: request.snapshotId,
    fromNodeId: 'workflow:reserve', toNodeId: 'component:file:src/worker.ts', direction: 'outgoing', maxSteps: 1000 });
  expect(path.paths).toContainEqual({ nodeIds: ['workflow:reserve', 'workflow:ship', 'component:file:src/worker.ts'], factIds: ['policy-queue', 'policy-code'] });
  for (const item of path.facts) expect(item).toEqual(saved.facts.find(original => original.id === item.id));
  expect((await service.fact({ snapshotId: request.snapshotId, factId: 'not-present' })).status).toBe('absent-from-snapshot');
  Object.assign(first.nodes[0]!.authorities, { declared: 1000 });
  expect((await service.catalog(request)).nodes[0]!.authorities).toEqual({ declared: 1 });
  expect(JSON.stringify(saved)).toBe(before);
});

it('retains logical component concepts cited by intent sources while keeping physical code endpoints out of the intent overview', async () => {
  const base = explorerFixture(0);
  const saved = { ...base, facts: base.facts.map(fact => ({ ...fact,
    subject: fact.subject.id === 'workflow:ship' ? { ...fact.subject, kind: 'Component' as const } : fact.subject,
    object: fact.object.id === 'workflow:ship' ? { ...fact.object, kind: 'Component' as const } : fact.object,
  })) };
  const result = await new SnapshotGraphDiscoveryService({ read: async () => saved }).catalog({ snapshotId: saved.manifest.snapshotId });
  expect(result.nodes.find(item => item.node.id === 'workflow:ship')).toMatchObject({ node: { kind: 'Component' }, authorities: { inferred: 2 } });
  expect(result.nodes.some(item => item.node.id === 'component:file:src/worker.ts')).toBe(false);
});

it('rejects changed queries, corrupt stores, stale cursors and invalid input without hiding empty intent', async () => {
  let saved = explorerFixture();
  const service = new SnapshotGraphDiscoveryService({ read: async () => saved });
  const request = { snapshotId: saved.manifest.snapshotId, maxNodes: 1 };
  const first = await service.catalog(request), continuation = first.selection.continuation!;
  for (const change of [{ view: 'all' as const }, { search: 'order' }, { maxNodes: 2 }]) {
    await expect(service.catalog({ ...request, ...change, continuation })).rejects.toThrow('mismatch');
  }
  const original = JSON.parse(Buffer.from(continuation, 'base64url').toString('utf8'));
  for (const token of ['!', 'e30', Buffer.from(JSON.stringify({ ...original, version: 'snapshot-catalog-v1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...original, offset: 1.5 })).toString('base64url')]) {
    await expect(service.catalog({ ...request, continuation: token })).rejects.toThrow('Invalid');
  }
  saved = { ...saved, facts: saved.facts.map(fact => fact.id === 'policy-queue' ? { ...fact, confidence: 0.5 } : fact) };
  await expect(service.catalog({ ...request, continuation })).rejects.toThrow('mismatch');
  saved = { ...saved, facts: saved.facts.filter(fact => fact.authority === 'implemented') };
  const empty = await service.catalog(request);
  expect(empty.nodes).toEqual([]);
  expect(empty.overview.views.intent).toEqual({ facts: 0, nodes: 0 });
  expect(empty.overview.facts).toBeGreaterThan(0);
  expect(empty.overview.limitations.join(' ')).toContain('coverage gap');
  for (const value of [null, [], {}, { snapshotId: 's', view: 'approved' }, { snapshotId: 's', search: 4 },
    { snapshotId: 's', maxNodes: 101 }, { snapshotId: 's', maxNodes: null }, { snapshotId: 's', search: 'a'.repeat(257) },
    { snapshotId: 's', unexpected: true }, { snapshotId: 's', continuation: '' }]) expect(() => parseGraphCatalogRequest(value)).toThrow();
  for (const value of [{ snapshotId: 's' }, { snapshotId: 's', factId: '' }, { snapshotId: 's', factId: 'f', search: 'x' }]) {
    expect(() => parseGraphFactRequest(value)).toThrow();
  }
});
