import type { BindingEvidence, BindingSubjectEvidence, DocumentCodeBinding, ExtractionContext, GraphDiagnostic,
  GraphFact, GraphNode, SemanticSource, SourceSpan } from '@weftlet/core';
import { repositoryFileNode } from '@weftlet/core';
import type { GitRepository } from '../repository/git.js';
import { sha256, stableJson } from '../infrastructure/util.js';
import { documentSymbolLinks, type SymbolLink } from './symbol-selectors.js';
import { resolveSymbolSelector } from './symbol-resolution.js';

export const documentCodeBindingIdentity = { id: 'document-code-binding-extractor', version: '1.0.0' } as const;
export interface BindingSource extends SemanticSource {
  readonly metadata: Pick<GraphFact, 'sourceAuthority' | 'sourceRole' | 'sourceOwnership' | 'sourcePolicyDigest'>;
}
const subjectKinds = new Set(['Capability', 'Workflow', 'Contract', 'Invariant']);
const proof = (fact: GraphFact): BindingEvidence => ({ factId: fact.id, provenance: fact.provenance });

/** Resolve the declared subject independently of code selection; retain every supporting assertion. */
function mappingSubject(subjectId: string | undefined, predicate: string, source: BindingSource, subjectFacts: readonly GraphFact[]):
  { subject: GraphNode; basis: readonly GraphFact[] } | { problem: string } {
  if (!subjectId) return { subject: repositoryFileNode(source.path), basis: [] };
  const basis = subjectFacts.filter(fact => !fact.codeBinding && [fact.subject, fact.object].some(node => node.id === subjectId));
  const nodes = basis.flatMap(fact => [fact.subject, fact.object].filter(node => node.id === subjectId));
  if (!nodes.length || new Set(nodes.map(node => node.kind)).size !== 1 || !subjectKinds.has(nodes[0]!.kind) || basis.length > 100) {
    return { problem: 'Mapping subject must identify one existing business node with at most 100 supporting assertions.' };
  }
  if (source.metadata.sourceRole === 'validation' && predicate === 'implementedBy') {
    return { problem: 'A validation document cannot establish a product implementation mapping.' };
  }
  return { subject: nodes[0]!, basis };
}

/** Keep both a reference use and all destination declarations in the evidence envelope. */
function linkCitations(source: BindingSource, link: SymbolLink['link'], commitSha: string): readonly SourceSpan[] {
  const cite = (startLine: number, endLine: number): SourceSpan => ({ path: source.path, startLine, endLine,
    digest: source.digest, commitSha });
  const citations = [cite(link.startLine, link.endLine)];
  if (link.referenceStartLine !== undefined) citations.push(cite(link.referenceStartLine, link.referenceEndLine!));
  for (const definition of link.definitions ?? []) citations.push(cite(definition.startLine, definition.endLine));
  return [...new Map(citations.map(span => [stableJson(span), span])).values()];
}

