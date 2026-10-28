import { describe, expect, it } from 'vitest';
import type { GraphFact, GraphNeighborsRequest, GraphNode, GraphSnapshot } from '@weftlet/core';
import { CG, nodeIri, RdfEvidenceGraph } from './rdf.js';
import { SnapshotGraphExplorationService } from './neighborhood.js';
import { parseGraphNeighborsRequest } from './neighborhood-request.js';

const node = (id: string): GraphNode => ({ id, kind: 'Component', label: 'Same label', attributes: { public: true } });
function fixture() {
  const edge = (id: string, from: string, to: string, predicate: GraphFact['predicate'] = 'consumes'): GraphFact => ({
    id, subject: node(from), predicate, object: node(to),
    provenance: { path: `docs/${id}.md`, startLine: 2, endLine: 3, digest: `source-${id}`, commitSha: 'a'.repeat(40) },
    extractor: { id: 'public-parser', version: '1' }, confidence: 0.9, snapshotId: 'saved',
    authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed', sourceRole: 'intent',
    sourceOwnership: { status: 'resolved', ownerDocuments: ['docs/owner.md'], mappingIds: ['public-owner'] },
    sourcePolicyDigest: 'public-policy',
  });
  const facts = [edge('e1', 'focus', 'b', 'implementedBy'), edge('e2', 'focus', 'b', 'implementedBy'),
    edge('e3', 'b', 'focus'), edge('e4', 'focus', 'c', 'routesThrough'), edge('e5', 'focus', 'focus', 'routesThrough'),
    edge('e6', 'b', 'd'), edge('e7', 'd', 'b'), edge('e8', 'unrelated', 'd'), edge('e9', 'c', 'd')];
  const snapshot: GraphSnapshot = { manifest: { schemaVersion: 1, repositoryId: 'public/neighbors', ref: 'HEAD',
    commitSha: 'a'.repeat(40), snapshotId: 'saved', contentDigest: 'saved-content', configurationDigest: 'public-config',
    scope: ['docs/owner.md'], ontologyVersion: '1', extractorVersions: {}, semanticModel: 'none',
    semanticPromptVersion: '1', generatedAt: '2026-10-28T00:00:00Z', semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
    facts, invariants: [], runtimeEvidence: [], unresolved: [] };
  const snapshots = new Map([['saved', snapshot]]);
  const service = new SnapshotGraphExplorationService({ read: async id => snapshots.get(id) });
  const request: GraphNeighborsRequest = { snapshotId: 'saved', nodeId: 'focus', maxFacts: 2 };
  return { snapshot, snapshots, service, request };
}

it('pages all cited incident evidence without merging parallel assertions, cycles or self-links, with explicit frontier', async () => {
  const { snapshot, service, request } = fixture();
  const before = JSON.stringify(snapshot);
  let page = await service.neighbors(request);
  expect(page.focus).toEqual({ nodeId: 'focus', status: 'present' });
  expect(page.selection).toMatchObject({ incidentFacts: 5, matchingFacts: 5, filteredFacts: 0,
    offset: 0, returnedFacts: 2, remainingFacts: 3, truncated: true });
  expect(page.frontier).toEqual({ scope: 'selected-one-hop-neighborhood', totalNeighbors: 2, remainingNeighbors: 1,
    neighbors: [{ nodeId: 'b', factIds: ['e1', 'e2'], otherIncidentFacts: 2 }] });
  expect(page.facts).toEqual(snapshot.facts.slice(0, 2));
  expect(page.markdown).toContain('[inferred]');
  expect(page.markdown).toContain('source declared; extraction unreviewed');
  expect(page.coverage.gaps).toContain('Approved-source extraction remains unreviewed; verify cited intent before using it as a rule or gate.');
  const collected = [...page.facts];
  while (page.selection.continuation) {
    page = await service.neighbors({ ...request, continuation: page.selection.continuation });
    collected.push(...page.facts);
  }
  expect(collected).toEqual(snapshot.facts.slice(0, 5));
  expect(page.selection).toMatchObject({ offset: 4, returnedFacts: 1, remainingFacts: 0, truncated: false });
  expect(page.frontier).toMatchObject({ totalNeighbors: 2, remainingNeighbors: 0, neighbors: [] });
  const rdf = await new RdfEvidenceGraph(snapshot).select(`SELECT ?record WHERE {
    ?f <${CG}record> ?record; <http://www.w3.org/1999/02/22-rdf-syntax-ns#subject> ?s;
       <http://www.w3.org/1999/02/22-rdf-syntax-ns#object> ?o.
    FILTER (?s = <${nodeIri('focus')}> || ?o = <${nodeIri('focus')}>) }`);
  expect(collected.map(f => f.id).sort()).toEqual(rdf.rows.map(row => JSON.parse(row.record!).id).sort());
  expect(JSON.stringify(snapshot)).toBe(before);
});

it('uses exact IDs and direction/predicate filters, including explicit filtered-empty and absent results', async () => {
  const { service, request } = fixture();
  const incoming = await service.neighbors({ ...request, direction: 'incoming', maxFacts: 200 });
  expect(incoming.facts.map(f => f.id)).toEqual(['e3', 'e5']);
  const outgoing = await service.neighbors({ ...request, direction: 'outgoing', maxFacts: 200 });
  expect(outgoing.facts.map(f => f.id)).toEqual(['e1', 'e2', 'e4', 'e5']);
  const filtered = await service.neighbors({ ...request, predicates: ['routesThrough'], maxFacts: 200 });
  expect(filtered.facts.map(f => f.id)).toEqual(['e4', 'e5']);
  expect(filtered.selection.filteredFacts).toBe(3);
  const empty = await service.neighbors({ ...request, predicates: ['verifiedBy'] });
  expect(empty.focus.status).toBe('present');
  expect(empty.selection).toMatchObject({ matchingFacts: 0, filteredFacts: 5, truncated: false });
  for (const nodeId of ['Same label', 'foc', 'FOCUS', 'focus" } UNION {?s ?p ?o} #']) {
    const missing = await service.neighbors({ ...request, nodeId });
    expect(missing.focus.status).toBe('absent-from-snapshot');
    expect(missing.facts).toEqual([]);
  }
  const branch = await service.neighbors({ ...request, nodeId: 'b', maxFacts: 200 });
  expect(branch.facts.map(f => f.id)).toEqual(['e1', 'e2', 'e3', 'e6', 'e7']);
  expect(branch.facts.some(f => f.id === 'e8')).toBe(false);
});

it('keeps historical/deleted identities and pagination pinned to the requested snapshot', async () => {
  const { snapshot, snapshots, service, request } = fixture();
  const first = await service.neighbors(request);
  snapshots.set('next', { ...snapshot, manifest: { ...snapshot.manifest, snapshotId: 'next', contentDigest: 'deleted' }, facts: [] });
  expect((await service.neighbors({ ...request, snapshotId: 'next' })).focus.status).toBe('absent-from-snapshot');
  expect((await service.neighbors(request)).focus.status).toBe('present');
  const continuation = first.selection.continuation!;
  for (const change of [{ snapshotId: 'next' }, { nodeId: 'b' }, { maxFacts: 1 },
    { direction: 'outgoing' as const }, { predicates: ['implementedBy'] as const }]) {
    await expect(service.neighbors({ ...request, ...change, continuation })).rejects.toThrow('does not match');
  }
  // Even an externally damaged store preserving the old manifest/digest must invalidate the cursor.
  snapshots.set('saved', { ...snapshot, facts: snapshot.facts.map(f => f.id === 'e9' ? { ...f, confidence: 0.5 } : f) });
  await expect(service.neighbors({ ...request, continuation })).rejects.toThrow('does not match');
  await expect(service.neighbors({ ...request, snapshotId: 'missing' })).rejects.toThrow('No graph snapshot');
  snapshots.set('wrong', snapshot);
  await expect(service.neighbors({ ...request, snapshotId: 'wrong' })).rejects.toThrow('identity does not match');
});

it('rejects malformed/version-mismatched continuations and duplicate assertion IDs without silently losing evidence', async () => {
  const { snapshot, snapshots, service, request } = fixture();
  const first = await service.neighbors(request);
  const original = JSON.parse(Buffer.from(first.selection.continuation!, 'base64url').toString('utf8'));
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  for (const continuation of ['!', encode(null), encode([]), encode({ ...original, extra: true }),
    ...[-1, 0, 1, 6, 2.5, '2'].map(offset => encode({ ...original, offset }))]) {
    await expect(service.neighbors({ ...request, continuation })).rejects.toThrow('Invalid graph.neighbors continuation');
  }
  await expect(service.neighbors({ ...request, continuation: encode({ ...original, version: 'old' }) })).rejects.toThrow('does not match');
  snapshots.set('saved', { ...snapshot, facts: [...snapshot.facts, snapshot.facts[0]!] });
  await expect(service.neighbors(request)).rejects.toThrow('Duplicate fact identities');
});

it('normalizes equivalent relation selections so their continuations remain valid', async () => {
  const { service, request } = fixture();
  const first = await service.neighbors({ ...request, predicates: ['implementedBy', 'routesThrough'], maxFacts: 1 });
  const second = await service.neighbors({ ...request, predicates: ['routesThrough', 'implementedBy', 'implementedBy'],
    maxFacts: 1, continuation: first.selection.continuation });
  expect(second.facts.map(f => f.id)).toEqual(['e2']);
});

it('keeps exact-node and cited diagnostics visible, including absent targets, with explicit omissions', async () => {
  const { snapshot, snapshots, service, request } = fixture();
  const diagnostics = Array.from({ length: 7 }, (_, index) => ({ id: `gap-${index}`, kind: 'implementationGaps' as const,
    reason: 'Missing implementation mapping', relatedNodeIds: ['missing'], provenance: [], evidenceScope: 'source' as const }));
  snapshots.set('saved', { ...snapshot, unresolved: ['legacy-content-not-dumped'], diagnostics: [...diagnostics,
    { id: 'unrelated', kind: 'implementationGaps', reason: 'Same label', relatedNodeIds: ['unrelated'], provenance: [], evidenceScope: 'source' },
    { id: 'citation', kind: 'ambiguousIntent', reason: 'Cited ambiguity', relatedNodeIds: [],
      provenance: [snapshot.facts[0]!.provenance], evidenceScope: 'source' }] });
  const missing = await service.neighbors({ ...request, nodeId: 'missing' });
  expect(missing.focus.status).toBe('absent-from-snapshot');
  expect(missing.diagnostics.implementationGaps).toMatchObject({ omittedRelevant: 2, omittedUnrelated: 1 });
  expect(missing.diagnostics.implementationGaps.items).toEqual(diagnostics.slice(0, 5));
  expect(missing.diagnostics.unclassifiedLegacyCount).toBe(1);
  expect(JSON.stringify(missing)).not.toContain('legacy-content-not-dumped');
  const present = await service.neighbors(request);
  expect(present.diagnostics.ambiguousIntent.items.map(item => item.id)).toEqual(['citation']);
  expect(present.diagnostics.implementationGaps.items).toEqual([]);
  expect(present.markdown).toContain('Cited ambiguity');
});

describe('shared input bounds', () => {
  it.each([
    null, [], {}, { snapshotId: 'saved' }, { snapshotId: 'saved', nodeId: '' },
    { snapshotId: 's'.repeat(257), nodeId: 'n' }, { snapshotId: 'saved', nodeId: 'n'.repeat(8193) },
    ...[{ maxFacts: 0 }, { maxFacts: 201 }, { maxFacts: 1.5 }, { maxFacts: '2' }, { maxFacts: null },
      { direction: null }, { predicates: null }, { direction: 'sideways' },
      { predicates: 'contains' }, { predicates: ['invented'] }, { predicates: [null] },
      { continuation: '' }, { continuation: 'x'.repeat(2049) }, { task: 'not a text query' }]
      .map(value => ({ snapshotId: 'saved', nodeId: 'n', ...value })),
  ])('rejects invalid request %j', value => {
    expect(() => parseGraphNeighborsRequest(value)).toThrow();
  });
});
