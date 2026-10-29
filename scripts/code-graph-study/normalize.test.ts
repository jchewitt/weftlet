import { describe, expect, it } from 'vitest';
import { digest, normalizeCurrent, normalizeGraphify, normalizeScip, sourceSpan } from './normalize.mjs';
import { caseLocations, scoreNative } from './score.mjs';

const commit = 'a'.repeat(40);
const sources = { 'a.ts': 'function yes() {}\nfunction no() {}\nyes();\n', 'b.ts': 'function yes() {}\nyes();\n' };
const suite = {
  entities: { yes: ['yes'], no: ['no'] },
  cases: [
    { id: 'positive', track: 'reference', from: 'use', to: 'yes', expected: 'present' },
    { id: 'negative', track: 'reference', from: 'use', to: 'no', expected: 'absent' },
    { id: 'call', track: 'call', from: 'use', to: 'yes', expected: 'present' },
  ], gaps: [],
};
const locations = { yes: { path: 'a.ts', line: 1, column: 10, length: 3 },
  no: { path: 'a.ts', line: 2, column: 10, length: 2 }, use: { path: 'a.ts', line: 3, column: 1, length: 3 } };
const occurrence = (symbol: string, range: number[], definition = false) => ({ symbol, range, symbol_roles: definition ? 1 : 0 });
function native(targets = ['yes']) {
  return normalizeScip({ documents: [{ relative_path: 'a.ts', occurrences: [occurrence('yes', [0, 9, 12], true),
    occurrence('no', [1, 9, 11], true), ...targets.map(target => occurrence(target, [2, 0, 3]))] }] }, sources, commit);
}

