import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repositoryFileNode, type GraphFact, type GraphSnapshot, type SourceDocumentRole } from '@weftlet/core';
import { contextPackEvidenceAuthority } from './authority.js';
import { contextPackLaneForFact, coverageForFacts, isDeclaredFact, isImplementationEvidence } from './coverage.js';
import { sourceDocumentDescription } from './document-role-description.js';
import { RdfEvidenceGraph } from './rdf.js';
import { MarkdownContextPackRenderer, SnapshotImpactQueryService } from './query.js';
import { FileSnapshotStore } from '../storage/storage.js';
import { renderContextPackDot, renderContextPackHtml, renderContextPackSvg } from '../visualization/visualization.js';
import { sha256, stableJson } from '../infrastructure/util.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const commitSha = 'a'.repeat(40);
const roles: readonly SourceDocumentRole[] = ['intent', 'plan', 'validation', 'reference', 'unclassified'];

function documentFact(path = 'docs/report.md', changes: Partial<GraphFact> = {}): GraphFact {
  return { id: 'public-document', snapshotId: 'public-document-roles',
    subject: repositoryFileNode(path), predicate: 'references', object: repositoryFileNode('src/worker.ts'),
    provenance: { path, startLine: 1, endLine: 1, digest: 'b'.repeat(64), commitSha },
    extractor: { id: 'document-evidence-extractor', version: '1.0.0' }, confidence: 1,
    extractionReview: 'deterministic', ...changes };
}

