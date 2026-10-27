import { loadConfig } from '../configuration/config.js';
import { GitRepository } from '../repository/git.js';
import { matchesRepositoryGlob } from '../repository/glob.js';
import { sha256, stableJson } from '../infrastructure/util.js';
import { traverseDocuments, type DocumentTraversalOptions, type DocumentTraversalReport } from '../extraction/document-traversal.js';

export interface DocumentCoverageOptions extends Omit<DocumentTraversalOptions, 'maxDocuments' | 'maxSourceBytes'> {
  readonly ref?: string;
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
  readonly ready: boolean;
  readonly documents: readonly (DocumentTraversalReport['documents'][number] & {
    readonly role: 'semantic-document' | 'validation-evidence';
    readonly sourceAuthority: 'declared' | 'inferred';
    readonly approvedBy: readonly string[];
    readonly extractionReview: 'unreviewed';
  })[];
  readonly excludedWorkingChanges: readonly string[];
  readonly assumptions: readonly string[];
}

/** Read committed links only. This does not initialize execution, inspect caches or change selection. */
export async function planDocumentCoverage(configPath: string, options: DocumentCoverageOptions): Promise<DocumentCoveragePlan> {
  const { config, repositoryRoot } = await loadConfig(configPath);
  const repository = new GitRepository(repositoryRoot);
  const ref = options.ref ?? 'HEAD';
  const commitSha = await repository.resolveRef(ref);
  const traversal = await traverseDocuments(repository, commitSha, {
    entryPoints: options.entryPoints, roots: options.roots,
    maxReadDocuments: options.maxReadDocuments, maxReadBytes: options.maxReadBytes,
    maxDocumentBytes: options.maxDocumentBytes,
    maxDocuments: config.semantic.maxDocuments ?? 8, maxSourceBytes: config.semantic.maxSourceBytes ?? 65_536,
  });
  const documents = traversal.documents.map(document => {
    const approvedBy = (config.approvedIntentSources ?? []).filter(pattern => matchesRepositoryGlob(document.path, pattern));
    const evidence = config.evidenceRoots.some(root => {
      const normalized = root.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
      return normalized === '.' || document.path === normalized || document.path.startsWith(`${normalized}/`) ||
        matchesRepositoryGlob(document.path, normalized) || matchesRepositoryGlob(document.path, `${normalized}/**`);
    });
    return { ...document, role: evidence ? 'validation-evidence' as const : 'semantic-document' as const,
      sourceAuthority: approvedBy.length ? 'declared' as const : 'inferred' as const,
      approvedBy, extractionReview: 'unreviewed' as const };
  });
  return { ...traversal, documents, schemaVersion: 1, kind: 'document-coverage-plan', mode: 'prospective',
    changesHydrationSelection: false, repositoryId: config.repositoryId, ref, commitSha,
    configurationDigest: sha256(stableJson(config)), coverageDigest: sha256(stableJson({ commitSha, traversal, documents })),
    ready: traversal.coverage.complete && traversal.budgets.withinLimits,
    excludedWorkingChanges: await repository.workingChanges(),
    assumptions: [
      'This is prospective document coverage, not the hydration execution plan. It changes no configuration or hydration inputs and estimates no cache reuse, model calls, tokens or cost.',
      'Documents and link citations come from the resolved commit; configuration and excluded working changes describe the current checkout.',
      'Complete covers supported local document links inside the requested scope. External links, fragments and resolved non-document files are reported but not traversed; this does not prove complete product coverage.',
      'Extraction budgets compare all discovered documents, including validation evidence. Safety limits can leave an explicit unread frontier; undiscovered descendants then remain unknown.',
      'Roles reflect configured evidence roots only. Approval matches do not transfer through links, approve model assertions or establish ownership of individual rules.',
      'No provider, adapter, indexer, runtime source or graph validator was initialized. No cache, snapshot or source document was written.',
      'Use hydrate --plan for current extraction inputs and cache estimates. Validation-document separation and traversal-driven hydration remain later increments.',
    ] };
}
