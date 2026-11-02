import { QueryEngine } from '@comunica/query-sparql';
import { constants } from 'node:buffer';
import { pipeline } from 'node:stream/promises';
import type { Writable } from 'node:stream';
import { Readable } from 'node:stream';
import { Writer, type Term } from 'n3';
import type { GraphFact, GraphSnapshot } from "@weftlet/core";
import { createRequire } from 'node:module';
import { CG } from './shacl-shapes.js';
import { measureValidationPhase, type GraphValidationProgress } from './validation-progress.js';
import { bindingEvidenceIssues } from './binding-rdf.js';
import { callEvidenceIssues } from './call-rdf.js';
import { obligationEvidenceIssues } from './obligation-rdf.js';
import { codeEvidenceIssues, invalidCodeRange } from './code-rdf.js';

export { CG } from './shacl-shapes.js';
import { factIri } from './rdf-records.js';
import { RdfPartitions } from './rdf-partitions.js';
import { validatePartitions } from './partitioned-shacl.js';
import { projectRdfFacts } from './rdf-projection.js';
export { factIri, nodeIri } from './rdf-records.js';
const engine = new QueryEngine();
const SparqlParser = (createRequire(import.meta.url)('sparqljs') as {
  Parser: new () => { parse(query: string): { type: string; queryType?: string; from?: unknown } };
}).Parser;

/** Lossless RDF dataset: one named graph per cited assertion, with provenance in the default graph. */
export class RdfEvidenceGraph {
  private indexed?: RdfPartitions;
  constructor(readonly snapshot: GraphSnapshot) {}

  async validate(options: { readonly onProgress?: (event: GraphValidationProgress) => void } = {}) {
    const counts = { factCount: this.snapshot.facts.length };
    const { partitions, types } = await measureValidationPhase('build-validation-union', counts, options.onProgress, () => {
      const started = performance.now();
      const partitions = new RdfPartitions(this.snapshot);
      return { partitions, types: partitions.types(completed => {
        if (completed % 10 === 0) options.onProgress?.({ phase: 'build-validation-union', status: 'progress',
          elapsedMs: Math.round(performance.now() - started), ...counts, completed, total: partitions.count });
      }) };
    });
    const started = performance.now();
    const report = await measureValidationPhase('validate-shacl', counts, options.onProgress,
      () => validatePartitions(partitions, types, completed => {
        if (completed % 10 === 0) options.onProgress?.({ phase: 'validate-shacl', status: 'progress',
          elapsedMs: Math.round(performance.now() - started), ...counts, completed, total: partitions.count });
      }));
    const issues = report.issues;
    const byId = new Map(this.snapshot.facts.map(fact => [fact.id, fact]));
    for (const fact of this.snapshot.facts) {
      for (const message of obligationEvidenceIssues(fact, this.snapshot.manifest.repositoryId)) issues.push({ category: 'extraction-gap',
        focus: factIri(fact.id), path: CG + 'obligationRole', message });
      for (const message of callEvidenceIssues(fact, byId)) issues.push({ category: 'extraction-gap',
        focus: factIri(fact.id), path: CG + 'callTarget', message });
      for (const message of bindingEvidenceIssues(fact, byId)) issues.push({ category: 'extraction-gap',
        focus: factIri(fact.id), path: CG + 'bindingDefinition', message });
      for (const message of codeEvidenceIssues(fact)) issues.push({ category: 'extraction-gap',
        focus: factIri(fact.id), path: CG + 'codeRole', message });
      if (invalidCodeRange(fact.provenance) ||
          (fact.codeOccurrence?.declarationRange && invalidCodeRange(fact.codeOccurrence.declarationRange))) {
        issues.push({ category: 'extraction-gap', focus: factIri(fact.id), path: CG + 'startColumn',
          message: 'Invalid UTF-16 source range' });
      }
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
    const indexed = this.indexed ??= new RdfPartitions(this.snapshot);
    const source = {
      match: (s?: Term | null, p?: Term | null, o?: Term | null, g?: Term | null) => Readable.from(indexed.match(s, p, o, g)),
      countQuads: (s?: Term | null, p?: Term | null, o?: Term | null, g?: Term | null) => indexed.countMatches(s, p, o, g),
    };
    const stream = await engine.queryBindings(sparql, { sources: [{ type: 'rdfjs', value: source }], unionDefaultGraph: true });
    const rows: Record<string, string>[] = [];
    let truncated = false;
    for await (const binding of stream) {
      if (rows.length === maxRows) { truncated = true; stream.destroy(); break; }
      rows.push(Object.fromEntries([...binding].map(([key, value]) => [key.value, value.value])));
    }
    return { rows, truncated };
  }

  /** Lossless optimized projection, checked for equivalence with the public SPARQL path. */
  async facts(): Promise<readonly GraphFact[]> {
    return projectRdfFacts(this.snapshot.facts);
  }

  /** Complete N-Quads in bounded groups; RDF triple order is not a snapshot identity. */
  *serializeChunks(): IterableIterator<string> {
    const writer = new Writer({ format: 'N-Quads' });
    let buffer = '';
    for (const batch of new RdfPartitions(this.snapshot).named()) for (const quad of batch) {
      buffer += writer.quadToString(quad.subject, quad.predicate, quad.object, quad.graph);
      if (buffer.length >= 64 * 1024) { yield buffer; buffer = ''; }
    }
    if (buffer) yield buffer;
  }

  /** Export large datasets with backpressure, without a whole-dataset string/quad array. */
  async serializeTo(destination: Writable): Promise<void> {
    await pipeline(this.serializeChunks(), destination);
  }

  /** Compatibility convenience for small exports; use serializeTo for large graphs. */
  async serialize(): Promise<string> {
    const chunks: string[] = [];
    let length = 0;
    for (const chunk of this.serializeChunks()) {
      length += chunk.length;
      if (length > constants.MAX_STRING_LENGTH) throw new Error('RDF exceeds the JavaScript string limit; use serializeTo() or serializeChunks()');
      chunks.push(chunk);
    }
    return chunks.join('');
  }
}
