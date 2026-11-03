import { describe, expect, it } from 'vitest';
import { codeSymbolNode, repositoryFileNode, sha256, type GraphFact, type GraphNode } from '@weftlet/core';
import { sharedSymbolAffinity } from './impact-affinity.js';
import { rankImpactFacts } from './ranking.js';
import { v3Rank } from '../../scripts/same-group-study/v3-rows.js';

const symbol = (name: string) => codeSymbolNode({ schemaVersion: 1, provider: 'scip-typescript',
  repositoryId: 'public/affinity', nativeSymbol: `scip-typescript npm public 1.0.0 ${name}`,
  identityScope: 'repository', resolution: 'indexed-definition' }, name);
const fact = (id: string, subject: GraphNode, predicate: GraphFact['predicate'], object: GraphNode, path: string): GraphFact => ({
  id, subject, predicate, object, provenance: { path, startLine: 5, endLine: 5, digest: `bytes:${path}`, commitSha: 'commit' },
  extractor: { id: 'scip-symbol-extractor', version: '2.1.0' }, snapshotId: 'snapshot', confidence: 0.8,
  authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed',
});
const definition = (node: GraphNode, path: string): GraphFact => ({
  ...fact(`definition:${node.id}`, node, 'definedBy', repositoryFileNode(path), path),
  codeOccurrence: { schemaVersion: 1, role: 'definition', locationKind: 'name', nativeRoles: 1, enclosure: 'file' },
});
const reference = (id: string, subject: GraphNode, object: GraphNode, path: string): GraphFact => ({
  ...fact(id, subject, 'references', object, path),
  codeOccurrence: { schemaVersion: 1, role: 'reference', locationKind: 'name', nativeRoles: 0, enclosure: 'native-range', enclosingSymbolId: subject.id },
});
function fixture() {
  const producer = symbol('producer().'), shared = symbol('message.'), worker = symbol('worker().'), target = symbol('method().');
  const origin = definition(producer, 'src/origin.ts');
  const use = reference('target', worker, target, 'src/worker.ts');
  const native = target.codeSymbol.nativeSymbol;
  const consumer = fact('consumer', repositoryFileNode('src/worker.ts'), 'consumes',
    { id: `symbol:scip:${sha256(native)}`, label: native, kind: 'Contract' }, 'src/worker.ts');
  const facts = [origin, definition(shared, 'src/message.ts'), definition(worker, 'src/worker.ts'), definition(target, 'src/target.ts'),
    reference('producer-reference', producer, shared, 'src/origin.ts'), reference('worker-reference', worker, shared, 'src/worker.ts'), use, consumer];
  return { facts, origin, shared, worker, use, consumer };
}
const signals = (f: ReturnType<typeof fixture>) => sharedSymbolAffinity(f.facts, [f.origin], ['src/origin.ts']);

