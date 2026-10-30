import { DataFactory, type Store, type NamedNode } from 'n3';
import { obligationContractNode, parseObligationDeclaration, repositoryFileNode, type GraphFact, type ObligationDeclaration } from '@weftlet/core';
import { CG, RDF, XSD } from './shacl-shapes.js';
const { namedNode: iri, literal } = DataFactory;

export function addObligationEvidence(dataset: Store, record: NamedNode, fact: GraphFact): void {
  const evidence = fact.contractObligation;
  if (!evidence && fact.extractor.id !== 'document-obligation-extractor') return;
  dataset.addQuad(record, iri(RDF + 'type'), iri(CG + 'ContractObligation'));
  if (!evidence) return;
  const prop = (node: NamedNode, key: string, value: unknown, datatype = 'string') => {
    if (value !== undefined) dataset.addQuad(node, iri(CG + key), literal(String(value), iri(XSD + datatype)));
  };
  const item: Partial<ObligationDeclaration> = evidence.declaration ?? {};
  const contract = item.contract, constraint = item.constraint;
  prop(record, 'obligationVersion', item.schemaVersion, 'integer');
  for (const [key, value] of Object.entries({ obligationMethod: evidence.method, obligationRepository: evidence.repositoryId,
    obligationId: item.id, obligationRole: item.role, obligationStatement: item.statement,
    obligationScope: contract?.scope, obligationContract: contract?.id, obligationTransport: contract?.kind,
    obligationContractVersion: contract?.version, obligationDomain: item.domain, obligationStage: item.stage,
    obligationRevalidation: item.revalidation, obligationMetric: constraint?.metric,
    obligationOperator: constraint?.operator, obligationUnit: constraint?.unit })) prop(record, key, value);
  prop(record, 'obligationValue', constraint?.value, 'double');
  if (evidence.endpointSource) {
    const endpoint = iri(`${record.value}:obligation-endpoint`);
    dataset.addQuad(record, iri(CG + 'obligationEndpoint'), endpoint);
    dataset.addQuad(endpoint, iri(RDF + 'type'), iri(CG + 'ObligationEndpoint'));
    for (const [key, value] of Object.entries(evidence.endpointSource)) prop(endpoint, key, value, typeof value === 'number' ? 'integer' : 'string');
  }
}

function identityMatches(fact: GraphFact, declaration: ObligationDeclaration, repositoryId: string): boolean {
  const expected = repositoryFileNode(declaration.endpoint);
  return fact.contractObligation!.repositoryId === repositoryId &&
    fact.object.id === obligationContractNode(repositoryId, declaration.contract).id && fact.object.kind === 'Contract' &&
    fact.subject.id === expected.id && fact.subject.kind === expected.kind &&
    fact.predicate === (declaration.role === 'guarantee' ? 'emits' : 'consumes');
}

/** Structural integrity only: declarations cannot prove fulfillment, compatibility or runtime delivery. */
export function obligationEvidenceIssues(fact: GraphFact, repositoryId: string): readonly string[] {
  const evidence = fact.contractObligation;
  if (!evidence) return fact.extractor.id === 'document-obligation-extractor' ? ['Obligation extraction requires declaration metadata'] : [];
  let declaration;
  try { declaration = parseObligationDeclaration(evidence.declaration); }
  catch { return ['Malformed obligation declaration']; }
  const issues: string[] = [], endpoint = evidence.endpointSource;
  if (!identityMatches(fact, declaration, repositoryId)) issues.push('Obligation role or scoped contract/endpoint identity does not match its declaration');
  if (!endpoint || endpoint.path !== declaration.endpoint || endpoint.commitSha !== fact.provenance.commitSha ||
      endpoint.endLine < endpoint.startLine) issues.push('Obligation endpoint citation does not match its declared file/revision');
  if (fact.codeBinding || fact.codeCall || fact.codeOccurrence) issues.push('Obligation declarations must remain separate from implementation evidence');
  if (fact.sourceRole === 'validation') issues.push('Validation evidence cannot declare product obligations');
  if (fact.authority === 'draft' && fact.sourceAuthority !== 'draft') issues.push('Draft obligations require draft source authority');
  return issues;
}
