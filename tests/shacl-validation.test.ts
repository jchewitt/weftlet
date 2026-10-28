import { Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import { describe, expect, it } from 'vitest';
import type { GraphSnapshot } from '@weftlet/core';
import { CG, factIri, nodeIri, RdfEvidenceGraph } from '../src/graph/rdf.js';
import { evidenceShapes } from '../src/graph/shacl-shapes.js';
import { stableJson } from '../src/infrastructure/util.js';
import { cases, fact, snapshot, subjectId, objectId } from './fixtures/shacl.js';
import type { GraphValidationProgress } from '../src/graph/validation-progress.js';

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