describe('predeclared code-study normalization and scoring', () => {
  it('retains every native local occurrence with file-scoped identity and exact columns', () => {
    const raw = { documents: Object.keys(sources).map(path => ({ relative_path: path,
      occurrences: [occurrence('local 0', [0, 9, 0, 12], true), occurrence('local 0', [1, 0, 3])] })) };
    const result = normalizeScip(raw, sources, commit);
    expect(result.entities.map((item: any) => item.id)).toEqual(['local:a.ts:local 0', 'local:b.ts:local 0']);
    expect(result.entities[0].definitions[0]).toMatchObject({ startLine: 1, startColumn: 10, endColumn: 13 });
    expect(result.references).toHaveLength(2);
    expect(result.references[0].target).not.toBe(result.references[1].target);
  });

  it('reports only scoped unresolved declarations and does not manufacture native SCIP calls', () => {
    const result = native(['external']);
    expect(result.diagnostics).toMatchObject([{ code: 'no-indexed-definition', target: 'external' }]);
    expect(result.references[0].relation).toBe('reference');
    expect(scoreNative(result, suite, locations, sources, commit).tracks.call).toMatchObject({ tp: 0, fn: 1, unsupported: 1 });
  });

  it('keeps file nodes from masquerading as line-one functions and preserves native confidence/authority', () => {
    const raw = { nodes: [
      { id: 'file', label: 'a.ts', file_type: 'code', source_file: 'a.ts', source_location: 'L1' },
      { id: 'f', label: 'yes()', source_file: 'a.ts', source_location: 'L1', _callable: true },
      { id: 'stub', label: 'elsewhere', source_file: '', source_location: '' },
    ], edges: [{ source: 'file', target: 'f', relation: 'calls', confidence: 'INFERRED',
      source_file: 'a.ts', source_location: 'L3' }] };
    const before = JSON.stringify(raw);
    const result = normalizeGraphify(raw, sources, commit);
    expect(result.entities[0].definitions).toEqual([]);
    expect(result.entities[0].fileSpan).toMatchObject({ path: 'a.ts', startLine: 1 });
    expect(result.entities[2].definitions).toEqual([]);
    expect(result.references[0]).toMatchObject({ authority: 'inferred', confidence: null, nativeConfidence: 'INFERRED' });
    expect(scoreNative(result, suite, locations, sources, commit).tracks.call).toMatchObject({ tp: 1, fn: 0 });
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('counts a wrong resolved target as both a false positive and missing positive, including a negative case', () => {
    const score = scoreNative(native(['no']), suite, locations, sources, commit);
    expect(score.tracks.reference).toMatchObject({ tp: 0, fp: 2, fn: 1, precision: 0, recall: 0 });
  });

  it('does not hide an additional wrong target behind a correct exact-span match or inflate duplicate recall', () => {
    const mixed = scoreNative(native(['yes', 'yes', 'no']), suite, locations, sources, commit);
    expect(mixed.tracks.reference).toMatchObject({ tp: 1, fp: 2, fn: 0 });
    expect(mixed.cases[0].nativeTargets).toHaveLength(2);
    const clean = scoreNative(native(['yes', 'yes']), suite, locations, sources, commit);
    expect(clean.tracks.reference).toMatchObject({ tp: 1, fp: 0, fn: 0, recall: 1 });
  });

  it('withholds exact credit for ambiguous line-only sources and records that uncertainty', () => {
    const ambiguous = { ...native(['yes', 'no']), granularity: 'native-line', unsupportedTracks: [] };
    ambiguous.references.forEach((reference: any) => { reference.span.startColumn = null; reference.span.endColumn = null; });
    const result = scoreNative(ambiguous, suite, locations, sources, commit);
    expect(result.tracks.reference).toMatchObject({ tp: 0, fn: 1, fp: 0, ambiguousSource: 2 });
    expect(result.cases[1].outcome).toBe('ambiguous-source-location');
  });

  it('retains invalid citations and rejects identity collisions instead of selecting a convenient declaration', () => {
    const colliding = native();
    colliding.entities[0].definitions.push(colliding.entities[1].definitions[0]);
    const result = scoreNative(colliding, suite, locations, sources, commit);
    expect(result.ambiguousIdentities).toEqual([{ id: 'yes', families: ['yes', 'no'] }]);
    expect(result.tracks.reference.tp).toBe(0);
    const invalid = native();
    invalid.references[0].span.digest = 'wrong';
    expect(scoreNative(invalid, suite, locations, sources, commit).invalidCitations).toHaveLength(1);
    expect(sourceSpan('../private.ts', [1, 1, 1, 4], sources, commit).invalid).toBeTruthy();
  });

  it('keeps the current file/shared-symbol projection in a separate coarse tier', () => {
    const facts = [
      { object: { id: 's', label: 'native' }, predicate: 'contains', provenance: { path: 'a.ts', startLine: 1, endLine: 1, digest: digest(sources['a.ts']), commitSha: commit } },
      { object: { id: 's', label: 'native' }, predicate: 'consumes', provenance: { path: 'a.ts', startLine: 3, endLine: 3, digest: digest(sources['a.ts']), commitSha: commit } },
    ];
    const score = scoreNative(normalizeCurrent(facts), suite, locations, sources, commit);
    expect(score.tracks.reference).toMatchObject({ tp: 0, fn: 1, unsupported: 2 });
    expect(score.cases[0].coarseCandidate).toBe(true);
  });

  it('mechanically remaps rename/delete/edit/dirty anchors without consulting a tool answer', () => {
    const input = { ...suite, anchors: { yes: { path: 'corpus/a.ts', text: 'function yes() {}', token: 'yes' },
      no: { path: 'corpus/a.ts', text: 'function no() {}', token: 'no' }, use: { path: 'corpus/a.ts', text: 'yes();', token: 'yes' } } };
    const renamed = caseLocations(input, { root: 'corpus' }, { 'renamed.ts': sources['a.ts'] },
      { id: 'rename', operations: [{ kind: 'rename', path: 'a.ts', to: 'renamed.ts' }] });
    expect(renamed.use.path).toBe('renamed.ts');
    expect(caseLocations(input, { root: 'corpus' }, {}, { id: 'delete', operations: [] })).toEqual({});
    const dirty = caseLocations(input, { root: 'corpus' }, sources, { id: 'dirty', operations: [{ kind: 'replace', path: 'a.ts', before: 'yes();', after: 'no();' }] });
    expect(dirty.use).toEqual(locations.use);
  });

  it('distinguishes declaration-only implementation gaps, silent absence and fabricated targets', () => {
    const typed = { ...sources, 'vendor.d.ts': 'declare function yes(): void;\n' };
    const result = normalizeScip({ documents: [
      { relative_path: 'vendor.d.ts', occurrences: [occurrence('yes', [0, 17, 20], true)] },
      { relative_path: 'a.ts', occurrences: [occurrence('yes', [2, 0, 3])] },
    ] }, typed, commit);
    expect(result.diagnostics[0].code).toBe('declaration-only');
    const gaps = { ...suite, gaps: [{ id: 'external-implementation', from: 'use' }] };
    expect(scoreNative(result, gaps, locations, typed, commit).gaps[0].status).toBe('fabricated'); // Wrong family relative to this suite.
    const emptySuite = { ...gaps, cases: [] };
    expect(scoreNative(result, emptySuite, locations, typed, commit).gaps[0].status).toBe('explicit');
    expect(scoreNative(native(), { ...emptySuite, gaps: [{ id: 'undeclared-queue', from: 'use' }] }, locations, sources, commit).gaps[0].status).toBe('silent');
  });
});
