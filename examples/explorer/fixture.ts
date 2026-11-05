import type { GraphFact, GraphNode, GraphSnapshot } from '@weftlet/core';

export function explorerFixture(noise = 250): GraphSnapshot {
  const node = (id: string, kind: GraphNode['kind'], label = id): GraphNode => ({ id, kind, label });
  const fact = (id: string, subject: GraphNode, predicate: GraphFact['predicate'], object: GraphNode,
    options: Partial<GraphFact> = {}): GraphFact => ({ id, subject, predicate, object,
    provenance: { path: 'docs/order-policy.md', startLine: 2, endLine: 3, commitSha: 'a'.repeat(40), digest: 'public-source' },
    extractor: { id: 'public-fixture', version: '1' }, confidence: 1, snapshotId: 'public-explorer', ...options });
  const intent = { authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed', sourceRole: 'intent' } as const;
  const order = node('capability:orders', 'Capability', 'Order fulfillment');
  const reserve = node('workflow:reserve', 'Workflow', 'Reserve inventory');
  const ship = node('workflow:ship', 'Workflow', 'Ship after reservation');
  const file = node('component:file:src/worker.ts', 'Component', 'Shipping worker');
  const facts: GraphFact[] = [
    fact('policy-reserve', order, 'realizes', reserve, { ...intent, authority: 'declared', extractionReview: 'approved' }),
    fact('policy-queue', reserve, 'routesThrough', ship, intent),
    fact('policy-code', ship, 'implementedBy', file, intent),
    fact('contract', reserve, 'governedBy', node('contract:reservation', 'Contract', 'Reservation record'), intent),
    fact('validation', node('document:validation.md', 'Document', 'Approved order validation'), 'references',
      node('component:file:test/worker.test.ts', 'Evidence'), { ...intent, sourceRole: 'validation', authority: 'validated' }),
    fact('draft', node('workflow:future', 'Workflow', 'Future plan'), 'references', file,
      { sourceRole: 'plan', authority: 'draft', sourceAuthority: 'draft', extractionReview: 'unreviewed' }),
    ...Array.from({ length: noise }, (_, i) => fact(`code-${String(i).padStart(6, '0')}`,
      node(`component:file:src/noise-${i}.ts`, 'Component', 'Product intent implementation'), 'references',
      node(`component:file:src/noise-${i + 1}.ts`, 'Component'), {
        authority: 'implemented', extractionReview: 'deterministic',
        provenance: { path: `src/noise-${i}.ts`, startLine: 1, endLine: 1, digest: `public-${i}`, commitSha: 'a'.repeat(40) },
      })),
  ];
  return { manifest: { schemaVersion: 1, repositoryId: 'public/explorer', ref: 'HEAD', commitSha: 'a'.repeat(40),
    snapshotId: 'public-explorer', contentDigest: 'public-content', configurationDigest: 'public-config', scope: ['docs/order-policy.md'],
    ontologyVersion: '1', extractorVersions: {}, semanticModel: 'none', semanticPromptVersion: '1', generatedAt: '2026-11-05T00:00:00Z',
    semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' }, facts, runtimeEvidence: [], invariants: [], unresolved: [],
    diagnostics: [{ id: 'mapping-gap', kind: 'implementationGaps', reason: 'Reservation handler has no saved exact binding.',
      relatedNodeIds: [reserve.id], provenance: [facts[0]!.provenance], evidenceScope: 'source' }] };
}
