import { DataFactory, Store, type Term } from 'n3';
import type { GraphFact, GraphNode, GraphSnapshot } from '@weftlet/core';
import { stableJson } from '../infrastructure/util.js';
import { addAttributes, addFactEdges, addFactRecord, addManifest, addNodeRdf, nodeIri } from './rdf-records.js';
import { CG, RDF } from './shacl-shapes.js';

const { namedNode: iri } = DataFactory;
type NodeGroup = { variants: Map<string, GraphNode>; outgoing: GraphFact[];
  attributes: { node: GraphNode; factId: string }[] };
type Quad = Parameters<Store['add']>[0];

/** Complete subject groups: repeated identities are joined before validation, never split. */
export class RdfPartitions {
  private readonly records = new Map<string, { fact: GraphFact; ordinal: number }[]>();
  private readonly nodes = new Map<string, NodeGroup>();

  constructor(private readonly snapshot: GraphSnapshot, private readonly batchSize = 256) {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw Error('Invalid RDF partition size');
    for (const [ordinal, fact] of snapshot.facts.entries()) {
      const records = this.records.get(fact.id) ?? [];
      records.push({ fact, ordinal }); this.records.set(fact.id, records);
      for (const node of [fact.subject, fact.object]) {
        const group: NodeGroup = this.nodes.get(node.id) ?? { variants: new Map(), outgoing: [], attributes: [] };
        group.variants.set(stableJson(node), node); this.nodes.set(node.id, group);
        if (Object.keys(node.attributes ?? {}).length) group.attributes.push({ node, factId: fact.id });
      }
      this.nodes.get(fact.subject.id)!.outgoing.push(fact);
    }
  }

  /** RDF/JS matching over the same records, without a second whole-graph quad store. */
  *match(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): IterableIterator<Quad> {
    const decode = (term: Term | null | undefined, prefix: string, suffix = false) => {
      if (term?.termType !== 'NamedNode' || !term.value.startsWith(prefix)) return undefined;
      try { return decodeURIComponent(suffix ? term.value.slice(prefix.length).split(':')[0]! : term.value.slice(prefix.length)); }
      catch { return undefined; }
    };
    const recordId = decode(subject, 'urn:context-graph:fact:', true);
    const graphId = decode(graph, 'urn:context-graph:fact:');
    const nodeId = decode(subject, 'urn:context-graph:node:');
    let groups: Iterable<Store>;
    if (recordId !== undefined || graphId !== undefined) {
      const batch = new Store();
      for (const { fact, ordinal } of this.records.get(recordId ?? graphId!) ?? []) {
        addFactRecord(batch, fact, ordinal); addFactEdges(batch, fact);
      }
      groups = [batch];
    } else if (nodeId !== undefined) {
      const batch = new Store(), group = this.nodes.get(nodeId);
      if (group) {
        for (const node of group.variants.values()) addNodeRdf(batch, node);
        for (const fact of group.outgoing) addFactEdges(batch, fact);
        for (const { node, factId } of group.attributes) addAttributes(batch, node, iri(`urn:context-graph:fact:${encodeURIComponent(factId)}`));
      }
      groups = [batch];
    } else if (subject?.value === 'urn:context-graph:snapshot') {
      const batch = new Store(); addManifest(batch, this.snapshot); groups = [batch];
    } else if (subject) groups = [];
    else groups = this.named();
    for (const batch of groups) for (const quad of batch) if (
      (!subject || subject.equals(quad.subject)) && (!predicate || predicate.equals(quad.predicate)) &&
      (!object || object.equals(quad.object)) && (!graph || graph.equals(quad.graph))) yield quad;
  }

  /** Exact cardinalities for the record projection; other patterns count the same iterator. */
  countMatches(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): number {
    if (!subject && !object && [CG + 'record', CG + 'ordinal'].includes(predicate?.value ?? '')) {
      if (graph && graph.termType !== 'DefaultGraph') return 0;
      if (predicate!.value === CG + 'ordinal') return this.snapshot.facts.length;
      let count = 0;
      for (const group of this.records.values()) count += group.length === 1 ? 1 : new Set(group.map(({ fact }) => stableJson(fact))).size;
      return count;
    }
    let count = 0;
    for (const _quad of this.match(subject, predicate, object, graph)) count++;
    return count;
  }

  /** Each union subject occurs in exactly one partition, with all its outgoing triples. */
  *validation(): IterableIterator<Store> {
    yield* this.recordPartitions(false);
    let batch = new Store(), count = 0;
    for (const [id, group] of this.nodes) {
      for (const node of group.variants.values()) { addNodeRdf(batch, node); addAttributes(batch, node); }
      for (const fact of group.outgoing) batch.addQuad(iri(nodeIri(id)), iri(CG + fact.predicate), iri(nodeIri(fact.object.id)));
      if (++count % this.batchSize === 0) { yield batch; batch = new Store(); }
    }
    if (batch.size) yield batch;
    const manifest = new Store(); addManifest(manifest, this.snapshot); yield manifest;
  }

  /** Original named dataset, in bounded groups. Triple order is not a content identity. */
  *named(): IterableIterator<Store> {
    yield* this.recordPartitions(true);
    let batch = new Store(), count = 0;
    for (const group of this.nodes.values()) {
      for (const node of group.variants.values()) addNodeRdf(batch, node);
      if (++count % this.batchSize === 0) { yield batch; batch = new Store(); }
    }
    if (batch.size) yield batch;
    const manifest = new Store(); addManifest(manifest, this.snapshot); yield manifest;
  }

  private *recordPartitions(edges: boolean): IterableIterator<Store> {
    let batch = new Store(), count = 0;
    for (const records of this.records.values()) {
      for (const { fact, ordinal } of records) {
        addFactRecord(batch, fact, ordinal);
        if (edges) addFactEdges(batch, fact);
      }
      if (++count % this.batchSize === 0) { yield batch; batch = new Store(); }
    }
    if (batch.size) yield batch;
  }

  /** Only cross-subject information used by the admitted SHACL fragment is rdf:type. */
  get count(): number { return Math.ceil(this.records.size / this.batchSize) + Math.ceil(this.nodes.size / this.batchSize) + 1; }

  types(progress?: (completed: number) => void): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    let completed = 0;
    for (const batch of this.validation()) {
      for (const quad of batch.getQuads(null, iri(RDF + 'type'), null, null)) {
        const values = result.get(quad.subject.value) ?? new Set<string>();
        values.add(quad.object.value); result.set(quad.subject.value, values);
      }
      progress?.(++completed);
    }
    return result;
  }
}