describe('explicit source document roles', () => {
  it.each(roles)('keeps %s source role, approval, ownership and assertion authority independent', sourceRole => {
    for (const sourceAuthority of ['declared', 'inferred', 'draft'] as const) {
      const fact = documentFact('docs/report.md', { sourceRole, sourceAuthority,
        sourceOwnership: { status: 'resolved', ownerDocuments: ['docs/owner.md'], mappingIds: ['public-owner'] } });
      const before = structuredClone(fact);
      const expectedLane = sourceRole === 'validation' ? 'validationEvidence' :
        sourceRole === 'intent' && sourceAuthority === 'declared' ? 'productIntent' : 'implementationAndConsumers';
      expect(contextPackLaneForFact(fact)).toBe(expectedLane);
      expect(contextPackEvidenceAuthority(fact)).toBe('inferred');
      expect(isDeclaredFact(fact)).toBe(false);
      expect(isImplementationEvidence(fact)).toBe(false);
      expect(coverageForFacts([fact]).counts.implementationAndConsumers).toBe(0);
      const explicit = { ...fact, authority: 'declared' as const };
      expect(contextPackEvidenceAuthority(explicit)).toBe('declared');
      expect(isDeclaredFact(explicit)).toBe(sourceRole === 'intent');
      expect(fact).toEqual(before);
    }
  });

  it('uses explicit roles rather than directory guesses, without converting validation documents into test success', () => {
    const validation = documentFact('docs/report.md', { sourceRole: 'validation', sourceAuthority: 'declared' });
    expect(contextPackLaneForFact(validation)).toBe('validationEvidence');
    expect(contextPackLaneForFact({ ...validation, authority: 'declared' })).toBe('validationEvidence');
    expect(contextPackEvidenceAuthority(validation)).toBe('inferred');
    expect(validation.subject.kind).toBe('Document');
    const intent = documentFact('docs/validation/owner.md', { sourceRole: 'intent', sourceAuthority: 'declared' });
    expect(contextPackLaneForFact(intent)).toBe('productIntent');
    expect(contextPackEvidenceAuthority(intent)).toBe('inferred');
    expect(contextPackLaneForFact({ ...intent, object: repositoryFileNode('src/worker.spec.ts') })).toBe('validationEvidence');
    for (const sourceRole of ['plan', 'reference', 'unclassified'] as const) {
      const contract = documentFact('docs/validation/plan.md', { sourceRole, sourceAuthority: 'declared',
        object: { id: 'contract:work', kind: 'Contract', label: 'Work' } });
      expect(contextPackLaneForFact(contract)).toBe('contractsAndInvariants');
      expect(contextPackEvidenceAuthority(contract)).toBe('inferred');
    }
    // Even an adapter's explicit implementation authority cannot make a source
    // document role into production-code evidence.
    for (const sourceRole of roles) {
      expect(isImplementationEvidence(documentFact('src/worker.ts', { sourceRole, authority: 'implemented' }))).toBe(false);
    }
  });

  it('preserves metadata-free legacy lanes and fallback authority exactly', () => {
    const legacy = [
      [documentFact('docs/owner.md', { sourceAuthority: 'declared' }), 'productIntent', 'implemented'],
      [documentFact('docs/validation/report.md'), 'validationEvidence', 'validated'],
      [documentFact('src/worker.ts'), 'implementationAndConsumers', 'implemented'],
      [documentFact('docs/draft.md', { extractor: { id: 'codex-cli:public-fixture', version: '1' } }),
        'implementationAndConsumers', 'inferred'],
    ] as const;
    for (const [fact, lane, authority] of legacy) {
      expect(contextPackLaneForFact(fact)).toBe(lane);
      expect(contextPackEvidenceAuthority(fact)).toBe(authority);
      expect(sourceDocumentDescription(fact)).toBeUndefined();
    }
  });

  it('shows a validation Document as evidence despite an incoming approved-intent link, with exact graph facts and escaped details', async () => {
    const owner = repositoryFileNode('docs/owner.md');
    const report = repositoryFileNode('docs/report.md');
    const policy = repositoryFileNode('docs/policy.md');
    const project = { id: 'project:public/roles', kind: 'Project' as const, label: 'Public roles' };
    const ownership = { status: 'resolved' as const, ownerDocuments: ['docs/owner.md'], mappingIds: ['public-owner'] };
    const metadata = { sourcePolicyDigest: 'c'.repeat(64), sourceOwnership: ownership, sourceAuthority: 'declared' as const };
    const facts = [
      documentFact('docs/owner.md', { ...metadata, id: 'owner-to-report', subject: owner, object: report, sourceRole: 'intent' }),
      documentFact('docs/report.md', { ...metadata, id: 'report-presence', subject: project, predicate: 'contains', object: report,
        sourceRole: 'validation' }),
      documentFact('docs/report.md', { ...metadata, id: 'report-to-policy', subject: report, object: policy, sourceRole: 'validation' }),
      documentFact('docs/policy.md', { ...metadata, id: 'policy-presence', subject: project, predicate: 'contains', object: policy,
        sourceRole: 'intent' }),
    ];
    const snapshot: GraphSnapshot = { manifest: { schemaVersion: 1, repositoryId: 'public/roles', ref: 'HEAD', commitSha,
      snapshotId: 'public-document-roles', ontologyVersion: '1', extractorVersions: {}, semanticModel: 'none',
      semanticPromptVersion: 'none', generatedAt: '2026-01-01T00:00:00Z', contentDigest: sha256(stableJson(facts)),
      semanticArtifactKeys: [], scipIndexDigest: 'none', rdfDigest: 'direct-rdf' },
      facts, invariants: [], runtimeEvidence: [], unresolved: [] };
    const graph = new RdfEvidenceGraph(snapshot);
    expect(await graph.validate()).toEqual({ conforms: true, issues: [] });
    expect(await graph.facts()).toEqual(facts);
    const root = await mkdtemp(join(tmpdir(), 'weftlet-document-roles-'));
    roots.push(root);
    const store = new FileSnapshotStore(root);
    await store.write(snapshot);
    await store.updateHead('default', snapshot.manifest.snapshotId);
    const pack = await new SnapshotImpactQueryService(store, 'default').scan({ ownerDocument: 'docs/owner.md' });
    expect([...pack.facts].sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([...facts].sort((a, b) => a.id.localeCompare(b.id)));
    expect(pack.coverage.counts).toEqual({ productIntent: 2, contractsAndInvariants: 0,
      implementationAndConsumers: 0, validationEvidence: 2 });
    expect(pack.exploration?.rankingVersion).toBe('proximity-diversity-v1');
    const before = stableJson(pack);
    const html = renderContextPackHtml(pack);
    const svg = renderContextPackSvg(pack);
    const dot = renderContextPackDot(pack);
    for (const rendered of [html, svg]) {
      expect(rendered).toContain('class="visual-node column-evidence" data-visual-node="true" data-node-id="document:docs/report.md"');
      expect(rendered).toContain('class="visual-node column-intent" data-visual-node="true" data-node-id="document:docs/policy.md"');
      expect(rendered).toContain('source role validation; ownership resolved; owner documents docs/owner.md');
    }
    const evidenceCluster = dot.match(/subgraph "cluster-evidence" \{([\s\S]*?)\n {2}\}/)?.[1];
    expect(evidenceCluster).toContain('document:docs/report.md');
    expect(evidenceCluster).toContain('Document');
    expect(evidenceCluster).not.toContain('document:docs/policy.md');
    const model = JSON.parse(html.match(/<script id="visual-model" type="application\/json">([\s\S]*?)<\/script>/)![1]!);
    expect(model.edges).toHaveLength(facts.length);
    expect(model.edges.every((edge: { authority: string }) => edge.authority === 'inferred')).toBe(true);
    expect(model.nodes.find((node: { id: string }) => node.id === report.id)).toMatchObject({ kind: 'Document', column: 'evidence' });
    expect(stableJson(pack)).toBe(before);
    expect(await store.read(snapshot.manifest.snapshotId)).toEqual(snapshot);

    const untrustedOwner = 'docs/<script>alert("owner")</script>.md';
    const untrusted = { ...pack, facts: pack.facts.map(fact => ({ ...fact,
      sourceOwnership: { ...ownership, ownerDocuments: [untrustedOwner] } })) };
    const escaped = renderContextPackHtml(untrusted);
    expect(escaped).not.toContain(untrustedOwner);
    expect(escaped).toContain('docs/&lt;script&gt;alert(&quot;owner&quot;)&lt;/script&gt;.md');
    const escapedModel = JSON.parse(escaped.match(/<script id="visual-model" type="application\/json">([\s\S]*?)<\/script>/)![1]!);
    expect(escapedModel.edges[0].detail).toContain(untrustedOwner);
    const markdown = new MarkdownContextPackRenderer().render(untrusted);
    expect(markdown).not.toContain(untrustedOwner);
    expect(markdown).toContain('docs/\\<script\\>alert\\("owner"\\)\\</script\\>.md');
  });
});
