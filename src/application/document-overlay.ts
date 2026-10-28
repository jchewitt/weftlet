import type { ContextGraphConfig } from '../configuration/config.js';
import type { DocumentSelectionRecord, GraphFact } from '@weftlet/core';
import type { HydrationInputs } from './hydration-inputs.js';
import { documentEvidenceExtractorIdentity } from '../extraction/document-evidence.js';
import { stableJson } from '../infrastructure/util.js';

/** Retain only unchanged, still-reachable assertions with unchanged source ownership. */
export function retainOverlayDocumentFact(fact: GraphFact, inputs: HydrationInputs | undefined,
  affected: ReadonlySet<string>): boolean {
  if (!inputs?.documentSelection) return true;
  if (fact.extractor.id === documentEvidenceExtractorIdentity.id) return false;
  if (!/\.(?:md|mdx|txt)$/i.test(fact.provenance.path)) return true;
  if (!inputs.documentSelection.complete) return false;
  const source = inputs.sources.find(source => source.path === fact.provenance.path);
  const classification = inputs.documentEvidence?.classification.documents.find(document => document.path === fact.provenance.path);
  return Boolean(source && classification && source.digest === fact.provenance.digest &&
    fact.sourceRole === classification.sourceRole &&
    fact.sourcePolicyDigest === inputs.documentSelection.policyDigest &&
    stableJson(fact.sourceOwnership) === stableJson(classification.ownership) &&
    !classification.ownership.ownerDocuments.some(path => affected.has(path)));
}


export function overlayDocumentRoots(config: Pick<ContextGraphConfig, 'documentTraversal'>): readonly string[] {
  return config.documentTraversal ? config.documentTraversal.roots ?? ['.'] : [];
}

export function overlayDocumentManifest(selection?: DocumentSelectionRecord) {
  return selection ? { documentSelection: selection, scope: selection.documentPaths } : {};
}

export function overlayDocumentNotes(config: Pick<ContextGraphConfig, 'documentTraversal'>): readonly string[] {
  return config.documentTraversal ? [
    'Document traversal was recomputed from captured drafts. Changed/unreachable sources and changed owners invalidate prior semantic assertions; incomplete coverage invalidates all retained document assertions.',
  ] : [];
}
