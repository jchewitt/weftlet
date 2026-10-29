import type { GraphFact, SourceSpan, DocumentCodeBinding } from '@weftlet/core';
import { sha256, stableJson } from '../infrastructure/util.js';

/** Rewrite proof references after code facts receive draft identities; never retain disposable Git SHAs. */
export function draftFacts(facts: readonly GraphFact[], snapshotId: string, baseSha: string): readonly GraphFact[] {
  const rewritten = new Map<string, GraphFact>();
  const span = (citation: SourceSpan): SourceSpan => ({ ...citation, commitSha: baseSha });
  const make = ({ id: previousId, ...fact }: GraphFact): GraphFact => {
    const rewrite = (binding: DocumentCodeBinding): DocumentCodeBinding => {
      const proofs = <T extends { factId: string; provenance: SourceSpan }>(items: readonly T[]): T[] =>
        items.map(item => ({ ...item, factId: rewritten.get(item.factId)?.id ?? item.factId, provenance: span(item.provenance) }));
      return { ...binding, documentCitations: binding.documentCitations.map(span), selectedOccurrences: proofs(binding.selectedOccurrences),
        definitions: proofs(binding.definitions), subjectEvidence: binding.subjectEvidence.map(item => {
          const updated = rewritten.get(item.factId);
          return updated ? { factId: updated.id, provenance: updated.provenance,
            ...(updated.authority === undefined ? {} : { authority: updated.authority }),
            ...(updated.sourceAuthority === undefined ? {} : { sourceAuthority: updated.sourceAuthority }),
            ...(updated.extractionReview === undefined ? {} : { extractionReview: updated.extractionReview }) } : item;
        }) };
    };
    const draft = { ...fact, snapshotId, authority: 'draft' as const,
      ...(fact.codeBinding || fact.extractor.id === 'routing-declaration-extractor' || fact.sourceRole !== undefined ? { sourceAuthority: 'draft' as const } : {}),
      ...(fact.codeBinding ? { codeBinding: rewrite(fact.codeBinding) } : {}), provenance: span(fact.provenance) };
    const result = { ...draft, id: sha256(stableJson(draft)) }; rewritten.set(previousId, result);
    return result;
  };
  return [...facts.filter(fact => !fact.codeBinding).map(make), ...facts.filter(fact => fact.codeBinding).map(make)];
}
