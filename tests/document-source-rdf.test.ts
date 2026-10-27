import { DataFactory, Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import { describe, expect, it } from 'vitest';
import type { GraphFact, GraphSnapshot, SourceDocumentRole, SourceOwnership } from '@weftlet/core';
import { CG, factIri, nodeIri, RdfEvidenceGraph } from '../src/graph/rdf.js';
import { evidenceShapes, XSD } from '../src/graph/shacl-shapes.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';

const { literal, namedNode: iri } = DataFactory;
const SH = 'http://www.w3.org/ns/shacl#';
const metadataPredicates = ['sourceRole', 'ownershipStatus', 'ownerDocument', 'ownershipMapping', 'sourcePolicyDigest'];

function fact(id: string, overrides: Partial<GraphFact> = {}): GraphFact {
  return {
    id,
    subject: { id: 'document:docs/source.md', kind: 'Document', label: 'docs/source.md' },
    predicate: 'references',
    object: { id: 'document:docs/shared.md', kind: 'Document', label: 'docs/shared.md' },
    provenance: { path: 'docs/source.md', startLine: 2, endLine: 3,
      digest: sha256('Public cited source'), commitSha: '1'.repeat(40) },
    extractor: { id: 'public-document-rdf-fixture', version: '1' },
    confidence: 1, snapshotId: 'public-document-rdf', authority: 'inferred',
    sourceAuthority: 'declared', extractionReview: 'deterministic', ...overrides,
  };
}

function snapshot(facts: readonly GraphFact[]): GraphSnapshot {
  return {
    manifest: { schemaVersion: 1, repositoryId: 'public/document-rdf', ref: 'HEAD',
      commitSha: '1'.repeat(40), snapshotId: 'public-document-rdf', ontologyVersion: 'rdf-v1',
      extractorVersions: { fixture: '1' }, semanticModel: 'none', semanticPromptVersion: 'none',
      generatedAt: '2026-01-01T00:00:00.000Z', contentDigest: sha256(stableJson(facts)),
      semanticArtifactKeys: [], scipIndexDigest: 'public-fixture', rdfDigest: '' },
    facts, invariants: [], runtimeEvidence: [], unresolved: [],
  };
}

const resolved: SourceOwnership = {
  status: 'resolved', ownerDocuments: ['docs/owner.md'], mappingIds: ['feature-owner'],
};
const ownershipCases: readonly SourceOwnership[] = [
  resolved,
  { ...resolved, status: 'unavailable' },
  { ...resolved, status: 'unapproved' },
  { ...resolved, status: 'ineligible' },
  { status: 'ambiguous', ownerDocuments: ['docs/owner-a.md', 'docs/owner-b.md'], mappingIds: ['a', 'b'] },
  { status: 'missing', ownerDocuments: [], mappingIds: [] },
  { status: 'not-required', ownerDocuments: [], mappingIds: [] },
];

describe('document source metadata in the evidence RDF graph', () => {
  it('queries fact-scoped role, owners, policy and approval independently and roundtrips exact records', async () => {
    const facts = [
      fact('intent', { sourceRole: 'intent', sourceOwnership: resolved,
        sourcePolicyDigest: sha256('first classification policy') }),
      fact('validation', { sourceRole: 'validation', sourceOwnership: {
        status: 'ambiguous', ownerDocuments: ['docs/owner-z.md', 'docs/owner-a.md'],
        mappingIds: ['z-rule', 'a-rule'],
      }, sourcePolicyDigest: sha256('second classification policy') }),
    ];
    const graph = new RdfEvidenceGraph(snapshot(facts));
    const serialized = await graph.serialize();
    expect(await graph.facts()).toEqual(facts);
    expect((await graph.validate()).conforms).toBe(true);
    expect(await graph.select(`SELECT ?fact ?role ?status ?policy ?authority ?approval ?review ?record WHERE {
      ?fact <${CG}sourceRole> ?role; <${CG}ownershipStatus> ?status; <${CG}sourcePolicyDigest> ?policy;
        <${CG}authority> ?authority; <${CG}sourceAuthority> ?approval;
        <${CG}extractionReview> ?review; <${CG}record> ?record
    } ORDER BY ?fact`)).toEqual({ rows: facts.map(item => ({
      fact: factIri(item.id), role: item.sourceRole, status: item.sourceOwnership!.status,
      policy: item.sourcePolicyDigest, authority: 'inferred', approval: 'declared', review: 'deterministic',
      record: stableJson(item),
    })), truncated: false });
    for (const [predicate, field] of [['ownerDocument', 'ownerDocuments'], ['ownershipMapping', 'mappingIds']] as const) {
      const result = await graph.select(`SELECT ?fact ?value WHERE {
        ?fact <${CG}${predicate}> ?value
      } ORDER BY ?fact ?value`);
      expect(result).toEqual({ rows: facts.flatMap(item => [...item.sourceOwnership![field]].sort()
        .map(value => ({ fact: factIri(item.id), value }))), truncated: false });
    }
    const dataset = new Store(new Parser({ format: 'N-Quads' }).parse(serialized));
    for (const node of [facts[0]!.subject, facts[0]!.object]) {
      expect(dataset.getObjects(iri(nodeIri(node.id)), iri(CG + 'kind'), null).map(term => term.value))
        .toEqual(['Document']);
      for (const predicate of metadataPredicates) {
        expect(dataset.countQuads(iri(nodeIri(node.id)), iri(CG + predicate), null, null)).toBe(0);
      }
    }
    expect(await graph.serialize()).toBe(serialized);
  });

  it('keeps legacy facts unchanged and targets new shapes only by metadata predicates', async () => {
    const legacy = fact('legacy');
    const graph = new RdfEvidenceGraph(snapshot([legacy]));
    expect(await graph.facts()).toEqual([legacy]);
    expect(await graph.validate()).toEqual({ conforms: true, issues: [] });
    const dataset = new Store(new Parser({ format: 'N-Quads' }).parse(await graph.serialize()));
    for (const predicate of metadataPredicates) expect(dataset.countQuads(null, iri(CG + predicate), null, null)).toBe(0);
    const shapes = new Store(evidenceShapes);
    const targets: string[] = [];
    for (const name of ['SourceRoleShape', 'SourcePolicyShape', 'SourceOwnershipShape']) {
      expect(shapes.countQuads(iri(CG + name), iri(SH + 'targetClass'), null, null)).toBe(0);
      targets.push(...shapes.getObjects(iri(CG + name), iri(SH + 'targetSubjectsOf'), null).map(term => term.value));
    }
    expect(targets.sort()).toEqual(metadataPredicates.map(predicate => CG + predicate).sort());
  });

  it.each<SourceDocumentRole>(['intent', 'plan', 'validation', 'reference', 'unclassified'])(
    'accepts optional %s role without inventing ownership or approval', async sourceRole => {
      const value = fact(sourceRole, { sourceRole, sourceAuthority: 'inferred', extractionReview: 'unreviewed' });
      const graph = new RdfEvidenceGraph(snapshot([value]));
      expect(await graph.validate()).toEqual({ conforms: true, issues: [] });
      expect(await graph.facts()).toEqual([value]);
    },
  );

  it.each(ownershipCases)('accepts structurally consistent $status ownership without promoting authority', async sourceOwnership => {
    const value = fact(sourceOwnership.status, { sourceOwnership });
    const graph = new RdfEvidenceGraph(snapshot([value]));
    expect(await graph.validate()).toEqual({ conforms: true, issues: [] });
    expect(await graph.facts()).toEqual([value]);
    expect((await graph.select(`SELECT ?authority WHERE { ?fact <${CG}authority> ?authority }`)).rows)
      .toEqual([{ authority: 'inferred' }]);
  });

  it.each<SourceOwnership>([
    { ...resolved, ownerDocuments: [] },
    { ...resolved, ownerDocuments: ['docs/a.md', 'docs/b.md'] },
    { ...resolved, mappingIds: [] },
    { ...resolved, status: 'ambiguous' },
    { ...resolved, status: 'missing' },
    { status: 'not-required', ownerDocuments: [], mappingIds: ['unexpected-mapping'] },
  ])('rejects inconsistent ownership records: %j', async sourceOwnership => {
    const graph = new RdfEvidenceGraph(snapshot([fact('invalid-ownership', { sourceOwnership })]));
    const report = await graph.validate();
    expect(report.conforms).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'extraction-gap', focus: factIri('invalid-ownership') }),
    ]));
  });

  it.each([
    { predicate: 'sourceRole', values: [literal('unknown')], name: 'role enum' },
    { predicate: 'sourceRole', values: [literal('intent'), literal('plan')], name: 'role cardinality' },
    { predicate: 'sourceRole', values: [iri('urn:intent')], name: 'role datatype' },
    { predicate: 'ownershipStatus', values: [literal('unknown')], name: 'ownership enum' },
    { predicate: 'ownershipStatus', values: [], name: 'missing status on owner metadata' },
    { predicate: 'ownershipStatus', values: [literal('resolved'), literal('unapproved')], name: 'ownership cardinality' },
    { predicate: 'ownershipStatus', values: [iri('urn:resolved')], name: 'ownership datatype' },
    { predicate: 'ownerDocument', values: [iri('urn:document')], name: 'owner datatype' },
    { predicate: 'ownerDocument', values: [literal('')], name: 'empty owner' },
    { predicate: 'ownershipMapping', values: [literal('1', iri(XSD + 'integer'))], name: 'mapping datatype' },
    { predicate: 'ownershipMapping', values: [literal('')], name: 'empty mapping' },
    { predicate: 'sourcePolicyDigest', values: [literal('')], name: 'empty policy digest' },
    { predicate: 'sourcePolicyDigest', values: [literal('1', iri(XSD + 'integer'))], name: 'policy datatype' },
    { predicate: 'sourcePolicyDigest', values: [literal('a'), literal('b')], name: 'policy cardinality' },
  ])('validates explicit RDF metadata constraints: $name', async ({ predicate, values }) => {
    const graph = new RdfEvidenceGraph(snapshot([fact('invalid-rdf', {
      sourceRole: 'intent', sourceOwnership: resolved, sourcePolicyDigest: sha256('public policy'),
    })]));
    const dataset = new Store(new Parser({ format: 'N-Quads' }).parse(await graph.serialize()));
    const record = iri(factIri('invalid-rdf'));
    const property = iri(CG + predicate);
    dataset.removeQuads(dataset.getQuads(record, property, null, null));
    for (const value of values) dataset.addQuad(record, property, value);
    const report = await new SHACLValidator(new Store(evidenceShapes)).validate(dataset);
    expect(report.conforms).toBe(false);
    expect(report.results.some(result => result.focusNode?.value === record.value)).toBe(true);
  });
});
