import type { DocumentSelectionRecord, ExtractionContext, GraphFact } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import type { GitRepository } from '../repository/git.js';
import { selectSemanticInputs } from '../extraction/semantic-sources.js';
import { extractDocumentEvidence } from '../extraction/document-evidence.js';
import { sha256, stableJson } from '../infrastructure/util.js';

export const documentSelectionIdentity = 'document-selection-v1';
export type DocumentEvidence = Awaited<ReturnType<typeof extractDocumentEvidence>>;
export type HydrationInputs = Awaited<ReturnType<typeof selectSemanticInputs>> & {
  readonly documentEvidence?: DocumentEvidence;
  readonly documentSelection?: DocumentSelectionRecord;
};

/** One committed selection for preview, hydration and explicit cache adoption. No execution dependencies. */
export async function selectHydrationInputs(repository: GitRepository, commitSha: string,
  config: ContextGraphConfig, selectors = config.semanticSources): Promise<HydrationInputs> {
  if (!config.documentTraversal) return selectSemanticInputs(repository, commitSha, selectors, config.semantic);
  const context: ExtractionContext = { repositoryRoot: repository.root, repositoryId: config.repositoryId,
    ref: commitSha, commitSha, snapshotId: commitSha, changedPaths: [], deletedPaths: [], renamedPaths: {} };
  const evidence = await extractDocumentEvidence(repository, context, {
    ...config.documentTraversal, documentPolicy: config.documentTraversal.policy,
    // Traversal reads have their own limits; semantic budgets are applied after role exclusion below.
    maxDocuments: 10_000, maxSourceBytes: 4 * 1024 * 1024,
    approvedIntentSources: config.approvedIntentSources, evidenceRoots: config.evidenceRoots,
  });
  const classified = new Map(evidence.classification.documents.map(document => [document.path, document]));
  const excluded: DocumentSelectionRecord['excluded'][number][] = [];
  const semanticPaths: string[] = [];
  for (const document of evidence.traversal.documents) {
    const classification = classified.get(document.path);
    if (document.status !== 'read') excluded.push({ path: document.path, reason: 'unread' });
    else if (classification?.roleStatus === 'ambiguous') excluded.push({ path: document.path, reason: 'ambiguous-role' });
    else if (classification?.sourceRole === 'validation') excluded.push({ path: document.path, reason: 'validation' });
    else semanticPaths.push(document.path);
  }
  const selection = await selectSemanticInputs(repository, commitSha, semanticPaths, config.semantic);
  // Prospective traversal budgets count every document. Execution budgets count only semantic inputs.
  const issues = [...selection.issues, ...evidence.traversal.issues.filter(issue =>
    !['document-budget', 'source-byte-budget'].includes(issue.code)), ...evidence.classification.issues.map(issue =>
    ({ ...issue, severity: issue.code === 'role-ambiguous' ? 'error' as const : issue.severity }))];
  const record = { version: 1 as const, policyDigest: evidence.classification.policyDigest,
    complete: evidence.traversal.coverage.complete && !issues.some(issue => issue.severity === 'error'),
    entryPoints: evidence.traversal.entryPoints, roots: evidence.traversal.roots,
    documentPaths: evidence.traversal.documents.map(document => document.path), semanticPaths, excluded };
  const digest = sha256(stableJson({ identity: documentSelectionIdentity, commitSha, record,
    traversal: evidence.traversal, classification: evidence.classification }));
  return { ...selection, issues, documentEvidence: evidence, documentSelection: { ...record, digest } };
}

/** Assembly metadata is deliberately outside immutable provider artifacts. */
export function classifyHydratedFacts(facts: readonly GraphFact[], evidence?: DocumentEvidence): readonly GraphFact[] {
  if (!evidence) return facts;
  const classified = new Map(evidence.classification.documents.map(document => [document.path, document]));
  return facts.map(fact => {
    const document = classified.get(fact.provenance.path);
    if (!document) throw new Error('Document assembly fact has no classified source');
    const metadata = { sourceRole: document.sourceRole, sourceOwnership: document.ownership,
      sourcePolicyDigest: evidence.classification.policyDigest, sourceAuthority: document.sourceAuthority };
    return { ...fact, ...metadata, id: sha256(stableJson({ fact: fact.id, metadata, identity: documentSelectionIdentity })) };
  });
}
