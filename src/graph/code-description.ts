import type { GraphFact, ContextPack } from '@weftlet/core';

/** Human-readable labels for the same typed evidence returned to CLI/MCP clients. */
export function codeEvidenceDescription(fact: GraphFact): string | undefined {
  const code = fact.codeOccurrence;
  if (!code) return undefined;
  const symbol = code.role === 'definition' ? fact.subject : fact.object;
  return `static ${code.role}; ${symbol.codeSymbol?.resolution ?? 'unknown resolution'}; ` +
    `${code.enclosure} lexical enclosure; ${code.locationKind}; UTF-16 columns`;
}

export function unexpandedCodeDescription(exploration: ContextPack['exploration']): readonly string[] {
  const count = exploration?.unexpandedCodeTargetCount ?? 0;
  return count ? [`Unresolved code targets left unexpanded: ${count}; up to 100 example IDs are included in exploration metadata. Use graph.neighbors with their exact IDs to inspect shared references; no implementation or call is established.`] : [];
}