/** Resolve only explicit declarations against current indexed evidence; no provider, checkout or basename search. */
export async function extractDocumentCodeBindings(repository: Pick<GitRepository, 'listEntriesAt' | 'readFileAt'>,
  context: ExtractionContext, sources: readonly BindingSource[], codeFacts: readonly GraphFact[],
  subjectFacts: readonly GraphFact[]): Promise<{ facts: readonly GraphFact[]; diagnostics: readonly GraphDiagnostic[] }> {
  const facts = new Map<string, GraphFact>(), diagnostics = new Map<string, GraphDiagnostic>();
  const selectedSources = sources.map(source => ({ source, links: documentSymbolLinks(source.path, source.content) })).filter(item => item.links.length);
  if (!selectedSources.length) return { facts: [], diagnostics: [] };
  const entries = new Map((await repository.listEntriesAt(context.commitSha)).map(entry => [entry.path, entry]));
  const current = codeFacts.filter(fact => fact.provenance.commitSha === context.commitSha);
  const texts = new Map<string, string>();
  const read = async (path: string) => {
    let text = texts.get(path);
    if (text === undefined) { text = await repository.readFileAt(context.commitSha, path); texts.set(path, text); }
    return text;
  };
  const regular = (path: string) => { const entry = entries.get(path); return entry?.type === 'blob' && ['100644', '100755'].includes(entry.mode); };
  const verifyDefinitions = async (proofs: readonly GraphFact[]): Promise<string | undefined> => {
    if (proofs.length > 1000) return `Binding requires ${proofs.length} occurrence proofs, exceeding the 1000-proof bound; no partial binding emitted.`;
    for (const fact of proofs) {
      if (!regular(fact.provenance.path) || fact.provenance.digest !== sha256(await read(fact.provenance.path))) {
        return 'Indexed definition does not match regular committed target bytes.';
      }
    }
    return undefined;
  };
  for (const { source, links } of selectedSources) {
    for (const item of links) {
      const documentCitations = linkCitations(source, item.link, context.commitSha);
      const gap = (reason: string, related: readonly string[] = []) => {
        const record = { kind: 'implementationGaps' as const, reason, provenance: documentCitations,
          relatedNodeIds: [...new Set([repositoryFileNode(source.path).id, ...related])].sort(), evidenceScope: 'source' as const };
        const id = sha256(stableJson({ ...record, extractor: documentCodeBindingIdentity }));
        diagnostics.set(id, { id, ...record });
      };
      if (!regular(source.path) || sha256(source.content) !== source.digest || await read(source.path) !== source.content) {
        gap('Binding document does not match regular committed source bytes.'); continue;
      }
      if (item.problem || !item.selector) { gap(item.problem!); continue; }
      const selector = item.selector, entry = entries.get(selector.path);
      if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
        gap(`Symbol target ${selector.path} is not a regular committed file.`, [repositoryFileNode(selector.path).id]); continue;
      }
      const text = await read(selector.path);
      if (current.some(fact => fact.provenance.path === selector.path && fact.provenance.digest !== sha256(text))) {
        gap('Indexed target does not match the cited committed bytes.'); continue;
      }
      const resolution = resolveSymbolSelector(selector, current, text);
      if ('problem' in resolution) { gap(`${resolution.problem} Candidate identities: ${resolution.candidates.length}; at most 100 IDs are included.`, resolution.candidates.slice(0, 100)); continue; }
      const proofProblem = await verifyDefinitions([...resolution.selected, ...resolution.definitions]);
      if (proofProblem) { gap(proofProblem, [resolution.node.id]); continue; }
      const mapped = mappingSubject(item.subjectId, item.predicate, source, subjectFacts);
      if ('problem' in mapped) { gap(mapped.problem, item.subjectId ? [item.subjectId] : []); continue; }
      const { subject, basis } = mapped;
      const subjectEvidence: BindingSubjectEvidence[] = basis.map(fact => ({ ...proof(fact),
        ...(fact.authority === undefined ? {} : { authority: fact.authority }),
        ...(fact.sourceAuthority === undefined ? {} : { sourceAuthority: fact.sourceAuthority }),
        ...(fact.extractionReview === undefined ? {} : { extractionReview: fact.extractionReview }),
      })).sort((a, b) => a.factId.localeCompare(b.factId));
      const codeBinding: DocumentCodeBinding = { schemaVersion: 1, method: 'explicit-markdown', selector,
        documentCitations, selectedOccurrences: resolution.selected.map(proof), definitions: resolution.definitions.map(proof), subjectEvidence };
      const assertion = { subject, predicate: item.predicate, object: resolution.node, provenance: documentCitations[0]!,
        codeBinding, extractor: documentCodeBindingIdentity, confidence: Math.min(1, ...basis.map(fact => fact.confidence)),
        authority: 'inferred' as const, ...source.metadata,
        extractionReview: basis.some(fact => fact.extractionReview === 'unreviewed') ? 'unreviewed' as const : 'deterministic' as const };
      const id = sha256(stableJson(assertion));
      facts.set(id, { id, ...assertion, snapshotId: context.snapshotId });
    }
  }
  return { facts: [...facts.values()].sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: [...diagnostics.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
