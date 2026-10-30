import type { ExtractionContext } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import type { GitRepository } from '../repository/git.js';
import type { HydrationInputs } from './hydration-inputs.js';
import { selectedDocumentSources } from './document-code-bindings.js';
import { matchesRepositoryGlob } from '../repository/glob.js';
import { extractDocumentObligations } from '../extraction/document-obligations.js';

export async function assembleDocumentObligations(repository: GitRepository, context: ExtractionContext,
  inputs: HydrationInputs, config: ContextGraphConfig) {
  const sources = await selectedDocumentSources(repository, context, inputs, config);
  const validation = (path: string) => config.evidenceRoots.some(root => root === '.' || path === root ||
    path.startsWith(`${root.replace(/\/$/, '')}/`) || matchesRepositoryGlob(path, root) || matchesRepositoryGlob(path, `${root}/**`));
  return extractDocumentObligations(repository, context, sources.map(source => ({ ...source,
    metadata: { ...source.metadata, sourceRole: source.metadata.sourceRole ?? (validation(source.path) ? 'validation' :
      source.metadata.sourceAuthority === 'declared' ? 'intent' : 'unclassified') } })));
}
