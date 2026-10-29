import { canonicalDocumentLinks, resolveCanonicalDocumentLink } from './canonical-document-links.js';
import type { CanonicalDocumentLink } from './canonical-document-links.js';
import type { DocumentCodeBinding } from '@weftlet/core';

export interface SymbolLink {
  readonly link: CanonicalDocumentLink;
  readonly selector?: DocumentCodeBinding['selector'];
  readonly subjectId?: string;
  readonly predicate: 'references' | 'implementedBy' | 'verifiedBy';
  readonly problem?: string;
}

const keys = new Set(['weftlet-symbol', 'weftlet-line', 'weftlet-column']);
const positive = (value: string | null) => value !== null && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value));

/** Only the explicit weftlet-symbol fragment opts a link in; ordinary headings keep their existing meaning. */
export function documentSymbolLinks(sourcePath: string, content: string): readonly SymbolLink[] {
  const result: SymbolLink[] = [];
  for (const link of canonicalDocumentLinks(content, { includeTitles: true })) {
    const targets = link.kind === 'ambiguous-reference' ? link.definitions?.map(definition => definition.target) ?? [] : [link.target ?? ''];
    if (!targets.some(target => /#weftlet-symbol(?:=|&|$)/.test(target))) continue;
    const fail = (problem: string) => result.push({ link, predicate: 'references', problem });
    if (link.kind === 'ambiguous-reference') { fail('Conflicting reference definitions; no symbol binding selected.'); continue; }
    const target = link.target!;
    const path = resolveCanonicalDocumentLink(sourcePath, target);
    if (path.kind !== 'path' || path.directoryHint || target.split('#')[0]!.includes('?')) { fail('Symbol link must name an exact repository file.'); continue; }
    const parsed = selectorFragment(target);
    if ('problem' in parsed) { fail(parsed.problem); continue; }
    const annotation = link.title;
    const match = annotation?.match(/^weftlet:(implementedBy|verifiedBy) ([^\s]+)$/);
    if (annotation?.startsWith('weftlet:') && !match) { fail('Invalid mapping annotation; expected weftlet:implementedBy or weftlet:verifiedBy and an exact subject ID.'); continue; }
    result.push({ link, selector: { path: path.path, ...parsed },
      predicate: match ? match[1] as 'implementedBy' | 'verifiedBy' : 'references', ...(match ? { subjectId: match[2]! } : {}) });
  }
  return result;
}

function selectorFragment(target: string): Omit<DocumentCodeBinding['selector'], 'path'> | { problem: string } {
  const fragment = target.slice(target.indexOf('#') + 1);
  if (/%(?![a-f0-9]{2})/i.test(fragment)) return { problem: 'Malformed percent encoding in symbol selector.' };
  const params = new URLSearchParams(fragment);
  const symbol = params.get('weftlet-symbol');
  const line = params.get('weftlet-line'), column = params.get('weftlet-column');
  if ([...params.keys()].some(key => !keys.has(key) || params.getAll(key).length !== 1) ||
      !symbol || symbol !== symbol.trim() || symbol.length > 2048 || /[\x00-\x1f\x7f-\x9f\uFFFD]/.test(symbol) ||
      ((line !== null || column !== null) && (!positive(line) || !positive(column)))) {
    return { problem: 'Invalid symbol selector; use one symbol and optionally both positive line and column.' };
  }
  return { symbol, ...(line !== null ? { line: Number(line), column: Number(column) } : {}) };
}
