import { QueryEngine } from '@comunica/query-sparql';
import { DataFactory, Store, Writer } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import type { GraphFact, GraphSnapshot } from "@weftlet/core";
import { contextPackEvidenceAuthority } from "./authority.js";
import { stableJson } from "../infrastructure/util.js";
import { createRequire } from 'node:module';
import { CG, RDF, XSD, evidenceShapes } from './shacl-shapes.js';
import { measureValidationPhase, type GraphValidationProgress } from './validation-progress.js';

const { namedNode: iri, literal } = DataFactory;
export { CG } from './shacl-shapes.js';
export const nodeIri = (id: string) => `urn:context-graph:node:${encodeURIComponent(id)}`;
export const factIri = (id: string) => `urn:context-graph:fact:${encodeURIComponent(id)}`;
const engine = new QueryEngine();
const SparqlParser = (createRequire(import.meta.url)('sparqljs') as {
  Parser: new () => { parse(query: string): { type: string; queryType?: string; from?: unknown } };
}).Parser;

/** Lossless RDF dataset: one named graph per cited assertion, with provenance in the default graph. */
export class RdfEvidenceGraph {
  private readonly dataset: Store = new Store();

  constructor(readonly snapshot: GraphSnapshot) {
    for (const [ordinal, fact] of snapshot.facts.entries()) {
      const record = iri(factIri(fact.id));
      const subject = iri(nodeIri(fact.subject.id));
      const object = iri(nodeIri(fact.object.id));
      const predicate = iri(CG + fact.predicate);
      this.dataset.addQuad(subject, predicate, object, record);
      this.dataset.addQuad(record, iri(RDF + 'type'), iri(RDF + 'Statement'));
      this.dataset.addQuad(record, iri(CG + 'ordinal'), literal(String(ordinal), iri(XSD + 'integer')));
      for (const [p, value] of [['subject', subject], ['predicate', predicate], ['object', object]] as const) {
        this.dataset.addQuad(record, iri(RDF + p), value);
      }
      for (const [p, value] of Object.entries({
        authority: contextPackEvidenceAuthority(fact), path: fact.provenance.path,
        commit: fact.provenance.commitSha, sourceDigest: fact.provenance.digest,
        extractor: `${fact.extractor.id}@${fact.extractor.version}`,
        snapshotId: fact.snapshotId, record: stableJson(fact),
        ...(fact.sourceAuthority ? { sourceAuthority: fact.sourceAuthority } : {}),
        ...(fact.extractionReview ? { extractionReview: fact.extractionReview } : {}),
      })) this.dataset.addQuad(record, iri(CG + p), literal(value));
      for (const [p, value] of [['startLine', fact.provenance.startLine], ['endLine', fact.provenance.endLine]] as const) {
        this.dataset.addQuad(record, iri(CG + p), literal(String(value), iri(XSD + 'integer')));
      }
      this.dataset.addQuad(record, iri(CG + 'confidence'), literal(String(fact.confidence), iri(XSD + 'decimal')));
      for (const node of [fact.subject, fact.object]) {
        const term = iri(nodeIri(node.id));
        this.dataset.addQuad(term, iri(RDF + 'type'), iri(CG + 'Node'));
        this.dataset.addQuad(term, iri(CG + 'identifier'), literal(node.id));
        this.dataset.addQuad(term, iri(CG + 'kind'), literal(node.kind));
        this.dataset.addQuad(term, iri(CG + 'label'), literal(node.label));
        for (const [key, value] of Object.entries(node.attributes ?? {})) {
          const datatype = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'decimal' : 'string';
          this.dataset.addQuad(term, iri(`${CG}attribute/${encodeURIComponent(key)}`),
            literal(String(value), iri(XSD + datatype)), record);
        }
      }
    }
    this.dataset.addQuad(iri('urn:context-graph:snapshot'), iri(CG + 'manifest'),
      literal(stableJson(snapshot.manifest)));
    for (const scope of snapshot.manifest.scope ?? []) {
      this.dataset.addQuad(iri('urn:context-graph:snapshot'), iri(CG + 'scope'), literal(scope));
    }
    if (snapshot.manifest.configurationDigest) {
      this.dataset.addQuad(iri('urn:context-graph:snapshot'), iri(CG + 'configurationDigest'),
        literal(snapshot.manifest.configurationDigest));
    }
  }

  async validate(options: { readonly onProgress?: (event: GraphValidationProgress) => void } = {}) {
    // These graph-independent shapes already read the dataset as a union. Index
    // that union once so every property lookup avoids scanning one graph per fact.
    // Keep every triple; the original named dataset retains assertion provenance
    // and remains the source for queries and serialization.
    const counts = { factCount: this.snapshot.facts.length };
    const validationGraph = await measureValidationPhase('build-validation-union', counts, options.onProgress, () => {
      const union = new Store();
      for (const { subject, predicate, object } of this.dataset) union.addQuad(subject, predicate, object);
      return union;
    });
    const report = await measureValidationPhase('validate-shacl', counts, options.onProgress,
      () => new SHACLValidator(new Store(evidenceShapes)).validate(validationGraph));
    const issues = report.results.map((result) => ({
      category: 'extraction-gap' as const,
      focus: result.focusNode?.value,
      path: result.path?.value,
      message: result.message.map((message) => message.value).join('; '),
    }));
    for (const fact of this.snapshot.facts) {
      if (fact.provenance.endLine < fact.provenance.startLine) {
        issues.push({ category: 'extraction-gap', focus: factIri(fact.id), path: CG + 'endLine',
          message: 'Citation ends before it starts' });
      }
    }
    return { conforms: report.conforms && issues.length === 0, issues };
  }

  async select(sparql: string, maxRows = 1000) {
    if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 100_000) throw new Error('Invalid SPARQL row bound');
    const ast = new SparqlParser().parse(sparql);
    const hasService = (value: unknown): boolean => {
      if (!value || typeof value !== 'object') return false;
      if ((value as { type?: string }).type === 'service') return true;
      return Object.values(value).some(hasService);
    };
    if (ast.type !== 'query' || ast.queryType !== 'SELECT' || ast.from || hasService(ast)) {
      throw new Error('Only local read queries are supported; remote datasets and updates are disabled');
    }
    const stream = await engine.queryBindings(sparql, { sources: [this.dataset], unionDefaultGraph: true });
    const rows: Record<string, string>[] = [];
    let truncated = false;
    for await (const binding of stream) {
      if (rows.length === maxRows) { truncated = true; stream.destroy(); break; }
      rows.push(Object.fromEntries([...binding].map(([key, value]) => [key.value, value.value])));
    }
    return { rows, truncated };
  }

  /** The traversal projection is read through SPARQL, not a separate fact source. */
  async facts(): Promise<readonly GraphFact[]> {
    const result = await this.select(`SELECT ?record WHERE {
      ?fact <${CG}record> ?record; <${CG}ordinal> ?ordinal
    } ORDER BY ?ordinal`, 100_000);
    if (result.truncated) throw new Error('Graph exceeds the 100000-fact projection bound');
    return result.rows.map((row) => JSON.parse(row.record!) as GraphFact);
  }

  serialize(): Promise<string> {
    const writer = new Writer({ format: 'N-Quads' });
    writer.addQuads(this.dataset.getQuads(null, null, null, null));
    return new Promise((resolve, reject) => writer.end((error, text) => error ? reject(error) : resolve(text)));
  }
}
