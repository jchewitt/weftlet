import { Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import { describe, expect, it } from 'vitest';
import type { GraphFact, GraphSnapshot } from '@weftlet/core';
import { CG, factIri, nodeIri, RdfEvidenceGraph } from '../src/graph/rdf.js';
import { evidenceShapes } from '../src/graph/shacl-shapes.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';
import type { GraphValidationProgress } from '../src/graph/validation-progress.js';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const subjectId = 'workflow:public-dispatch';
const objectId = 'component:file:src/public-worker.ts';

function fact(index: number, overrides: Partial<GraphFact> = {}): GraphFact {
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

function snapshot(facts: readonly GraphFact[]): GraphSnapshot {
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

type ValidationResult = Awaited<ReturnType<RdfEvidenceGraph['validate']>>;

function normalized(result: ValidationResult): ValidationResult {
  return { conforms: result.conforms,
    issues: [...result.issues].sort((left, right) => stableJson(left).localeCompare(stableJson(right))) };
}

/** Independent reference path: validate the complete original named dataset directly. */
async function originalDatasetVerdict(value: GraphSnapshot, serialized: string): Promise<ValidationResult> {
  const dataset = new Store(new Parser({ format: 'N-Quads' }).parse(serialized));
  const report = await new SHACLValidator(new Store(evidenceShapes)).validate(dataset);
  const issues: ValidationResult['issues'] = report.results.map((result) => ({
    category: 'extraction-gap', focus: result.focusNode?.value, path: result.path?.value,
    message: result.message.map((message) => message.value).join('; '),
  }));
  // This deterministic check supplements SHACL in the released validator as well.
  for (const item of value.facts) if (item.provenance.endLine < item.provenance.startLine) {
    issues.push({ category: 'extraction-gap', focus: factIri(item.id), path: `${CG}endLine`,
      message: 'Citation ends before it starts' });
  }
  return normalized({ conforms: report.conforms && issues.length === 0, issues });
}

const first = fact(0);
const changedCitation = (change: Partial<GraphFact['provenance']>) => fact(0, {
  provenance: { ...first.provenance, ...change },
});
const collision = (change: Partial<GraphFact>) => [first, fact(1, { id: first.id, ...change })];
const cases: { name: string; facts: readonly GraphFact[]; conforms: boolean; paths?: readonly string[] }[] = [
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

describe('SHACL validation projection parity', () => {
  it('reports phase boundaries and elapsed time without changing a negative full-validation verdict', async () => {
    const graph = new RdfEvidenceGraph(snapshot([fact(0, { confidence: 1.5 })]));
    const before = await graph.serialize();
    const progress: GraphValidationProgress[] = [];
    const report = await graph.validate({ onProgress: event => progress.push(event) });
    expect(report).toEqual(await graph.validate());
    expect(report.conforms).toBe(false);
    expect(progress.map(event => [event.phase, event.status])).toEqual([
      ['build-validation-union', 'started'], ['build-validation-union', 'completed'],
      ['validate-shacl', 'started'], ['validate-shacl', 'completed'],
    ]);
    for (const event of progress) {
      expect(event.factCount).toBe(1);
      expect(event.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(Object.keys(event).sort()).toEqual(['elapsedMs', 'factCount', 'phase', 'status']);
    }
    expect(await graph.serialize()).toBe(before);
  });

  it.each(cases)('matches the original dataset for $name', async ({ facts, conforms, paths = [] }) => {
    const value = snapshot(facts);
    const graph = new RdfEvidenceGraph(value);
    const serialized = await graph.serialize();
    const reference = await originalDatasetVerdict(value, serialized);
    expect(reference.conforms).toBe(conforms);
    expect(reference.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(paths));
    expect(normalized(await graph.validate())).toEqual(reference);
    expect(await graph.serialize()).toBe(serialized);
  });

  it('preserves fact-specific named attributes, citations, review authority and the traversal projection', async () => {
    const facts = [fact(0), fact(12, { sourceAuthority: 'inferred', extractionReview: 'approved' })];
    const graph = new RdfEvidenceGraph(snapshot(facts));
    const serialized = await graph.serialize();
    const query = `SELECT ?fact ?path ?start ?end ?digest ?commit ?sourceAuthority ?review ?budget ?record WHERE {
      GRAPH ?fact {
        <${nodeIri(subjectId)}> <${CG}implementedBy> <${nodeIri(objectId)}> .
        <${nodeIri(objectId)}> <${CG}attribute/budget> ?budget
      }
      ?fact <${CG}path> ?path; <${CG}startLine> ?start; <${CG}endLine> ?end;
        <${CG}sourceDigest> ?digest; <${CG}commit> ?commit;
        <${CG}sourceAuthority> ?sourceAuthority; <${CG}extractionReview> ?review; <${CG}record> ?record
    } ORDER BY ?fact`;
    const expectedRows = facts.map((item) => ({
      fact: factIri(item.id), path: item.provenance.path,
      start: String(item.provenance.startLine), end: String(item.provenance.endLine),
      digest: item.provenance.digest, commit: item.provenance.commitSha,
      sourceAuthority: item.sourceAuthority!, review: item.extractionReview!,
      budget: String(item.object.attributes!.budget), record: stableJson(item),
    }));
    expect(await graph.select(query)).toEqual({ rows: expectedRows, truncated: false });
    expect(await graph.facts()).toEqual(facts);
    expect((await graph.validate()).conforms).toBe(true);
    expect((await graph.validate()).conforms).toBe(true);
    expect(await graph.serialize()).toBe(serialized);
    expect(await graph.select(query)).toEqual({ rows: expectedRows, truncated: false });
    expect(await graph.facts()).toEqual(facts);
    const quads = new Parser({ format: 'N-Quads' }).parse(await graph.serialize());
    expect(new Set(quads.filter((item) => item.graph.termType === 'NamedNode').map((item) => item.graph.value)))
      .toEqual(new Set(facts.map((item) => factIri(item.id))));
  });

  it('validates beyond two thousand named assertion graphs without omitting a final failing assertion', async () => {
    const count = 2200;
    const facts = Array.from({ length: count }, (_, index) => fact(index,
      index === count - 1 ? { confidence: 1.5 } : {}));
    const graph = new RdfEvidenceGraph(snapshot(facts));
    const serialized = await graph.serialize();
    const result = await graph.validate();
    expect(result.conforms).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ category: 'extraction-gap',
      focus: factIri(facts[count - 1]!.id), path: `${CG}confidence` });
    // Exact serialization equality, with a compact failure instead of dumping the large dataset.
    expect((await graph.serialize()) === serialized).toBe(true);
  });
});
