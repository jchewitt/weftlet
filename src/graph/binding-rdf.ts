import { DataFactory, type Store, type NamedNode } from 'n3';
import type { BindingEvidence, BindingSubjectEvidence, GraphFact, SourceSpan } from '@weftlet/core';
import { stableJson } from '../infrastructure/util.js';
import { CG, RDF, XSD } from './shacl-shapes.js';
import { invalidCodeRange } from './code-rdf.js';

const { namedNode: iri, literal } = DataFactory;

export function addBindingEvidence(dataset: Store, record: NamedNode, fact: GraphFact, factIri: (id: string) => string): void {
  const binding = fact.codeBinding;
  if (!binding) return;
  const prop = (node: NamedNode, key: string, value: unknown) => {
    if (value !== undefined) dataset.addQuad(node, iri(CG + key), literal(String(value), iri(XSD + (typeof value === 'number' ? 'integer' : 'string'))));
  };
  dataset.addQuad(record, iri(RDF + 'type'), iri(CG + 'DocumentCodeBinding'));
  prop(record, 'bindingVersion', binding.schemaVersion); prop(record, 'bindingMethod', binding.method);
  for (const [key, value] of Object.entries(binding.selector ?? {})) prop(record, `bindingSelector/${key}`, value);
  const citations = (key: string, spans: readonly SourceSpan[], proofs?: readonly BindingEvidence[]) => spans.forEach((span, index) => {
    const term = iri(`${record.value}:${key}:${index}`);
    dataset.addQuad(record, iri(CG + key), term);
    dataset.addQuad(term, iri(RDF + 'type'), iri(CG + 'BindingCitation'));
    for (const [name, value] of Object.entries(span)) prop(term, name, value);
    if (proofs) dataset.addQuad(term, iri(CG + 'bindingFact'), iri(factIri(proofs[index]!.factId)));
  });
  citations('bindingDocument', binding.documentCitations ?? []);
  citations('bindingSelection', (binding.selectedOccurrences ?? []).map(item => item.provenance), binding.selectedOccurrences);
  citations('bindingDefinition', (binding.definitions ?? []).map(item => item.provenance), binding.definitions);
  citations('bindingSubject', (binding.subjectEvidence ?? []).map(item => item.provenance), binding.subjectEvidence);
}

type FactsById = ReadonlyMap<string, GraphFact>;

function proofIssues(proof: BindingEvidence, byId: FactsById): readonly string[] {
  const issues: string[] = [], original = byId.get(proof.factId);
  if (!original || stableJson(original.provenance) !== stableJson(proof.provenance)) issues.push('Binding proof is absent or has different provenance');
  if (invalidCodeRange(proof.provenance) || proof.provenance.endLine < proof.provenance.startLine) issues.push('Invalid binding proof range');
  return issues;
}

function selectionIssues(proof: BindingEvidence, fact: GraphFact, byId: FactsById): readonly string[] {
  const issues = [...proofIssues(proof, byId)], original = byId.get(proof.factId);
  const selector = fact.codeBinding!.selector;
  if (!original?.codeOccurrence) return [...issues, 'Binding selection must cite an indexed occurrence'];
  const target = original.codeOccurrence.role === 'definition' ? original.subject : original.object;
  if (target.id !== fact.object.id || proof.provenance.path !== selector?.path) issues.push('Binding selection does not identify the target symbol in its selected file');
  if (selector?.line !== undefined && (selector.line !== proof.provenance.startLine || selector.column !== proof.provenance.startColumn)) issues.push('Binding selected occurrence differs from its exact selector');
  if (selector?.line === undefined && original.codeOccurrence.role !== 'definition') issues.push('A name selector requires a definition');
  if (proof.provenance.commitSha !== fact.provenance.commitSha) issues.push('Binding selection uses another revision');
  return issues;
}

function definitionIssues(proof: BindingEvidence, fact: GraphFact, byId: FactsById): readonly string[] {
  const issues = [...proofIssues(proof, byId)], original = byId.get(proof.factId);
  if (original?.codeOccurrence?.role !== 'definition' || original.subject.id !== fact.object.id) issues.push('Binding definition does not define its target symbol');
  if (proof.provenance.commitSha !== fact.provenance.commitSha) issues.push('Binding definition uses another revision');
  return issues;
}

function subjectIssues(proof: BindingSubjectEvidence, fact: GraphFact, byId: FactsById): readonly string[] {
  const issues = [...proofIssues(proof, byId)], original = byId.get(proof.factId);
  if (!original || ![original.subject, original.object].some(node => node.id === fact.subject.id) ||
      original.authority !== proof.authority || original.sourceAuthority !== proof.sourceAuthority || original.extractionReview !== proof.extractionReview) {
    issues.push('Binding subject evidence or its authority was changed');
  }
  return issues;
}

function documentIssues(fact: GraphFact): readonly string[] {
  const documents = fact.codeBinding!.documentCitations ?? [];
  if (!documents.some(span => stableJson(span) === stableJson(fact.provenance)) || documents.some(span =>
    span.path !== fact.provenance.path || span.digest !== fact.provenance.digest || span.commitSha !== fact.provenance.commitSha ||
    span.endLine < span.startLine || invalidCodeRange(span))) return ['Binding document citations do not match their source'];
  return [];
}

function mappingIssues(fact: GraphFact): readonly string[] {
  const binding = fact.codeBinding!, issues: string[] = [];
  if (fact.predicate !== 'references' && !(binding.subjectEvidence?.length)) issues.push('Business mapping requires cited subject evidence');
  if (fact.predicate !== 'references' && !['Capability', 'Workflow', 'Contract', 'Invariant'].includes(fact.subject.kind)) issues.push('Business mapping requires a business subject');
  if (fact.authority === 'draft' && fact.sourceAuthority !== 'draft') issues.push('Draft bindings require draft source authority');
  if (fact.sourceRole === 'validation' && fact.predicate === 'implementedBy') issues.push('Validation evidence cannot establish an implementation mapping');
  if (binding.subjectEvidence?.some(proof => proof.extractionReview === 'unreviewed') && fact.extractionReview !== 'unreviewed') issues.push('Binding cannot approve unreviewed subject evidence');
  return issues;
}

/** Supplements shape validation by comparing proofs with the actual same-snapshot assertions. */
export function bindingEvidenceIssues(fact: GraphFact, byId: FactsById): readonly string[] {
  const binding = fact.codeBinding;
  if (!binding) return [];
  const issues = [...documentIssues(fact), ...mappingIssues(fact)], selector = binding.selector;
  const positive = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
  if ((selector?.line !== undefined || selector?.column !== undefined) && (!positive(selector.line) || !positive(selector.column))) {
    issues.push('Exact occurrence selectors require positive line and column');
  }
  return [...issues,
    ...(binding.selectedOccurrences ?? []).flatMap(proof => selectionIssues(proof, fact, byId)),
    ...(binding.definitions ?? []).flatMap(proof => definitionIssues(proof, fact, byId)),
    ...(binding.subjectEvidence ?? []).flatMap(proof => subjectIssues(proof, fact, byId)),
  ];
}
