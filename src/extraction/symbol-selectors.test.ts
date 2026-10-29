import { describe, expect, it } from 'vitest';
import { documentSymbolLinks } from './symbol-selectors.js';
import { canonicalDocumentLinks } from './canonical-document-links.js';
const parse = (text: string) => documentSymbolLinks('docs/rules.md', text);

describe('explicit document symbol selectors', () => {
  it('reads exact qualified names and explicit business mapping titles', () => {
    expect(parse('[code](../src/worker.ts#weftlet-symbol=Engine.execute "weftlet:implementedBy invariant:age")')[0])
      .toMatchObject({ selector: { path: 'src/worker.ts', symbol: 'Engine.execute' }, predicate: 'implementedBy', subjectId: 'invariant:age' });
    expect(parse('[test](../test/worker.ts#weftlet-symbol=verify&weftlet-line=3&weftlet-column=8 "weftlet:verifiedBy invariant:age")')[0])
      .toMatchObject({ selector: { path: 'test/worker.ts', symbol: 'verify', line: 3, column: 8 }, predicate: 'verifiedBy' });
  });
  it('retains reference use and definition citations without changing ordinary link traversal', () => {
    const content = '[code][impl]\n\n[impl]: ../src/a.ts#weftlet-symbol=run "weftlet:implementedBy invariant:age"\n';
    expect(parse(content)[0]).toMatchObject({ link: { startLine: 3, referenceStartLine: 1 }, subjectId: 'invariant:age' });
    expect(canonicalDocumentLinks(content)[0]).not.toHaveProperty('title');
    const conflict = content + '[impl]: ../src/a.ts#weftlet-symbol=run "weftlet:verifiedBy invariant:age"\n';
    expect(parse(conflict)[0]?.problem).toContain('Conflicting reference definitions');
    expect(canonicalDocumentLinks(conflict)[0]?.kind).toBe('link');
  });
  it('ignores ordinary headings, code, images and unannotated prose', () => {
    expect(parse('[heading](../src/a.ts#run)\n`[x](../src/a.ts#weftlet-symbol=run)`\n![image](../src/a.ts#weftlet-symbol=run)\n```md\n[x](../src/a.ts#weftlet-symbol=run)\n```')).toEqual([]);
    expect(parse('[x](../src/a.ts#weftlet-symbol=run)')[0]?.predicate).toBe('references');
  });
  it.each([
    '../../outside.ts#weftlet-symbol=run', 'https://example.test/a.ts#weftlet-symbol=run',
    '../src/a.ts?raw=1#weftlet-symbol=run', '../src/#weftlet-symbol=run',
    '../src/a.ts#weftlet-symbol=', '../src/a.ts#weftlet-symbol=%ZZ',
    '../src/a.ts#weftlet-symbol=%00', '../src/a.ts#weftlet-symbol=%C0%80',
    '../src/a.ts#weftlet-symbol=run&weftlet-symbol=other', '../src/a.ts#weftlet-symbol=run&unknown=1',
    '../src/a.ts#weftlet-symbol=run&weftlet-line=2', '../src/a.ts#weftlet-symbol=run&weftlet-line=0&weftlet-column=3',
  ])('diagnoses invalid selector %s', target => {
    expect(parse(`[x](${target})`)[0]?.problem).toBeTruthy();
    expect(parse(`[x](${target})`)[0]?.selector).toBeUndefined();
  });
  it('does not guess malformed annotation intent', () => {
    expect(parse('[x](../src/a.ts#weftlet-symbol=run "weftlet:implements invariant:age")')[0]?.problem).toContain('Invalid mapping annotation');
  });
});
