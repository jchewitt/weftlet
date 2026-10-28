import type { DocumentSelectionRecord, GraphFact } from '@weftlet/core';

/** Plain text for evidence details; the rendering context must escape it. */
export function sourceDocumentDescription(fact: GraphFact): string | undefined {
  const parts: string[] = [];
  if (fact.sourceRole !== undefined) parts.push(`source role ${fact.sourceRole}`);
  if (fact.sourceOwnership) {
    parts.push(`ownership ${fact.sourceOwnership.status}`,
      `owner documents ${fact.sourceOwnership.ownerDocuments.join(', ') || '(none)'}`);
  }
  return parts.length ? parts.join('; ') : undefined;
}


/** Completeness is scoped to the configured canonical links, not all product knowledge. */
export function documentSelectionDescription(selection?: DocumentSelectionRecord): string {
  if (!selection) return '';
  return `Document traversal: ${selection.complete ? 'complete within configured links' : 'INCOMPLETE'}; ` +
    `${selection.documentPaths.length} discovered documents; ${selection.semanticPaths.length} semantic candidates; ` +
    `${selection.excluded.length} excluded from semantic extraction. Ownership and assertion approval are separate.`;
}
