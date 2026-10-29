import { describe, expect, it } from 'vitest';
import type { ExtractionContext } from '@weftlet/core';
import { extractCodeOccurrences } from './scip-occurrences.js';
import type { ScipIndex } from './scip-runtime.js';
import { sha256 } from '../infrastructure/util.js';

const context: ExtractionContext = { repositoryRoot: '/unused', repositoryId: 'public/unit', commitSha: 'a'.repeat(40),
  ref: 'HEAD', snapshotId: 'snapshot', changedPaths: [], deletedPaths: [], renamedPaths: {} };
const identity = { id: 'scip-symbol-extractor', version: '2.0.0' };
const text = 'function inner() {}\nfunction outer() { inner(); inner(); }\nconst emoji = "😀"; inner();\n';
const occurrence = (symbol: string, range: number[], symbol_roles = 0, enclosing_range: number[] = []) =>
  ({ symbol, range, symbol_roles, enclosing_range });
const sites = [occurrence('inner', [0, 9, 14], 1, [0, 0, 19]),
  occurrence('outer', [1, 9, 14], 1, [1, 0, 36]), occurrence('inner', [1, 19, 24]), occurrence('inner', [1, 28, 33]),
  occurrence('inner', [2, 20, 25])];
function extract(entries = sites, source = text, path = 'src/code.ts') {
  return extractCodeOccurrences({ documents: [{ relative_path: path, occurrences: entries }] } as unknown as ScipIndex,
    new Map([[path, source]]), context, 'public-index', identity);
}

describe('SCIP occurrence projection', () => {
  it('retains repeated same-file references with exact columns and native lexical enclosure', () => {
    const facts = extract();
    const definitions = facts.filter(fact => fact.codeOccurrence?.role === 'definition');
    expect(definitions).toHaveLength(2);
    const inner = definitions.find(fact => fact.subject.label === 'inner')!.subject;
    const outer = definitions.find(fact => fact.subject.label === 'outer')!.subject;
    const local = facts.filter(fact => fact.predicate === 'references' && fact.provenance.startLine === 2);
    expect(local).toHaveLength(2);
    expect(local.map(fact => fact.provenance.startColumn).sort()).toEqual([20, 29]);
    for (const fact of local) {
      expect(fact).toMatchObject({ subject: outer, object: inner, authority: 'implemented', extractionReview: 'deterministic',
        codeOccurrence: { enclosure: 'native-range', enclosingSymbolId: outer.id, role: 'reference' },
        provenance: { path: 'src/code.ts', startLine: 2, endLine: 2, columnEncoding: 'utf-16', digest: sha256(text), commitSha: context.commitSha } });
    }
    const unicode = facts.find(fact => fact.provenance.startLine === 3)!;
    expect(unicode.provenance.startColumn).toBe(21);
    expect(unicode.subject.id).toBe('component:file:src/code.ts');
    expect(facts.some(fact => String(fact.predicate) === 'calls')).toBe(false);
  });

  it('maps a stripped UTF-8 BOM back to committed first-line columns and multiline extents', () => {
    const source = '\uFEFF' + text;
    const facts = extract([occurrence('container', [0, 0, 0], 1, [0, 0, 2, 28]), ...sites], source);
    const inner = facts.find(f => f.codeOccurrence!.role === 'definition' && f.subject.label === 'inner')!;
    expect(inner.provenance).toMatchObject({ startColumn: 11, endColumn: 16, digest: sha256(source) });
    expect(inner.codeOccurrence!.declarationRange).toMatchObject({ startColumn: 2, endColumn: 21 });
    const anchor = facts.find(f => f.codeOccurrence!.locationKind === 'zero-width-anchor')!;
    expect(anchor.provenance).toMatchObject({ startColumn: 2, endColumn: 2 });
    expect(anchor.codeOccurrence!.declarationRange).toMatchObject({ startColumn: 2, endLine: 3, endColumn: 29 });
    expect(facts.filter(f => f.codeOccurrence!.role === 'reference' && f.provenance.startLine === 2)
      .map(f => f.provenance.startColumn).sort()).toEqual([20, 29]);
  });

  it('deduplicates identical native evidence but retains different sites and roles', () => {
    expect(extract([...sites, sites[2]!])).toEqual(extract());
    expect(extract([...sites, { ...sites[2]!, symbol_roles: 8 }])).toHaveLength(sites.length + 1);
  });

  it('uses the narrowest nested range and retains recursive self-references', () => {
    const refs = extract([occurrence('container', [0, 9, 14], 1, [0, 0, 2, 28]), ...sites]);
    expect(refs.filter(fact => fact.predicate === 'references' && fact.provenance.startLine === 2)
      .every(fact => fact.subject.label === 'outer')).toBe(true);
    const recursive = extract([sites[1]!, occurrence('outer', [1, 19, 24])]);
    expect(recursive.find(fact => fact.predicate === 'references')).toMatchObject({ subject: { label: 'outer' }, object: { label: 'outer' } });
  });

  it('reports overlapping/tied native scopes as ambiguous without selecting a guessed caller', () => {
    const result = extract([...sites, occurrence('another-scope', [1, 9, 14], 1, [1, 0, 36])]);
    for (const fact of result.filter(fact => fact.predicate === 'references' && fact.provenance.startLine === 2)) {
      expect(fact.subject.id).toBe('component:file:src/code.ts');
      expect(fact.codeOccurrence).toMatchObject({ enclosure: 'ambiguous' });
      expect(fact.codeOccurrence?.enclosingSymbolId).toBeUndefined();
    }
  });

  it('keeps declaration-only and absent definitions explicit without discarding references', () => {
    const external = extract([occurrence('vendor', [2, 20, 25])]);
    expect(external[0]?.object.codeSymbol?.resolution).toBe('no-indexed-definition');
    const declaration = extract(sites.slice(0, 1), text, 'src/vendor.d.ts');
    expect(declaration[0]?.subject.codeSymbol?.resolution).toBe('declaration-only');
  });

  it('isolates native local identities across files and index revisions', () => {
    const index = { documents: ['src/one.ts', 'src/two.ts'].map(relative_path => ({ relative_path,
      occurrences: [occurrence('local 0', [0, 9, 14], 1)] })) } as unknown as ScipIndex;
    const sources = new Map([['src/one.ts', text], ['src/two.ts', text]]);
    const first = extractCodeOccurrences(index, sources, context, 'one', identity);
    const second = extractCodeOccurrences(index, sources, context, 'two', identity);
    expect(new Set(first.map(fact => fact.subject.id)).size).toBe(2);
    expect(first.every(fact => fact.subject.label === 'inner')).toBe(true);
    expect(second.some(fact => first.some(old => old.subject.id === fact.subject.id))).toBe(false);
  });

  it.each([[0, -1, 2], [0, 0], [100, 0, 1], [0, 9, 900], [0, 14, 9]])('rejects invalid native ranges %j', range => {
    expect(() => extract([occurrence('bad', range)])).toThrow(/SCIP range/);
  });

  it('preserves a zero-width native anchor preceding its extent', () => {
    const [fact] = extract([occurrence('module', [0, 0, 0], 1, [1, 0, 36])]);
    expect(fact!.codeOccurrence).toMatchObject({ locationKind: 'zero-width-anchor', declarationRange: { startLine: 2 } });
  });

  it('retains a native extent after its name, as emitted for arrow initializers', () => {
    const [fact] = extract([occurrence('arrow', [0, 9, 14], 1, [0, 14, 18])]);
    expect(fact!.codeOccurrence!.declarationRange).toMatchObject({ startColumn: 15, endColumn: 19 });
  });
});
