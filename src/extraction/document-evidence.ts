import { repositoryFileNode, type ExtractionContext, type GraphDiagnostic, type GraphFact,
  type GraphNode, type SourceSpan } from '@weftlet/core';
import { sha256, stableJson } from '../infrastructure/util.js';
import type { GitRepository } from '../repository/git.js';
import { classifyDocumentSources, type DocumentClassification, type DocumentClassificationPolicy,
  type DocumentClassificationReport } from './document-classification.js';
import { traverseDocuments, type DocumentTraversalLink, type DocumentTraversalOptions,
  type DocumentTraversalReport, type TraversalDocument } from './document-traversal.js';

export const documentEvidenceExtractorIdentity = { id: 'document-evidence-extractor', version: '1.0.0' } as const;

type ReadDocument = TraversalDocument & { readonly digest: string };
type DocumentEvidenceOptions = DocumentTraversalOptions & {
  readonly documentPolicy?: DocumentClassificationPolicy;
  readonly approvedIntentSources?: readonly string[];
  readonly evidenceRoots?: readonly string[];
};
interface EvidenceState {
  readonly context: ExtractionContext;
  readonly documents: ReadonlyMap<string, ReadDocument>;
  readonly classified: ReadonlyMap<string, DocumentClassification>;
  readonly policyDigest: string;
  readonly facts: Map<string, GraphFact>;
  readonly diagnostics: Map<string, GraphDiagnostic>;
}

function span(state: EvidenceState, path: string, startLine = 1, endLine = startLine): SourceSpan | undefined {
  const document = state.documents.get(path);
  return document ? { path, startLine, endLine, digest: document.digest, commitSha: state.context.commitSha } : undefined;
}

function addFact(state: EvidenceState, subject: GraphNode, predicate: 'contains' | 'references',
  object: GraphNode, provenance: SourceSpan): void {
  const classification = state.classified.get(provenance.path)!;
  const record = { subject, predicate, object, provenance, extractor: documentEvidenceExtractorIdentity,
    confidence: 1, authority: 'inferred' as const, extractionReview: 'deterministic' as const,
    sourceAuthority: classification.sourceAuthority, sourceRole: classification.sourceRole,
    sourceOwnership: classification.ownership, sourcePolicyDigest: state.policyDigest };
  const id = sha256(stableJson({ ...record, repositoryId: state.context.repositoryId }));
  state.facts.set(id, { id, ...record, snapshotId: state.context.snapshotId });
}

function addDiagnostic(state: EvidenceState, kind: GraphDiagnostic['kind'], reason: string,
  provenance: readonly SourceSpan[], paths: readonly string[]): void {
  const citations = [...new Map(provenance.map(citation => [stableJson(citation), citation])).values()];
  const relatedNodeIds = [...new Set(paths.map(path => repositoryFileNode(path).id))].sort();
  const record = { kind, reason, provenance: citations, relatedNodeIds, evidenceScope: 'source' as const };
  const id = sha256(stableJson({ ...record, extractor: documentEvidenceExtractorIdentity,
    commitSha: state.context.commitSha, policyDigest: state.policyDigest, repositoryId: state.context.repositoryId }));
  state.diagnostics.set(id, { id, ...record });
}

function linkCitations(state: EvidenceState, link: DocumentTraversalLink): SourceSpan[] {
  const citations = [span(state, link.sourcePath, link.startLine, link.endLine)];
  if (link.referenceStartLine !== undefined) {
    citations.push(span(state, link.sourcePath, link.referenceStartLine, link.referenceEndLine));
  }
  for (const definition of link.definitions ?? []) {
    citations.push(span(state, link.sourcePath, definition.startLine, definition.endLine));
  }
  return citations.filter((citation): citation is SourceSpan => citation !== undefined);
}

function extractLinks(state: EvidenceState, links: readonly DocumentTraversalLink[]): void {
  for (const link of links) {
    const citations = linkCitations(state, link);
    if ((link.status === 'document' || link.status === 'non-document') && link.path) {
      for (const citation of citations) {
        addFact(state, repositoryFileNode(link.sourcePath), 'references', repositoryFileNode(link.path), citation);
      }
    } else if (link.status !== 'external' && link.status !== 'fragment') {
      addDiagnostic(state, 'implementationGaps',
        `Canonical document link is unresolved (${link.status}); no relationship was emitted.`,
        citations, [link.sourcePath, ...(link.path ? [link.path] : [])]);
    }
  }
}

function reportGaps(state: EvidenceState, traversal: DocumentTraversalReport, classification: DocumentClassificationReport): void {
  for (const issue of traversal.issues) {
    // Link diagnostics above retain their exact declaration/use citations instead of line-one placeholders.
    if (/^(?:link-|ambiguous-reference$|malformed$|outside-repository$)/.test(issue.code)) continue;
    const citations = issue.paths.flatMap(path => { const citation = span(state, path); return citation ? [citation] : []; });
    addDiagnostic(state, 'implementationGaps', `Document traversal gap [${issue.code}]: ${issue.message}`, citations, issue.paths);
  }
  for (const issue of classification.issues) {
    const citations = issue.paths.flatMap(path => { const citation = span(state, path); return citation ? [citation] : []; });
    addDiagnostic(state, issue.code.includes('ambiguous') ? 'ambiguousIntent' : 'missingIntent',
      `Document classification gap [${issue.code}]: ${issue.message}`, citations, issue.paths);
  }
}

/** Deterministic committed document structure only; never interprets prose, approves rules or publishes evidence. */
export async function extractDocumentEvidence(repository: Pick<GitRepository, 'listEntriesAt' | 'readFileAt'>,
  context: ExtractionContext, options: DocumentEvidenceOptions): Promise<{
    facts: readonly GraphFact[]; diagnostics: readonly GraphDiagnostic[];
    traversal: DocumentTraversalReport; classification: DocumentClassificationReport;
  }> {
  const traversal = await traverseDocuments(repository, context.commitSha, options);
  const documents = traversal.documents.filter((document): document is ReadDocument =>
    document.status === 'read' && document.digest !== undefined);
  const paths = documents.map(document => document.path);
  const classification = classifyDocumentSources(paths, {
    approvedIntentSources: options.approvedIntentSources ?? [], evidenceRoots: options.evidenceRoots ?? [],
    availableDocuments: paths,
  }, options.documentPolicy);
  const state: EvidenceState = { context, documents: new Map(documents.map(document => [document.path, document])),
    classified: new Map(classification.documents.map(document => [document.path, document])),
    policyDigest: classification.policyDigest, facts: new Map(), diagnostics: new Map() };
  const project: GraphNode = { id: `project:${context.repositoryId}`, kind: 'Project', label: context.repositoryId };
  for (const document of documents) {
    addFact(state, project, 'contains', repositoryFileNode(document.path), span(state, document.path)!);
  }
  extractLinks(state, traversal.links);
  reportGaps(state, traversal, classification);
  return { facts: [...state.facts.values()].sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: [...state.diagnostics.values()].sort((a, b) => a.id.localeCompare(b.id)), traversal, classification };
}
