import { DataFactory, Store } from 'n3';
import type { GraphFact, GraphSnapshot, GraphNode } from '@weftlet/core';
import { contextPackEvidenceAuthority } from './authority.js';
import { stableJson } from '../infrastructure/util.js';
import { CG, RDF, XSD } from './shacl-shapes.js';
import { addBindingEvidence } from './binding-rdf.js';
import { addCallEvidence } from './call-rdf.js';
import { addObligationEvidence } from './obligation-rdf.js';
import { addCodeEvidence, addCodeNodeEvidence } from './code-rdf.js';
const { namedNode: iri, literal } = DataFactory;
export const nodeIri = (id: string) => `urn:context-graph:node:${encodeURIComponent(id)}`;
export const factIri = (id: string) => `urn:context-graph:fact:${encodeURIComponent(id)}`;

export function addFactRecord(dataset: Store, fact: GraphFact, ordinal: number): void {
  const record = iri(factIri(fact.id));
  const subject = iri(nodeIri(fact.subject.id));
  const object = iri(nodeIri(fact.object.id));
  const predicate = iri(CG + fact.predicate);

  dataset.addQuad(record, iri(RDF + 'type'), iri(RDF + 'Statement'));
  dataset.addQuad(record, iri(CG + 'ordinal'), literal(String(ordinal), iri(XSD + 'integer')));
  for (const [p, value] of [['subject', subject], ['predicate', predicate], ['object', object]] as const) {
    dataset.addQuad(record, iri(RDF + p), value);
  }
  for (const [p, value] of Object.entries({
    authority: contextPackEvidenceAuthority(fact), path: fact.provenance.path,
    commit: fact.provenance.commitSha, sourceDigest: fact.provenance.digest,
    extractor: `${fact.extractor.id}@${fact.extractor.version}`,
    snapshotId: fact.snapshotId, record: stableJson(fact),
    ...(fact.sourceAuthority ? { sourceAuthority: fact.sourceAuthority } : {}),
    ...(fact.extractionReview ? { extractionReview: fact.extractionReview } : {}),
    ...(fact.sourceRole !== undefined ? { sourceRole: fact.sourceRole } : {}),
    ...(fact.sourcePolicyDigest !== undefined ? { sourcePolicyDigest: fact.sourcePolicyDigest } : {}),
  })) dataset.addQuad(record, iri(CG + p), literal(value));
  if (fact.sourceOwnership !== undefined) {
    dataset.addQuad(record, iri(CG + 'ownershipStatus'), literal(fact.sourceOwnership.status));
    for (const ownerDocument of fact.sourceOwnership.ownerDocuments) {
      dataset.addQuad(record, iri(CG + 'ownerDocument'), literal(ownerDocument));
    }
    for (const mappingId of fact.sourceOwnership.mappingIds) {
      dataset.addQuad(record, iri(CG + 'ownershipMapping'), literal(mappingId));
    }
  }
  for (const [p, value] of [['startLine', fact.provenance.startLine], ['endLine', fact.provenance.endLine]] as const) {
    dataset.addQuad(record, iri(CG + p), literal(String(value), iri(XSD + 'integer')));
  }
  dataset.addQuad(record, iri(CG + 'confidence'), literal(String(fact.confidence), iri(XSD + 'decimal')));
  addCodeEvidence(dataset, record, fact, nodeIri, false);
  addBindingEvidence(dataset, record, fact, factIri);
  addCallEvidence(dataset, record, fact, factIri);
  addObligationEvidence(dataset, record, fact);
}

export function addNodeRdf(dataset: Store, node: GraphNode): void {
  const term = iri(nodeIri(node.id));
  dataset.addQuad(term, iri(RDF + 'type'), iri(CG + 'Node'));
  dataset.addQuad(term, iri(CG + 'identifier'), literal(node.id));
  dataset.addQuad(term, iri(CG + 'kind'), literal(node.kind));
  dataset.addQuad(term, iri(CG + 'label'), literal(node.label));
  addCodeNodeEvidence(dataset, node, nodeIri);
}

export function addAttributes(dataset: Store, node: GraphNode, graph = DataFactory.defaultGraph() as ReturnType<typeof iri> | ReturnType<typeof DataFactory.defaultGraph>): void {
  for (const [key, value] of Object.entries(node.attributes ?? {})) {
    const datatype = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'decimal' : 'string';
    dataset.addQuad(iri(nodeIri(node.id)), iri(`${CG}attribute/${encodeURIComponent(key)}`), literal(String(value), iri(XSD + datatype)), graph);
  }
}

export function addFactEdges(dataset: Store, fact: GraphFact): void {
  const record = iri(factIri(fact.id));
  dataset.addQuad(iri(nodeIri(fact.subject.id)), iri(CG + fact.predicate), iri(nodeIri(fact.object.id)), record);
  for (const node of [fact.subject, fact.object]) addAttributes(dataset, node, record);
}

export function addManifest(dataset: Store, snapshot: GraphSnapshot): void {
  dataset.addQuad(iri('urn:context-graph:snapshot'), iri(CG + 'manifest'),
    literal(stableJson(snapshot.manifest)));
  for (const scope of snapshot.manifest.scope ?? []) {
    dataset.addQuad(iri('urn:context-graph:snapshot'), iri(CG + 'scope'), literal(scope));
  }
  if (snapshot.manifest.configurationDigest) {
    dataset.addQuad(iri('urn:context-graph:snapshot'), iri(CG + 'configurationDigest'),
      literal(snapshot.manifest.configurationDigest));
  }
}

export function evidenceDataset(snapshot: GraphSnapshot): Store {
  const dataset = new Store();
  for (const [ordinal, fact] of snapshot.facts.entries()) {
    addFactRecord(dataset, fact, ordinal); addFactEdges(dataset, fact);
    for (const node of [fact.subject, fact.object]) addNodeRdf(dataset, node);
  }
  addManifest(dataset, snapshot);
  return dataset;
}
