import type { DocumentCodeBinding, GraphFact, GraphNode, SourceSpan } from '@weftlet/core';
import { stableJson } from '../infrastructure/util.js';

type Selector = DocumentCodeBinding['selector'];
export type SymbolResolution = { readonly node: GraphNode; readonly selected: readonly GraphFact[]; readonly definitions: readonly GraphFact[] }
  | { readonly problem: string; readonly candidates: readonly string[] };

function occurrenceNode(fact: GraphFact): GraphNode {
  return fact.codeOccurrence?.role === 'definition' ? fact.subject : fact.object;
}

function textAt(span: SourceSpan, text: string): string | undefined {
  const lines = text.split('\n');
  if (!span.startColumn || !span.endColumn || span.columnEncoding !== 'utf-16' || span.startLine !== span.endLine) return undefined;
  return lines[span.startLine - 1]?.slice(span.startColumn - 1, span.endColumn - 1);
}

/** Qualification follows indexed lexical parents only; absent or conflicting parents are never invented. */
function qualifiedName(fact: GraphFact, localDefinitions: ReadonlyMap<string, readonly GraphFact[]>, seen = new Set<string>()): string | undefined {
  const node = occurrenceNode(fact), parentId = fact.codeOccurrence?.enclosingSymbolId;
  if (seen.has(node.id) || seen.size >= 64) return undefined;
  if (!parentId) return node.label;
  const parents = localDefinitions.get(parentId) ?? [];
  if (!parents.length) return undefined;
  const named = parents.filter(candidate => candidate.codeOccurrence?.locationKind !== 'zero-width-anchor');
  if (!named.length) return node.label;
  const names = new Set(named.map(parent => qualifiedName(parent, localDefinitions, new Set([...seen, node.id]))));
  return names.size === 1 && !names.has(undefined) ? `${[...names][0]}.${node.label}` : undefined;
}

export function resolveSymbolSelector(selector: Selector, facts: readonly GraphFact[], sourceText: string): SymbolResolution {
  const local = facts.filter(fact => fact.codeOccurrence && fact.provenance.path === selector.path);
  const definitions = local.filter(fact => fact.codeOccurrence!.role === 'definition' && fact.codeOccurrence!.locationKind === 'name');
  const parents = new Map<string, GraphFact[]>();
  for (const fact of local.filter(item => item.codeOccurrence!.role === 'definition')) {
    const entries = parents.get(fact.subject.id) ?? []; entries.push(fact); parents.set(fact.subject.id, entries);
  }
  const selected = selector.line !== undefined
    ? local.filter(fact => fact.provenance.startLine === selector.line && fact.provenance.startColumn === selector.column &&
      (occurrenceNode(fact).id === selector.symbol || textAt(fact.provenance, sourceText) === selector.symbol))
    : definitions.filter(fact => fact.subject.id === selector.symbol || fact.subject.label === selector.symbol ||
      qualifiedName(fact, parents) === selector.symbol);
  const identities = [...new Set(selected.map(fact => occurrenceNode(fact).id))].sort();
  if (identities.length !== 1) return { problem: identities.length ? 'Ambiguous indexed symbol; use a qualified name or exact occurrence.'
    : 'No indexed symbol matches this exact selector; no name, path, alias or line was guessed.', candidates: identities };
  const target = occurrenceNode(selected[0]!);
  const resolved = facts.filter(fact => fact.codeOccurrence?.role === 'definition' && fact.subject.id === target.id);
  if (!resolved.length) return { problem: 'The occurrence has no indexed definition; implementation is unresolved in this saved scope.', candidates: identities };
  const sorted = (items: readonly GraphFact[]) => [...items].sort((a, b) => stableJson(a.provenance).localeCompare(stableJson(b.provenance)) || a.id.localeCompare(b.id));
  return { node: target, selected: sorted(selected), definitions: sorted(resolved) };
}
