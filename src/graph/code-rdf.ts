import { DataFactory, type Store, type NamedNode } from 'n3';
import { repositoryFileNode, type GraphFact, type SourceSpan } from '@weftlet/core';
import { CG, RDF, XSD } from './shacl-shapes.js';

const { namedNode: iri, literal } = DataFactory;

export function addCodeEvidence(dataset: Store, record: NamedNode, fact: GraphFact, nodeIri: (id: string) => string): void {
  const property = (subject: NamedNode, key: string, value: unknown) => {
    if (value === undefined) return;
    dataset.addQuad(subject, iri(CG + key), literal(String(value), iri(XSD + (typeof value === 'number' ? 'integer' : 'string'))));
  };
  for (const key of ['startColumn', 'endColumn', 'columnEncoding'] as const) property(record, key, fact.provenance[key]);
  const code = fact.codeOccurrence;
  if (code !== undefined) {
    dataset.addQuad(record, iri(RDF + 'type'), iri(CG + 'CodeOccurrence'));
    for (const [key, value] of Object.entries({ codeVersion: code.schemaVersion, codeRole: code.role, codeLocationKind: code.locationKind,
      codeNativeRoles: code.nativeRoles, codeEnclosure: code.enclosure })) property(record, key, value);
    if (code.enclosingSymbolId !== undefined) dataset.addQuad(record, iri(CG + 'enclosingSymbol'), iri(nodeIri(code.enclosingSymbolId)));
    if (code.declarationRange !== undefined) {
      const range = iri(record.value + ':declaration-range');
      dataset.addQuad(record, iri(CG + 'declarationRange'), range);
      dataset.addQuad(range, iri(RDF + 'type'), iri(CG + 'CodeRange'));
      for (const [key, value] of Object.entries(code.declarationRange)) property(range, key, value);
    }
  }
  for (const node of [fact.subject, fact.object]) {
    if (node.kind !== 'CodeSymbol' && node.codeSymbol === undefined) continue;
    const term = iri(nodeIri(node.id));
    dataset.addQuad(term, iri(RDF + 'type'), iri(CG + 'CodeSymbol'));
    const value = node.codeSymbol;
    if (value === undefined) continue; // The shape reports missing required metadata.
    for (const [key, item] of Object.entries({ codeVersion: value.schemaVersion, codeProvider: value.provider,
      codeRepository: value.repositoryId, nativeSymbol: value.nativeSymbol, codeIdentityScope: value.identityScope,
      codeDocument: value.documentPath, codeIndex: value.indexDigest, codeResolution: value.resolution })) property(term, key, item);
  }
}

export function invalidCodeRange(range: Pick<SourceSpan, 'startLine' | 'endLine' | 'startColumn' | 'endColumn' | 'columnEncoding'>): boolean {
  if (range.startColumn === undefined && range.endColumn === undefined && range.columnEncoding === undefined) return false;
  return !Number.isSafeInteger(range.startColumn) || !Number.isSafeInteger(range.endColumn) ||
    range.startColumn! < 1 || range.endColumn! < 1 || range.columnEncoding !== 'utf-16' ||
    range.endLine < range.startLine || (range.endLine === range.startLine && range.endColumn! < range.startColumn!);
}

export function codeEvidenceIssues(fact: GraphFact): readonly string[] {
  const code = fact.codeOccurrence;
  if (!code) return [];
  const issues: string[] = [];
  const file = repositoryFileNode(fact.provenance.path);
  if ((code.nativeRoles & 1) !== (code.role === 'definition' ? 1 : 0)) issues.push('Code role disagrees with native definition flag');
  if (code.role === 'definition' && (fact.object.id !== file.id || fact.object.kind !== file.kind)) {
    issues.push('Code definition must identify its canonical cited physical file');
  }
  if (code.role === 'reference') {
    if (code.declarationRange !== undefined) issues.push('A reference cannot declare a definition range');
    const sourceId = code.enclosure === 'native-range' ? code.enclosingSymbolId : file.id;
    if (fact.subject.id !== sourceId) issues.push('Reference source disagrees with lexical enclosure');
  }
  const zeroWidth = fact.provenance.startLine === fact.provenance.endLine && fact.provenance.startColumn === fact.provenance.endColumn;
  if (zeroWidth !== (code.locationKind === 'zero-width-anchor')) issues.push('Code location kind disagrees with source span');
  return issues;
}
