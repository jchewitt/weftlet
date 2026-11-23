import { describe, expect, it } from 'vitest';
import type { GraphFact, GraphNode } from '@weftlet/core';
import { impactHandoffs } from './impact-handoffs.js';

function node(id: string, kind: GraphNode['kind']): GraphNode { return { id, label: id, kind }; }
const producer = node('workflow:sampling', 'Workflow'), worker = node('workflow:histories', 'Workflow');
const stream = node('contract:sampled', 'Contract'), upstream = node('component:file:src/sample.ts', 'Component');
const downstream = node('component:file:worker/history.ts', 'Component');
function fact(id: string, subject: GraphNode, predicate: GraphFact['predicate'], object: GraphNode): GraphFact {
  return { id, subject, predicate, object, snapshotId: 'saved', confidence: 1,
    extractor: { id: 'fixture', version: '1' }, authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed',
    provenance: { path: `docs/${subject.id.slice(9)}.md`, startLine: 2, endLine: 2, digest: 'digest', commitSha: 'commit' } };
}
const binding = fact('a', producer, 'implementedBy', upstream);
const emission = fact('b', producer, 'emits', stream);
const consumption = fact('c', worker, 'consumes', stream);
const implementation = fact('d', worker, 'implementedBy', downstream);
const request = { changedFiles: ['src/sample.ts'] };

describe('cited handoffs', () => {
  it('joins an emitted contract to its consumer by saved identity, retaining traversal direction', () => {
    const path = impactHandoffs([binding, consumption, implementation, emission], request, 'saved');
    expect(path).toEqual([{ producerId: producer.id, consumerId: worker.id, endpointId: downstream.id, endpointBasis: 'implementedBy',
      steps: [{ factId: 'a', direction: 'reverse' }, { factId: 'b', direction: 'forward' },
        { factId: 'c', direction: 'reverse' }, { factId: 'd', direction: 'forward' }],
      followUp: { tool: 'graph.neighbors', arguments: { snapshotId: 'saved', nodeId: worker.id } } }]);
    expect(impactHandoffs([binding, consumption, implementation, { ...emission, predicate: 'references' }], request, 'saved')).toEqual([]);
    const differentContract = { ...stream, id: 'contract:other', label: stream.label };
    expect(impactHandoffs([binding, emission, implementation, { ...consumption, object: differentContract }], request, 'saved')).toEqual([]);
  });

  it('supports a planning owner anchor and rejects unrelated files, empty input and unindexed targets', () => {
    const facts = [emission, consumption, implementation];
    expect(impactHandoffs(facts, { ownerDocument: emission.provenance.path }, 'saved')[0]?.steps[0]?.factId).toBe('b');
    for (const input of [{}, { task: 'cache' }, { changedFiles: ['other/sample.ts'] }]) {
      expect(impactHandoffs([binding, ...facts], input, 'saved')).toEqual([]);
    }
    expect(impactHandoffs([binding, emission, consumption,
      { ...implementation, object: node('external', 'CodeSymbol') }], request, 'saved')).toEqual([]);
  });
});
