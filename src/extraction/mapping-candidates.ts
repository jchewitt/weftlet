import ts from 'typescript';
import type { GraphFact, MappingCandidate } from '@weftlet/core';
import { callableName, factsAt, isAmbient, isCallable, parseCallSource, syntaxSpan } from './call-syntax.js';

/** Join real callable syntax to exact indexed name occurrences, never fuzzy labels. */
export function mappingCandidates(path: string, text: string, digest: string, commit: string, facts: readonly GraphFact[],
  limits: { maxCandidates: number; maxInputBytes: number }) {
  const parsed = parseCallSource(path, text, digest, facts);
  const candidates: (MappingCandidate & { text: string })[] = [], issues: string[] = [];
  let excluded = 0, observed = 0;
  const seen = new Set<string>();
  if (parsed.parseErrors.length) return { candidates, issues: ['invalid-typescript'], excluded, observed };
  const add = (node: ts.Node, definitions: readonly GraphFact[]) => {
    observed++;
    const symbol = definitions[0]!.subject;
    if (seen.has(symbol.id)) issues.push('multiple-implementation-bodies');
    seen.add(symbol.id);
    if (observed > limits.maxCandidates) { issues.push('candidate-budget-exceeded'); return; }
    const body = syntaxSpan(node, parsed.source, digest, commit);
    const proofs = facts.filter(f => f.codeOccurrence?.role === 'definition' && f.subject.id === symbol.id);
    // Avoid expanding many overlapping large callable bodies merely to discover a budget failure.
    const excerpt = node.getText(parsed.source), excerptBytes = Buffer.byteLength(excerpt);
    const tooLarge = excerptBytes > limits.maxInputBytes;
    if (tooLarge) issues.push('input-budget-exceeded');
    candidates.push({ node: symbol, body, excerptBytes, definitions: proofs, text: tooLarge ? '' : excerpt });
  };
  const visit = (node: ts.Node) => {
    if (isCallable(node)) {
      const definitions = factsAt(callableName(node), parsed, commit, 'definition');
      const ids = new Set(definitions.map(f => f.subject.id));
      if (!node.body || isAmbient(node) || !callableName(node)) excluded++;
      else if (ids.size !== 1 || definitions.some(f => f.subject.codeSymbol?.resolution !== 'indexed-definition')) {
        issues.push('callable-without-unambiguous-indexed-definition');
      } else add(node, definitions);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.source);
  return { candidates, issues: [...new Set(issues)], excluded, observed };
}
