import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { SnapshotImpactQueryService } from '../src/graph/query.js';
import { SnapshotGraphDiscoveryService } from '../src/graph/discovery.js';
import { SnapshotGraphExplorationService } from '../src/graph/neighborhood.js';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { RdfEvidenceGraph } from '../src/graph/rdf.js';
import { evidenceBytes } from '../scripts/retrieval-study/preservation.js';
import { changedOwnerFiles, competingOwnerSnapshot, ownerFact, ownerPath, ownerSnapshot } from '../examples/owner-intent/fixture.js';

describe('exact-owner evidence retrieval', () => {
  it.each([false, true])('reports owner contracts as intent too, without granting approval (explicit role %s)', async explicit => {
    const fact = ownerFact('business-rule', 'governedBy', { id: 'contract:capacity', kind: 'Contract', label: 'Capacity rule' },
      explicit ? { sourceRole: 'intent' } : {});
    const snapshot = ownerSnapshot([fact]), before = JSON.stringify(snapshot);
    const read = async () => snapshot;
    const store = { read, readHead: read, write: async () => {}, updateHead: async () => {} };
    expect((await new RdfEvidenceGraph(snapshot).validate()).conforms).toBe(true);
    const pack = await new SnapshotImpactQueryService(store, 'default').scan({ ownerDocument: ownerPath });
    expect(pack.coverage.counts).toEqual({ productIntent: 1, contractsAndInvariants: 1,
      implementationAndConsumers: 0, validationEvidence: 0 });
    expect(pack.diagnostics.missingIntent.items).toEqual([]);
    expect(pack.markdown.split('## productIntent')[1]!.split('## contractsAndInvariants')[0]).toContain('Capacity rule');
    expect(pack.markdown).toContain('source declared; extraction unreviewed');
    const catalog = await new SnapshotGraphDiscoveryService(store).catalog({ snapshotId: snapshot.manifest.snapshotId, view: 'intent', search: ownerPath });
    expect(catalog.nodes.map(item => item.node.id)).toEqual(['workflow:reservation', 'contract:capacity']);
    expect(catalog.overview.views.intent.facts).toBe(1);
    const neighbors = await new SnapshotGraphExplorationService(store).neighbors({ snapshotId: snapshot.manifest.snapshotId, nodeId: fact.subject.id });
    expect(neighbors.coverage.counts).toEqual(pack.coverage.counts);
    expect(neighbors.facts).toEqual(pack.facts);
    expect(pack.facts[0]).toEqual(fact);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it.each([false, true])('retrieves semantic owner evidence at the unchanged budget amid multiple code anchors (explicit role %s)', async explicit => {
    const { snapshot, target } = competingOwnerSnapshot(explicit);
    const root = await mkdtemp(join(tmpdir(), 'weftlet-owner-query-'));
    try {
      const store = new FileSnapshotStore(root);
      expect((await new RdfEvidenceGraph(snapshot).validate()).conforms).toBe(true);
      await store.write(snapshot);
      const before = await evidenceBytes(root);
      const service = new SnapshotImpactQueryService(store, 'default');
      const request = { snapshotId: snapshot.manifest.snapshotId, ownerDocument: ownerPath,
        changedFiles: changedOwnerFiles, task: 'Fulfillment index reconcile',
        checklistItems: ['Index', 'Reconcile', 'Fulfillment'], maxFacts: 60, maxDepth: 3 };
      // Equivalent anchors without an explicit owner use the unchanged baseline order.
      const { ownerDocument: _owner, ...withoutOwner } = request;
      const baseline = await service.scan({ ...withoutOwner, changedFiles: [ownerPath, ...changedOwnerFiles] });
      expect(baseline.facts.some(fact => fact.id === target.id)).toBe(false);
      const first = await service.scan(request);
      expect(first.facts).toHaveLength(60);
      expect(first.facts).toContainEqual(target);
      expect(first.exploration).toMatchObject({ reachableFacts: snapshot.facts.length,
        truncated: true, maxDepth: 3, ownerIntent: { citedFacts: 165, intentFacts: 165, assertionFacts: 100 } });
      expect(first.exploration!.ownerIntent!.priorityFactIds).toHaveLength(4);
      expect(first.exploration!.ownerIntent!.returnedAssertions).toBeGreaterThanOrEqual(4);
      expect(first.exploration!.ownerIntent!.priorityFactIds.every(id => !id.startsWith('owner-link-'))).toBe(true);
      expect(first.exploration!.reachableFacts).toBe(baseline.exploration!.reachableFacts);
      expect(await service.scan(request)).toEqual(first);
      const windows = await service.scan({ ...request, ownerDocument: '.\\docs\\intent\\reservation-owner.md' });
      expect(windows.facts).toEqual(first.facts);
      expect(windows.exploration!.ownerIntent).toEqual(first.exploration!.ownerIntent);
      // Keep one stable order across page sizes; continuation exhausts all saved facts once.
      const all = [...first.facts];
      let page = first;
      while (page.exploration?.continuation) {
        page = await service.scan({ ...request, continuation: page.exploration.continuation });
        all.push(...page.facts);
      }
      expect(all).toHaveLength(snapshot.facts.length);
      expect(new Set(all.map(fact => fact.id))).toEqual(new Set(snapshot.facts.map(fact => fact.id)));
      for (const fact of all) expect(fact).toEqual(snapshot.facts.find(item => item.id === fact.id));
      const tiny = await service.scan({ ...request, maxFacts: 1 });
      expect(tiny.facts).toEqual(first.facts.slice(0, 1));
      expect(tiny.exploration!.ownerIntent!.returnedAssertions).toBe(1);
      const token = JSON.parse(Buffer.from(first.exploration!.continuation!, 'base64url').toString('utf8'));
      await expect(service.scan({ ...request, continuation: Buffer.from(JSON.stringify({ ...token, ranking: 'shared-symbol-witnesses-v4' })).toString('base64url') })).rejects.toThrow('restart');
      await expect(service.scan({ ...request, task: 'other', continuation: first.exploration!.continuation })).rejects.toThrow('does not match');
      expect(await evidenceBytes(root)).toEqual(before);
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  }, 30_000);
});
