import { Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import { describe, expect, it } from 'vitest';
import type { GraphFact } from '@weftlet/core';
import { extractCodeOccurrences } from '../src/extraction/scip-occurrences.js';
import type { ScipIndex } from '../src/extraction/scip-runtime.js';
import { RdfEvidenceGraph } from '../src/graph/rdf.js';
import { SnapshotImpactQueryService } from '../src/graph/query.js';
import { evidenceShapes } from '../src/graph/shacl-shapes.js';
import { snapshot } from './fixtures/shacl.js';

const source = 'function work() {}\nwork();\n';
const extracted = extractCodeOccurrences({ documents: [{ relative_path: 'src/code.ts', occurrences: [
  { symbol: 'work', range: [0, 9, 13], symbol_roles: 1, enclosing_range: [0, 0, 18] },
  { symbol: 'work', range: [1, 0, 4], symbol_roles: 0 },
] }] } as unknown as ScipIndex, new Map([['src/code.ts', source]]), {
  repositoryRoot: '/unused', repositoryId: 'public/rdf', commitSha: 'a'.repeat(40), snapshotId: 'public',
  ref: 'HEAD', changedPaths: [], deletedPaths: [], renamedPaths: {},
}, 'public-index', { id: 'scip-symbol-extractor', version: '2.0.0' });
const definition = extracted.find(f => f.codeOccurrence!.role === 'definition')!;
const reference = extracted.find(f => f.codeOccurrence!.role === 'reference')!;
const change = (update: (fact: any) => void, base = reference): GraphFact => {
  const fact = structuredClone(base);
  update(fact);
  return fact;
};

const invalid = [
  ['missing symbol metadata', change(f => delete f.object.codeSymbol)],
  ['multiple symbol kinds', { ...reference, object: { ...reference.object, kind: 'Component' } }],
  ['invalid symbol scope', change(f => f.object.codeSymbol.identityScope = 'guessed')],
  ['missing local identity inputs', change(f => f.object.codeSymbol.identityScope = 'index-document')],
  ['missing occurrence metadata', change(f => f.codeOccurrence = {})],
  ['missing columns', change(f => delete f.provenance.startColumn)],
  ['invalid encoding', change(f => f.provenance.columnEncoding = 'utf-8')],
  ['missing enclosure target', change(f => f.codeOccurrence.enclosure = 'native-range')],
  ['invalid role', change(f => f.codeOccurrence.role = 'call')],
  ['invalid predicate', change(f => f.predicate = 'consumes')],
  ['negative native roles', change(f => f.codeOccurrence.nativeRoles = -1)],
  ['invalid resolution', change(f => f.object.codeSymbol.resolution = 'executed')],
] as const;

describe('typed code evidence validation', () => {
  it('bounds unresolved-target diagnostics without dropping their evidence', async () => {
    const facts = Array.from({ length: 125 }, (_, index) => ({ ...reference, id: `reference-${index}`,
      object: { ...reference.object, id: `external-${index}`, codeSymbol: { ...reference.object.codeSymbol!,
        nativeSymbol: `external-${index}`, resolution: 'no-indexed-definition' as const } } }));
    const saved = snapshot(facts);
    const query = new SnapshotImpactQueryService({ read: async () => saved, readHead: async () => saved,
      write: async () => {}, updateHead: async () => {} }, 'default');
    const pack = await query.scan({ changedFiles: ['src/code.ts'], maxFacts: 200 });
    expect(pack.facts).toHaveLength(125);
    expect(pack.exploration).toMatchObject({ unexpandedCodeTargetCount: 125,
      unexpandedCodeTargetsTruncated: true, truncated: false });
    expect(pack.exploration!.unexpandedCodeTargets).toHaveLength(100);
    expect(pack.markdown).toContain('Unresolved code targets left unexpanded: 125');
  });

  it('preserves typed metadata through RDF and exact record projection', async () => {
    const graph = new RdfEvidenceGraph(snapshot(extracted));
    expect(await graph.validate()).toEqual({ conforms: true, issues: [] });
    expect(await graph.facts()).toEqual(extracted);
    const named = new Store(new Parser({ format: 'N-Quads' }).parse(await graph.serialize()));
    expect((await new SHACLValidator(new Store(evidenceShapes)).validate(named)).conforms).toBe(true);
  });

  it.each(invalid)('rejects %s in both complete named RDF and union validation', async (_name, bad) => {
    const graph = new RdfEvidenceGraph(snapshot([bad as GraphFact]));
    const named = new Store(new Parser({ format: 'N-Quads' }).parse(await graph.serialize()));
    expect((await new SHACLValidator(new Store(evidenceShapes)).validate(named)).conforms).toBe(false);
    const result = await graph.validate();
    expect(result.conforms).toBe(false);
    expect(result.issues.every(issue => issue.category === 'extraction-gap')).toBe(true);
    expect(await graph.facts()).toEqual([bad]);
  });

  it.each([
    ['reversed columns', change(f => f.provenance.endColumn = 0)],
    ['mismatched definition flag', change(f => f.codeOccurrence.nativeRoles = 1)],
    ['wrong reference source', change(f => f.subject.id = 'component:file:wrong.ts')],
    ['reference declaration range', change(f => f.codeOccurrence.declarationRange = definition.codeOccurrence!.declarationRange)],
    ['wrong definition file', change(f => f.object.id = 'component:file:wrong.ts', definition)],
    ['reversed declaration range', change(f => f.codeOccurrence.declarationRange.startColumn = 30, definition)],
    ['incorrect anchor label', change(f => f.codeOccurrence.locationKind = 'zero-width-anchor')],
  ])('rejects cross-field inconsistency: %s', async (_name, bad) => {
    expect((await new RdfEvidenceGraph(snapshot([bad as GraphFact])).validate()).conforms).toBe(false);
  });
});
