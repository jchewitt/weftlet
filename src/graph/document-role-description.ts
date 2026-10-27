import type { GraphFact } from '@weftlet/core';

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
