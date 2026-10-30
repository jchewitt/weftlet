import type { ExtractionContext, GraphFact, SemanticSource } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import type { GitRepository } from '../repository/git.js';
import type { HydrationInputs } from './hydration-inputs.js';
import { extractDocumentCodeBindings, type BindingSource } from '../extraction/document-code-bindings.js';
import { matchesRepositoryGlob } from '../repository/glob.js';

/** Uses the already selected committed scope; validation documents remain separately classified. */
export async function assembleDocumentCodeBindings(repository: GitRepository, context: ExtractionContext,
  inputs: HydrationInputs, config: ContextGraphConfig, codeFacts: readonly GraphFact[], subjectFacts: readonly GraphFact[]) {
  return extractDocumentCodeBindings(repository, context, await selectedDocumentSources(repository, context, inputs, config), codeFacts, subjectFacts);
}

export async function selectedDocumentSources(repository: GitRepository, context: ExtractionContext,
  inputs: HydrationInputs, config: ContextGraphConfig): Promise<readonly BindingSource[]> {
  const byPath = new Map(inputs.sources.map(source => [source.path, source]));
  const evidence = inputs.documentEvidence;
  const classified = new Map(evidence?.classification.documents.map(document => [document.path, document]));
  const sources: BindingSource[] = [];
  const paths = evidence ? evidence.traversal.documents.filter(document => document.status === 'read').map(document => document.path) : [...byPath.keys()];
  for (const path of paths) {
    let source: SemanticSource | undefined = byPath.get(path);
    if (!source) {
      const document = evidence!.traversal.documents.find(document => document.path === path)!;
      source = { path, content: await repository.readFileAt(context.commitSha, path), digest: document.digest!, stableSemanticId: `document:${path}` };
    }
    const classification = classified.get(path);
    sources.push({ ...source, metadata: classification ? { sourceAuthority: classification.sourceAuthority,
      sourceRole: classification.sourceRole, sourceOwnership: classification.ownership, sourcePolicyDigest: evidence!.classification.policyDigest }
      : { sourceAuthority: config.approvedIntentSources?.some(pattern => matchesRepositoryGlob(path, pattern)) ? 'declared' : 'inferred' } });
  }
  return sources;
}
