import { rm } from 'node:fs/promises';
import { DataFactory, Parser, Store, Writer } from 'n3';
import { expect, it } from 'vitest';
import { RdfEvidenceGraph, CG } from '../src/graph/rdf.js';
import { RdfPartitions } from '../src/graph/rdf-partitions.js';
import { assertPartitionLocalShapes, validatePartitions } from '../src/graph/partitioned-shacl.js';
import { evidenceShapes } from '../src/graph/shacl-shapes.js';
import { ReleasedRdfEvidenceGraph } from './fixtures/rdf-070-reference.js';
import { cases, fact, snapshot } from './fixtures/shacl.js';
import { largeTypeScriptProject } from './fixtures/large-typescript-project.js';
import { stableJson } from '../src/infrastructure/util.js';
import type { GraphSnapshot } from '@weftlet/core';
import { sha256, stableJsonDigest } from '@weftlet/core';

const normalized = (issues: readonly unknown[]) => issues.map(stableJson).sort();
const terms = (store: Store) => {
  const writer = new Writer({ format: 'N-Quads' });
  return [...store].map(q => writer.quadToString(q.subject, q.predicate, q.object, q.graph)).sort();
};

it.each(cases)('matches the released encoder and strict SHACL across single-record partitions: $name', async ({ facts }) => {
  const value = snapshot(facts), reference = new ReleasedRdfEvidenceGraph(value);
  const original = new Store(new Parser({ format: 'N-Quads' }).parse(await reference.serialize()));
  const partitions = new RdfPartitions(value, 1), named = new Store(), union = new Store(), expectedUnion = new Store();
  for (const batch of partitions.named()) named.addQuads([...batch]);
  for (const batch of partitions.validation()) union.addQuads([...batch]);
  for (const q of original) expectedUnion.addQuad(q.subject, q.predicate, q.object);
  expect(terms(named)).toEqual(terms(original));
  expect(terms(union)).toEqual(terms(expectedUnion));
  const actual = await new RdfEvidenceGraph(value).validate(), old = await reference.validate();
  expect(actual.conforms).toBe(old.conforms);
  expect(normalized(actual.issues)).toEqual(normalized(old.issues));
  const streamed = await new RdfEvidenceGraph(value).facts();
  expect(normalized(streamed)).toEqual(normalized(await reference.facts()));
  for (const query of [`SELECT (COUNT(*) AS ?count) WHERE { ?s ?p ?o }`,
    `SELECT (COUNT(*) AS ?count) WHERE { GRAPH ?g { ?s ?p ?o } }`,
    `SELECT (COUNT(*) AS ?count) WHERE { ?s <${CG}record> ?o }`]) {
    expect(await new RdfEvidenceGraph(value).select(query)).toEqual(await reference.select(query));
  }
});

it('retains real code/proof metadata and cross-partition class checks, including corruption in a shared symbol', async () => {
  const f = await largeTypeScriptProject(2, 2);
  try {
    const first = (await f.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).snapshot;
    // Actual SCIP/prose records retain the legacy canonical hash, not only synthetic values.
    expect(stableJsonDigest(first.facts)).toBe(sha256(stableJson(first.facts)));
    const call = first.facts.find(fact => fact.codeCall)!;
    const definitionId = call.codeCall!.targetDefinitions[0]!.factId;
    const invalid: GraphSnapshot[] = [
      { ...first, facts: first.facts.filter(fact => fact.id !== definitionId) },
      { ...first, facts: [...first.facts, { ...call, id: 'late-symbol-conflict', object: { ...call.object,
        codeSymbol: { ...call.object.codeSymbol!, provider: 'conflicting-provider' } } }] },
    ];
    for (const value of [first, ...invalid]) {
      const reference = new ReleasedRdfEvidenceGraph(value), current = new RdfEvidenceGraph(value);
      const original = new Store(new Parser({ format: 'N-Quads' }).parse(await reference.serialize()));
      expect(terms(new Store(new Parser({ format: 'N-Quads' }).parse(await current.serialize())))).toEqual(terms(original));
      // Force references and their definitions into different complete subject groups.
      const partitions = new RdfPartitions(value, 1);
      const result = await validatePartitions(partitions, partitions.types());
      expect(result.conforms).toBe(value === first);
      const actual = await current.validate(), old = await reference.validate();
      expect(actual.conforms).toBe(old.conforms);
      expect(normalized(actual.issues)).toEqual(normalized(old.issues));
      expect(await current.facts()).toEqual(await reference.facts());
      const rows = await current.select(`SELECT ?record WHERE { ?fact <${CG}record> ?record; <${CG}ordinal> ?ordinal } ORDER BY ?ordinal`, 1000);
      expect(rows.truncated).toBe(false);
      expect(rows.rows.map(row => JSON.parse(row.record!))).toEqual(await current.facts());
    }
  } finally { await rm(f.root, { recursive: true, force: true }); }
}, 90_000);

it('fails closed when shapes add traversal beyond the reviewed partition-local fragment', () => {
  expect(() => assertPartitionLocalShapes(evidenceShapes)).not.toThrow();
  const { namedNode: iri, quad, blankNode } = DataFactory;
  for (const added of [quad(iri('urn:shape'), iri('http://www.w3.org/ns/shacl#node'), iri('urn:nested')),
    quad(blankNode(), iri('http://www.w3.org/ns/shacl#path'), blankNode()),
    quad(iri('urn:shape'), iri('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), iri('http://www.w3.org/2000/01/rdf-schema#Class'))]) {
    expect(() => assertPartitionLocalShapes([...evidenceShapes, added])).toThrow(/locality/);
  }
  for (const predicate of ['property', 'or']) {
    const valueShape = blankNode();
    expect(() => assertPartitionLocalShapes([...evidenceShapes,
      quad(valueShape, iri('http://www.w3.org/ns/shacl#path'), iri('urn:link')),
      quad(valueShape, iri(`http://www.w3.org/ns/shacl#${predicate}`), blankNode())])).toThrow(/locality/);
  }
});

it('returns every record beyond the old 100000-fact ceiling, including the last test fact', async () => {
  const value = snapshot([]), seed = fact(0);
  const facts = Array.from({ length: 100_001 }, (_, index) => ({ ...seed, id: `record-${index}` }));
  const result = await new RdfEvidenceGraph({ ...value, facts }).facts();
  expect(result).toHaveLength(facts.length);
  expect(result[0]).toEqual(facts[0]);
  expect(result.at(-1)).toEqual(facts.at(-1));
}, 60_000);