describe('saved shared-symbol specificity', () => {
  it('counts distinct production referrers, excluding file-scope and test frequency without dropping their facts', () => {
    const f = fixture();
    for (let i = 0; i < 80; i++) {
      const module = symbol(`module-${i}/`), test = symbol(`test-${i}().`);
      f.facts.push(definition(module, `src/setup-${i}.ts`), reference(`module-${i}`, module, f.shared, `src/setup-${i}.ts`),
        definition(test, `test/${i}.test.ts`), reference(`test-${i}`, test, f.shared, `test/${i}.test.ts`),
        reference(`repeat-${i}`, f.worker, f.shared, 'src/worker.ts'));
    }
    expect(signals(f).get(f.use.id)).toBe(2);
    expect(signals(f).get(f.consumer.id)).toBe(2);
    expect(signals(f).has('module-0')).toBe(false);
    expect(signals(f).get('test-0')).toBe(2); // Tests retain their own evidence and lane.
    const ranked = rankImpactFacts(f.facts, [f.origin], ['src/origin.ts'], []);
    expect(new Set(ranked.map(row => row.fact))).toEqual(new Set(f.facts));
    expect(rankImpactFacts([...f.facts].reverse(), [f.origin], ['src/origin.ts'], [])).toEqual(ranked);
    expect(ranked.every((row, i) => !i || ranked[i - 1]!.score <= row.score)).toBe(true);
    for (const { fact: saved } of ranked) expect(saved).toBe(f.facts.find(value => value.id === saved.id));
    expect(f.use).toMatchObject({ predicate: 'references', authority: 'inferred', confidence: 0.8, extractionReview: 'unreviewed' });
    expect(f.use.codeCall).toBeUndefined();
  });

  it('uses exact saved native keys and source scope, allowing the legacy import citation to precede the method use', () => {
    const f = fixture();
    f.facts[f.facts.indexOf(f.consumer)] = { ...f.consumer, provenance: { ...f.consumer.provenance, startLine: 1, endLine: 1 } };
    expect(signals(f).get(f.consumer.id)).toBe(2);
    const extra = symbol('third().');
    f.facts.push(definition(extra, 'src/third.ts'), reference('third', extra, f.shared, 'src/third.ts'));
    expect(signals(f).get(f.use.id)).toBe(3);
    expect(signals(f).get(f.consumer.id)).toBe(3);
  });

  it.each(['native-key', 'hashed-key', 'path', 'digest', 'commit', 'snapshot', 'extractor', 'version', 'physical-file'])(
    'does not use a %s mismatch as cross-projection corroboration', mismatch => {
      const f = fixture();
      let changed = structuredClone(f.consumer);
      switch (mismatch) {
        case 'native-key': changed = { ...changed, object: { ...changed.object, label: 'different native key' } }; break;
        case 'hashed-key': changed = { ...changed, object: { ...changed.object, id: 'symbol:scip:different' } }; break;
        case 'path': changed = { ...changed, provenance: { ...changed.provenance, path: 'src/other.ts' } }; break;
        case 'digest': changed = { ...changed, provenance: { ...changed.provenance, digest: 'old bytes' } }; break;
        case 'commit': changed = { ...changed, provenance: { ...changed.provenance, commitSha: 'old' } }; break;
        case 'snapshot': changed = { ...changed, snapshotId: 'old' }; break;
        case 'extractor': changed = { ...changed, extractor: { ...changed.extractor, id: 'other-adapter' } }; break;
        case 'version': changed = { ...changed, extractor: { ...changed.extractor, version: '0.0' } }; break;
        case 'physical-file': changed = { ...changed, subject: repositoryFileNode('src/unrelated.ts') }; break;
      }
      f.facts[f.facts.indexOf(f.consumer)] = changed;
      expect(signals(f).has(f.use.id)).toBe(true);
      expect(signals(f).has(changed.id)).toBe(false);
    });

  it.each(['definition', 'file-scope', 'different-revision', 'different-provider', 'empty-anchor', 'citation-only'])(
    'falls back to the complete v3 ordering without a valid witness: %s', reason => {
      const f = fixture();
      if (reason === 'definition') f.facts = f.facts.filter(value => value.subject.id !== f.shared.id || value.predicate !== 'definedBy');
      if (reason === 'file-scope') f.facts = f.facts.map(value => value.subject.id === f.worker.id && value.predicate === 'definedBy'
        ? { ...value, codeOccurrence: { ...value.codeOccurrence!, locationKind: 'zero-width-anchor' } } : value);
      if (reason === 'different-revision') f.facts = f.facts.map(value => value.id === 'worker-reference'
        ? { ...value, provenance: { ...value.provenance, commitSha: 'old' } } : value);
      if (reason === 'different-provider') f.facts = f.facts.map(value => ({ ...value, extractor: { id: 'other-provider', version: '1' } }));
      const direct = reason === 'citation-only' ? [f.facts.find(value => value.id === 'producer-reference')!] : [f.origin];
      const anchors = reason === 'empty-anchor' ? [] : ['src/origin.ts'];
      expect(sharedSymbolAffinity(f.facts, direct, anchors).size).toBe(0);
      expect(rankImpactFacts(f.facts, direct, anchors, [])).toEqual(v3Rank(f.facts, direct, anchors, []));
    });
});
