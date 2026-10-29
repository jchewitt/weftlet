import { expect, it } from 'vitest';
import type { GraphFact, GraphPathsRequest, GraphSnapshot } from '@weftlet/core';
import { SnapshotGraphPathService } from './paths.js';
import { RdfEvidenceGraph, CG, factIri } from './rdf.js';
import { parseGraphPathsRequest } from './path-request.js';

function fixture() {
  const fact = (id: string, from: string, to: string, predicate: GraphFact['predicate'] = 'references'): GraphFact => ({ id,
    subject: { id: from, kind: 'Component', label: 'Same label' }, predicate,
    object: { id: to, kind: 'Component', label: 'Same label' }, confidence: 0.8,
    snapshotId: 'saved', provenance: { path: `docs/${id}.md`, startLine: 1, endLine: 2, digest: id, commitSha: 'a'.repeat(40) },
    extractor: { id: 'public-fixture', version: '1' }, authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed' });
  const snapshot: GraphSnapshot = { manifest: { schemaVersion: 1, repositoryId: 'public/paths', ref: 'HEAD', commitSha: 'a'.repeat(40),
    snapshotId: 'saved', contentDigest: 'digest', configurationDigest: 'config', scope: ['docs'], ontologyVersion: '1',
    extractorVersions: {}, semanticModel: 'none', semanticPromptVersion: '1', generatedAt: '', semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
    facts: [fact('1', 'a', 'b'), fact('2', 'a', 'b'), fact('3', 'b', 'c', 'routesThrough'), fact('4', 'c', 't'), fact('5', 'a', 't')],
    runtimeEvidence: [], invariants: [], unresolved: [], diagnostics: [{ id: 'gap', kind: 'implementationGaps',
      reason: 'Missing target mapping', relatedNodeIds: ['missing'], provenance: [], evidenceScope: 'source' }] };
  const snapshots = new Map([['saved', snapshot]]);
  const service = new SnapshotGraphPathService({ read: async id => snapshots.get(id) });
  const request: GraphPathsRequest = { snapshotId: 'saved', fromNodeId: 'a', toNodeId: 't', maxPaths: 1 };
  return { snapshot, snapshots, service, request };
}

it('returns every simple cited path with RDF-equivalent assertions and explicit pagination', async () => {
  const { snapshot, service, request } = fixture();
  const before = JSON.stringify(snapshot);
  let page = await service.paths(request);
  expect(page.paths[0]!.factIds).toEqual(['1', '3', '4']);
  expect(page.search).toMatchObject({ stopReason: 'path-page-limit', truncated: true });
  expect(page.coverage.gaps.join(' ')).toContain('unreviewed');
  expect(page.markdown).toContain('not proof of causality');
  const paths = [...page.paths];
  while (page.search.continuation) {
    page = await service.paths({ ...request, continuation: page.search.continuation });
    paths.push(...page.paths);
    for (const fact of page.facts) expect(fact).toEqual(snapshot.facts.find(original => original.id === fact.id));
  }
  expect(paths.map(path => path.factIds)).toEqual([['1', '3', '4'], ['2', '3', '4'], ['5']]);
  expect(page.search.truncated).toBe(false);
  const full = await service.paths({ ...request, maxPaths: 20 });
  const rdf = await new RdfEvidenceGraph(snapshot).select(`SELECT ?record WHERE { VALUES ?fact { ${full.facts.map(f => `<${factIri(f.id)}>`).join(' ')} } ?fact <${CG}record> ?record }`);
  expect(rdf.rows.map(row => JSON.parse(row.record!).id).sort()).toEqual(full.facts.map(f => f.id).sort());
  expect(full.facts).toEqual(snapshot.facts);
  expect(JSON.stringify(snapshot)).toBe(before);
});

it('respects exact endpoints/direction/relations, depth omissions, absent targets and historical scope', async () => {
  const { snapshot, snapshots, service, request } = fixture();
  expect((await service.paths({ ...request, direction: 'incoming' })).paths).toEqual([]);
  const incoming = await service.paths({ ...request, fromNodeId: 't', toNodeId: 'a', direction: 'incoming', maxPaths: 20 });
  expect(incoming.paths.map(path => path.factIds)).toEqual([['4', '3', '1'], ['4', '3', '2'], ['5']]);
  const both = await service.paths({ ...request, fromNodeId: 'b', toNodeId: 't', direction: 'both', maxPaths: 20 });
  expect(both.paths.some(path => path.factIds.join(',') === '1,5')).toBe(true);
  const filtered = await service.paths({ ...request, predicates: ['references'], maxPaths: 20 });
  expect(filtered.paths.map(path => path.factIds)).toEqual([['5']]);
  const depth = await service.paths({ ...request, maxDepth: 1, maxPaths: 20 });
  expect(depth.search).toMatchObject({ exhaustedWithinDepth: true, depthLimitReached: true, truncated: true });
  expect(depth.search.continuation).toBeUndefined();
  expect(depth.frontier.depthLimited.count).toBe(2);
  for (const toNodeId of ['missing', 'Same label', 'T', 't"} UNION {?a ?b ?c}']) {
    const absent = await service.paths({ ...request, toNodeId });
    expect(absent.endpoints.to.status).toBe('absent-from-snapshot');
    expect(absent.paths).toEqual([]);
    if (toNodeId === 'missing') expect(absent.diagnostics.implementationGaps.items).toHaveLength(1);
  }
  snapshots.set('new', { ...snapshot, manifest: { ...snapshot.manifest, snapshotId: 'new' }, facts: [] });
  expect((await service.paths({ ...request, snapshotId: 'new' })).endpoints.from.status).toBe('absent-from-snapshot');
  expect((await service.paths(request)).paths).toHaveLength(1);
  const identity = await service.paths({ ...request, toNodeId: 'a', predicates: ['verifiedBy'] });
  expect(identity.paths).toEqual([{ nodeIds: ['a'], factIds: [] }]);
  expect(identity.facts).toEqual([]);
  const selection = { version: 1 as const, digest: 'partial', policyDigest: 'policy', complete: false,
    entryPoints: ['docs/owner.md'], roots: [], documentPaths: ['docs/owner.md', 'docs/missing.md'],
    semanticPaths: ['docs/owner.md'], excluded: [{ path: 'docs/missing.md', reason: 'unread' as const }] };
  snapshots.set('partial', { ...snapshot, manifest: { ...snapshot.manifest, snapshotId: 'partial',
    scope: ['docs/owner.md'], documentSelection: selection }, facts: [{ ...snapshot.facts[4]!, snapshotId: 'partial' }] });
  const omitted = await service.paths({ ...request, snapshotId: 'partial', toNodeId: 'c' });
  expect(omitted.endpoints.to.status).toBe('absent-from-snapshot');
  expect(omitted.search.exhaustedWithinDepth).toBe(true);
  expect(omitted.snapshot.documentSelection).toEqual(selection);
  expect(omitted.markdown).toContain('INCOMPLETE');
  expect(omitted.markdown).toContain('absence is not proof of no product dependency');
});

it('rejects changed requests, damaged stores and stale/malformed/non-boundary cursors', async () => {
  const { snapshot, snapshots, service, request } = fixture();
  const first = await service.paths(request);
  const continuation = first.search.continuation!;
  const normalized = await service.paths({ ...request, predicates: ['references', 'routesThrough'] });
  expect((await service.paths({ ...request, predicates: ['routesThrough', 'references', 'references'],
    continuation: normalized.search.continuation })).paths[0]!.factIds).toEqual(['2', '3', '4']);
  for (const change of [{ maxDepth: 3 }, { maxPaths: 2 }, { maxSteps: 2 }, { fromNodeId: 'b' }, { toNodeId: 'c' },
    { direction: 'both' as const }, { predicates: ['references'] as const }]) {
    await expect(service.paths({ ...request, ...change, continuation })).rejects.toThrow('mismatch');
  }
  const cursor = JSON.parse(Buffer.from(continuation, 'base64url').toString());
  for (const value of [null, [], { ...cursor, version: 'old' }, { ...cursor, offset: -1 }, { ...cursor, offset: 100000 }, { ...cursor, extra: true }]) {
    await expect(service.paths({ ...request, continuation: Buffer.from(JSON.stringify(value)).toString('base64url') })).rejects.toThrow('continuation');
  }
  await expect(service.paths({ ...request, continuation: '!' })).rejects.toThrow('continuation');
  await expect(service.paths({ ...request, continuation: Buffer.from(JSON.stringify({ ...cursor, offset: 1 })).toString('base64url') })).rejects.toThrow('boundary');
  snapshots.set('saved', { ...snapshot, facts: snapshot.facts.slice(0, 4) });
  await expect(service.paths({ ...request, continuation })).rejects.toThrow('mismatch');
  snapshots.set('saved', { ...snapshot, facts: [...snapshot.facts, snapshot.facts[0]!] });
  await expect(service.paths(request)).rejects.toThrow('Duplicate fact');
  snapshots.set('wrong', snapshot);
  await expect(service.paths({ ...request, snapshotId: 'wrong' })).rejects.toThrow('identity does not match');
  await expect(service.paths({ ...request, snapshotId: 'absent' })).rejects.toThrow('No graph snapshot');
});

it.each([null, [], {}, { snapshotId: 's', fromNodeId: 'a' },
  ...[{ maxDepth: 0 }, { maxDepth: 33 }, { maxDepth: null }, { maxSteps: 10001 }, { maxSteps: '2' },
    { maxPaths: 21 }, { direction: 'sideways' }, { predicates: ['fake'] }, { task: 'search' }, { continuation: 'x'.repeat(2049) }]
    .map(extra => ({ snapshotId: 's', fromNodeId: 'a', toNodeId: 'b', ...extra }))
])('rejects invalid graph.paths inputs %j', value => expect(() => parseGraphPathsRequest(value)).toThrow());
