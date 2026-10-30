import { DataFactory, type Store, type NamedNode } from 'n3';
import { repositoryFileNode, type BindingEvidence, type GraphFact } from '@weftlet/core';
import { CG, RDF, XSD } from './shacl-shapes.js';
import { stableJson } from '../infrastructure/util.js';
import { invalidCodeRange } from './code-rdf.js';

const { namedNode: iri, literal } = DataFactory;
function containsRange(outer: GraphFact['provenance'], inner: GraphFact['provenance']) {
  const compare = (a: number, b: number | undefined, c: number, d: number | undefined) => a - c || (b ?? 0) - (d ?? 0);
  return compare(outer.startLine, outer.startColumn, inner.startLine, inner.startColumn) <= 0 &&
    compare(outer.endLine, outer.endColumn, inner.endLine, inner.endColumn) >= 0;
}
export function addCallEvidence(dataset: Store, record: NamedNode, fact: GraphFact, factIri: (id: string) => string) {
  const call = fact.codeCall;
  if (!call && fact.predicate !== 'calls') return;
  // Type calls even when metadata is missing so SHACL rejects them without a global OR scan.
  dataset.addQuad(record, iri(RDF + 'type'), iri(CG + 'CodeCall'));
  if (!call) return;
  const prop = (node: NamedNode, key: string, value: unknown) => {
    if (value !== undefined) dataset.addQuad(node, iri(CG + key), literal(String(value), iri(XSD +
      (typeof value === 'number' ? 'integer' : typeof value === 'boolean' ? 'boolean' : 'string'))));
  };
  for (const [key, value] of Object.entries({ callVersion: call.schemaVersion, callMethod: call.method,
    callSyntax: call.syntax, callDispatch: call.dispatch, callOptional: call.optional, callCaller: call.caller,
    callTarget: call.target, callRuntime: call.runtime })) prop(record, key, value);
  const proofs = (key: string, values: readonly BindingEvidence[]) => values.forEach((proof, index) => {
    const term = iri(`${record.value}:${key}:${index}`);
    dataset.addQuad(record, iri(CG + key), term); dataset.addQuad(term, iri(RDF + 'type'), iri(CG + 'CallProof'));
    dataset.addQuad(term, iri(CG + 'callFact'), iri(factIri(proof.factId)));
    for (const [key, value] of Object.entries(proof.provenance)) prop(term, key, value);
  });
  proofs('callCallerDefinition', call.callerDefinitions ?? []); proofs('callOccurrence', call.targetOccurrences ?? []);
  proofs('callTargetDefinition', call.targetDefinitions ?? []);
}

function proofIssues(fact: GraphFact, proof: BindingEvidence, byId: ReadonlyMap<string, GraphFact>, role: 'definition' | 'reference', nodeId: string) {
  const issues: string[] = [];
  const original = byId.get(proof.factId);
  if (!original || stableJson(original.provenance) !== stableJson(proof.provenance) || original.codeOccurrence?.role !== role ||
      (role === 'definition' ? original.subject.id : original.object.id) !== nodeId ||
      proof.provenance.commitSha !== fact.provenance.commitSha || invalidCodeRange(proof.provenance)) {
    issues.push('Call proof is missing, changed, from another revision or does not identify its endpoint');
  }
  return issues;
}

function occurrenceIssues(fact: GraphFact, proof: BindingEvidence, byId: ReadonlyMap<string, GraphFact>) {
  const issues = proofIssues(fact, proof, byId, 'reference', fact.object.id);
  if (proof.provenance.path !== fact.provenance.path || proof.provenance.digest !== fact.provenance.digest ||
      !containsRange(fact.provenance, proof.provenance)) issues.push('Target occurrence must lie within the cited call site');
  return issues;
}

function callerIssues(fact: GraphFact, byId: ReadonlyMap<string, GraphFact>) {
  const call = fact.codeCall!, callers = call.callerDefinitions ?? [], issues: string[] = [];
  if (call.caller !== 'indexed-callable') {
    if (callers.length || fact.subject.id !== repositoryFileNode(fact.provenance.path).id) issues.push('File-scope calls require their canonical physical file');
    return issues;
  }
  if (!callers.length || fact.subject.kind !== 'CodeSymbol') issues.push('Indexed caller requires callable definition evidence');
  for (const proof of callers) {
    issues.push(...proofIssues(fact, proof, byId, 'definition', fact.subject.id));
    if (proof.provenance.path !== fact.provenance.path || proof.provenance.digest !== fact.provenance.digest) issues.push('Caller and call site must share source bytes');
  }
  return issues;
}

export function callEvidenceIssues(fact: GraphFact, byId: ReadonlyMap<string, GraphFact>): readonly string[] {
  const call = fact.codeCall;
  if (!call) return fact.predicate === 'calls' ? ['A call requires static syntax and indexed proof metadata'] : [];
  const issues: string[] = [];
  if (fact.codeBinding || fact.codeOccurrence) issues.push('A call assertion must remain separate from its supporting reference');
  const targets = call.targetDefinitions ?? [], occurrences = call.targetOccurrences ?? [];
  issues.push(...callerIssues(fact, byId));
  if ((call.target === 'external') !== (targets.length === 0)) issues.push('Call target resolution disagrees with its indexed definitions');
  if (call.target === 'indexed-class' && call.syntax !== 'construct') issues.push('A class target requires construction syntax');
  if ((call.syntax === 'construct') !== (call.dispatch === 'construct')) issues.push('Construction and dispatch disagree');
  for (const proof of targets) issues.push(...proofIssues(fact, proof, byId, 'definition', fact.object.id));
  for (const proof of occurrences) issues.push(...occurrenceIssues(fact, proof, byId));
  return issues;
}
