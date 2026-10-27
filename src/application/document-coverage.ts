import { loadConfig } from '../configuration/config.js';
import { GitRepository } from '../repository/git.js';
import { sha256, stableJson } from '../infrastructure/util.js';
import { traverseDocuments, type DocumentTraversalOptions, type DocumentTraversalReport } from '../extraction/document-traversal.js';
import { classifyDocumentSources, parseDocumentClassificationPolicy, type DocumentClassification,
  type DocumentClassificationContext, type DocumentClassificationPolicy,
  type DocumentClassificationReport } from '../extraction/document-classification.js';

export interface DocumentCoverageOptions extends Omit<DocumentTraversalOptions, 'maxDocuments' | 'maxSourceBytes'> {
  readonly ref?: string;
  readonly documentPolicy?: DocumentClassificationPolicy;
}

export interface DocumentCoveragePlan extends Omit<DocumentTraversalReport, 'documents'> {
  readonly schemaVersion: 1;
  readonly kind: 'document-coverage-plan';
  readonly mode: 'prospective';
  readonly changesHydrationSelection: false;
  readonly repositoryId: string;
  readonly ref: string;
  readonly commitSha: string;
  readonly configurationDigest: string;
  readonly coverageDigest: string;
  /** Traversal and budget readiness only; classification is reported independently. */
  readonly ready: boolean;
  readonly classification: DocumentClassificationReport;
  readonly documents: readonly (DocumentTraversalReport['documents'][number] & DocumentClassification & {
    readonly role: 'semantic-document' | 'validation-evidence';
    readonly extractionReview: 'unreviewed';
  })[];
  readonly excludedWorkingChanges: readonly string[];
  readonly assumptions: readonly string[];
}

function classifyKnownDocuments(paths: readonly string[], context: DocumentClassificationContext,
  policy: DocumentClassificationPolicy): DocumentClassificationReport {
  // Traversal bounds reads, not its discovered frontier. Preserve every known path while each
  // classifier call stays bounded; all batches see the same complete set of read owners.
  const ordered = [...paths].sort();
  const batchSize = 1000;
  const first = classifyDocumentSources(ordered.slice(0, batchSize), context, policy);
  const documents = [...first.documents];
  const issues = [...first.issues];
  for (let offset = batchSize; offset < ordered.length; offset += batchSize) {
    const batch = classifyDocumentSources(ordered.slice(offset, offset + batchSize), context, policy);
    documents.push(...batch.documents);
    issues.push(...batch.issues);
  }
  return { policyDigest: first.policyDigest, documents, issues, complete: !issues.length };
}

/** Read committed links only. This does not initialize execution, inspect caches or change selection. */
export async function planDocumentCoverage(configPath: string, options: DocumentCoverageOptions): Promise<DocumentCoveragePlan> {
  const { config, repositoryRoot } = await loadConfig(configPath);
  const documentPolicy = parseDocumentClassificationPolicy(options.documentPolicy ?? { schemaVersion: 1 });
  const repository = new GitRepository(repositoryRoot);
  const ref = options.ref ?? 'HEAD';
  const commitSha = await repository.resolveRef(ref);
  const traversal = await traverseDocuments(repository, commitSha, {
    entryPoints: options.entryPoints, roots: options.roots,
    maxReadDocuments: options.maxReadDocuments, maxReadBytes: options.maxReadBytes,
    maxDocumentBytes: options.maxDocumentBytes,
    maxDocuments: config.semantic.maxDocuments ?? 8, maxSourceBytes: config.semantic.maxSourceBytes ?? 65_536,
  });
  const classification = classifyKnownDocuments(traversal.documents.map(document => document.path), {
    approvedIntentSources: config.approvedIntentSources ?? [], evidenceRoots: config.evidenceRoots,
    availableDocuments: traversal.documents.filter(document => document.status === 'read').map(document => document.path),
  }, documentPolicy);
  const classified = new Map(classification.documents.map(document => [document.path, document]));
  const documents = traversal.documents.map(document => ({ ...document, ...classified.get(document.path)!,
    role: classified.get(document.path)!.sourceRole === 'validation' ? 'validation-evidence' as const : 'semantic-document' as const,
    extractionReview: 'unreviewed' as const }));
  return { ...traversal, documents, schemaVersion: 1, kind: 'document-coverage-plan', mode: 'prospective',
    changesHydrationSelection: false, repositoryId: config.repositoryId, ref, commitSha,
    configurationDigest: sha256(stableJson(config)), classification,
    coverageDigest: sha256(stableJson({ commitSha, traversal, documents, classification })),
    ready: traversal.coverage.complete && traversal.budgets.withinLimits,
    excludedWorkingChanges: await repository.workingChanges(),
    assumptions: [
      'This is prospective document coverage, not the hydration execution plan. It changes no configuration or hydration inputs and estimates no cache reuse, model calls, tokens or cost.',
      'Documents and link citations come from the resolved commit; configuration, document policy and excluded working changes describe current operation inputs.',
      'Complete covers supported local document links inside the requested scope. External links, fragments and resolved non-document files are reported but not traversed; this does not prove complete product coverage.',
      'Extraction budgets compare all discovered documents, including validation evidence. Safety limits can leave an explicit unread frontier; undiscovered descendants then remain unknown.',
      'Ready describes traversal and budget checks only. Classification completeness is separate; unresolved roles or ownership are evidence gaps, not proven business-rule violations or approved intent.',
      'Roles use explicit document policy and configured defaults. Ownership maps require a read, approved intent owner. Neither approval nor ownership transfers through links or approves individual assertions.',
      'No provider, adapter, indexer, runtime source or graph validator was initialized. No cache, snapshot or source document was written.',
      'Use hydrate --plan for current extraction inputs and cache estimates. The standalone document-evidence API is available; connecting classification and validation separation to hydration remains T07c.',
    ] };
}
