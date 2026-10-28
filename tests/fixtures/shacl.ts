import type { GraphFact, GraphSnapshot } from '@weftlet/core';
import { CG } from '../../src/graph/shacl-shapes.js';
import { sha256, stableJson } from '../../src/infrastructure/util.js';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
export const subjectId = 'workflow:public-dispatch';
export const objectId = 'component:file:src/public-worker.ts';

export function fact(index: number, overrides: Partial<GraphFact> = {}): GraphFact {
  return {
    id: `public-fact-${index}`,
    subject: { id: subjectId, kind: 'Workflow', label: 'Public dispatch',
      attributes: { domain: 'public-queue', approved: false } },
    predicate: 'implementedBy',
    object: { id: objectId, kind: 'Component', label: 'Public worker',
      attributes: { domain: 'public-queue', indexed: true, budget: index + 1 } },
    provenance: { path: `docs/public-source-${index}.md`, startLine: index + 1, endLine: index + 2,
      digest: sha256(`public-source-${index}`), commitSha: '1'.repeat(40) },
    extractor: { id: 'public-shacl-fixture', version: '1' }, confidence: 0.95,
    snapshotId: 'public-shacl-fixture', authority: 'inferred', sourceAuthority: 'declared',
    extractionReview: 'unreviewed', ...overrides,
  };
}

export function snapshot(facts: readonly GraphFact[]): GraphSnapshot {
  return {
    manifest: { schemaVersion: 1, repositoryId: 'public/shacl-validation', ref: 'HEAD',
      commitSha: '1'.repeat(40), snapshotId: 'public-shacl-fixture',
      configurationDigest: sha256('public-configuration'), scope: ['docs'], ontologyVersion: 'rdf-v1',
      extractorVersions: { fixture: '1' }, semanticModel: 'none', semanticPromptVersion: 'none',
      generatedAt: '2026-01-01T00:00:00.000Z', contentDigest: sha256(stableJson(facts)),
      semanticArtifactKeys: [], scipIndexDigest: 'public-fixture', rdfDigest: '' },
    facts, invariants: [], runtimeEvidence: [], unresolved: [],
  };
}

const first = fact(0);
const changedCitation = (change: Partial<GraphFact['provenance']>) => fact(0, {
  provenance: { ...first.provenance, ...change },
});
const collision = (change: Partial<GraphFact>) => [first, fact(1, { id: first.id, ...change })];
export const cases: { name: string; facts: readonly GraphFact[]; conforms: boolean; paths?: readonly string[] }[] = [
  { name: 'empty graph', facts: [], conforms: true },
  { name: 'duplicate relationship and attribute triples in different named graphs',
    facts: [fact(0), fact(1), fact(2), fact(3)], conforms: true },
  { name: 'all supported authority values', conforms: true,
    facts: (['declared', 'implemented', 'validated', 'observed', 'inferred', 'draft'] as const)
      .map((authority, index) => fact(index, { authority })) },
  { name: 'exact duplicate assertion identity and content', facts: [first, first], conforms: true },
  { name: 'conflicting node kinds', conforms: false, paths: [`${CG}kind`],
    facts: [first, fact(1, { subject: { ...first.subject, kind: 'Document' } })] },
  { name: 'confidence below zero', conforms: false, paths: [`${CG}confidence`], facts: [fact(0, { confidence: -0.1 })] },
  { name: 'confidence above one', conforms: false, paths: [`${CG}confidence`], facts: [fact(0, { confidence: 1.1 })] },
  { name: 'non-decimal confidence', conforms: false, paths: [`${CG}confidence`], facts: [fact(0, { confidence: Number.NaN })] },
  { name: 'citation start below one', conforms: false, paths: [`${CG}startLine`], facts: [changedCitation({ startLine: 0 })] },
  { name: 'citation end below one and preceding start', conforms: false, paths: [`${CG}endLine`], facts: [changedCitation({ endLine: 0 })] },
  { name: 'non-integer citation start', conforms: false, paths: [`${CG}startLine`], facts: [changedCitation({ startLine: 1.5 })] },
  { name: 'non-integer citation end', conforms: false, paths: [`${CG}endLine`], facts: [changedCitation({ endLine: 2.5 })] },
  { name: 'reversed positive citation', conforms: false, paths: [`${CG}endLine`], facts: [changedCitation({ startLine: 3, endLine: 2 })] },
  { name: 'empty citation path', conforms: false, paths: [`${CG}path`], facts: [changedCitation({ path: '' })] },
  { name: 'empty source commit', conforms: false, paths: [`${CG}commit`], facts: [changedCitation({ commitSha: '' })] },
  { name: 'empty source digest', conforms: false, paths: [`${CG}sourceDigest`], facts: [changedCitation({ digest: '' })] },
  // Deliberately malformed public input exercises the allowed-value constraint.
  { name: 'unsupported authority', conforms: false, paths: [`${CG}authority`],
    facts: [fact(0, { authority: 'unsupported' as GraphFact['authority'] })] },
  { name: 'record collision with different citations', conforms: false, paths: [`${CG}record`], facts: collision({}) },
  { name: 'record collision with different subjects', conforms: false, paths: [`${CG}record`, `${RDF}subject`],
    facts: collision({ subject: { ...first.subject, id: 'workflow:other-dispatch' } }) },
  { name: 'record collision with different predicates', conforms: false, paths: [`${CG}record`, `${RDF}predicate`],
    facts: collision({ predicate: 'references' }) },
  { name: 'record collision with different objects', conforms: false, paths: [`${CG}record`, `${RDF}object`],
    facts: collision({ object: { ...first.object, id: 'component:file:src/other-worker.ts' } }) },
  { name: 'record collision with different authorities', conforms: false, paths: [`${CG}record`, `${CG}authority`],
    facts: collision({ authority: 'draft' }) },
  { name: 'compound failures retain every diagnostic', conforms: false,
    paths: [`${CG}kind`, `${CG}confidence`, `${CG}path`, `${CG}endLine`], facts: [first, fact(1, {
      subject: { ...first.subject, kind: 'Document' }, confidence: -1,
      provenance: { ...first.provenance, path: '', endLine: 0 },
    })] },
];

