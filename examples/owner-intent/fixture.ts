import type { GraphFact, GraphNode, GraphSnapshot } from '@weftlet/core';
import { sha256, stableJson } from '@weftlet/core';

export const ownerPath = 'docs/intent/reservation-owner.md';
export const changedOwnerFiles = Array.from({ length: 8 }, (_, i) => `src/stage-${i}.ts`);
const node = (id: string, kind: GraphNode['kind'], label = id): GraphNode => ({ id, kind, label });
const workflow = node('workflow:reservation', 'Workflow', 'Reservation');
const commitSha = 'a'.repeat(40), snapshotId = 'public-owner-intent';

export function ownerFact(id: string, predicate: GraphFact['predicate'], object: GraphNode,
  changes: Partial<GraphFact> = {}): GraphFact {
  return { id, subject: workflow, predicate, object, snapshotId, confidence: 0.9,
    provenance: { path: ownerPath, startLine: 1, endLine: 1, digest: sha256(ownerPath), commitSha },
    extractor: { id: 'codex-cli:public-query-fixture', version: '1' },
    authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed', ...changes };
}
export function ownerSnapshot(facts: GraphFact[]): GraphSnapshot {
  return { manifest: { schemaVersion: 1, repositoryId: 'public/owner-intent', ref: 'HEAD', commitSha,
    snapshotId, contentDigest: sha256(stableJson(facts)), generatedAt: '2026-11-06T00:00:00Z',
    ontologyVersion: 'rdf-v1', extractorVersions: {}, semanticModel: 'none-public-synthetic-fixture',
    semanticPromptVersion: 'none', semanticArtifactKeys: [], scipIndexDigest: 'none', rdfDigest: 'none' },
    facts, invariants: [], runtimeEvidence: [], unresolved: [] };
}

/** Saved-fact query fixture, not a model/extraction-quality or private-graph claim.
 * Same owner composition as the sanitized report, with public independent labels. */
export function competingOwnerSnapshot(explicitRole = false) {
  const target = ownerFact('owner-semantic-target', 'routesThrough', node('workflow:fulfillment', 'Workflow', 'Fulfillment'));
  const assertions = [target, ...Array.from({ length: 14 }, (_, i) => ownerFact(`owner-semantic-${i}`,
    'operationallyOwnedBy', node(`workflow:other-${i}`, 'Workflow')))];
  const links = Array.from({ length: 65 }, (_, i) => ownerFact(`owner-link-${i}`, 'contains',
    node(`workflow:linked-${i}`, 'Workflow'), {
      subject: node(`document:${ownerPath}`, 'Document'), extractor: { id: 'document-linker', version: '2.0.0' } }));
  const contracts = Array.from({ length: 83 }, (_, i) => ownerFact(`owner-contract-${i}`, 'governedBy',
    node(`contract:reservation-${i}`, 'Contract', 'Fulfillment index reconcile')));
  const mappings = [0, 1].map(i => ownerFact(`owner-component-${i}`, 'realizes',
    node(`component:file:${changedOwnerFiles[i]}`, 'Component'), { subject: node(`component:policy-${i}`, 'Component') }));
  const owner = [...links, ...assertions, ...contracts, ...mappings]
    .map(fact => explicitRole ? { ...fact, sourceRole: 'intent' as const } : fact);
  const code = changedOwnerFiles.flatMap(path => Array.from({ length: 100 }, (_, i) => {
    const original = ownerFact(`${path}-${i}`, i % 2 ? 'consumes' : 'references',
      i % 2 ? node(`contract:code-${i}`, 'Contract', 'Fulfillment index reconcile')
        : node(`component:file:src/consumer-${i}.ts`, 'Component', 'Fulfillment index reconcile'), {
        subject: node(`component:file:${path}`, 'Component', 'Fulfillment index reconcile'),
        provenance: { path, startLine: i + 1, endLine: i + 1, digest: sha256(path), commitSha },
        extractor: { id: 'public-static-fixture', version: '1' }, authority: 'implemented', extractionReview: 'deterministic',
      });
    const { sourceAuthority: _sourceAuthority, ...fact } = original;
    return fact;
  }));
  return { snapshot: ownerSnapshot([...owner, ...code]), target: owner.find(fact => fact.id === target.id)! };
}
