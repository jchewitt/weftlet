import { repositoryFileNode, sourceLocation } from '@weftlet/core';
import type { ContextPack, GraphFact, GraphNode, ImpactHandoff, ImpactScanRequest } from '@weftlet/core';
import { contextPackEvidenceAuthority } from './authority.js';
import { citesOwner, normalizeOwnerDocument } from './owner-intent.js';

const productKinds = new Set(['Workflow', 'Capability', 'Invariant', 'Contract']);
const isProduct = (node: GraphNode) => productKinds.has(node.kind);
const declaredEndpoint = (f: GraphFact, role: 'guarantee' | 'requirement') =>
  f.subject.kind === 'Component' && f.contractObligation?.declaration.role === role &&
  f.subject.id === repositoryFileNode(f.contractObligation.declaration.endpoint).id;
const step = (fact: GraphFact, direction: 'forward' | 'reverse') => ({ factId: fact.id, direction } as const);

/** Select at most two distinct downstream areas from already reachable, ranked evidence.
 * Exact bindings and directed handoffs are required. Word overlap is never a join. */
export function impactHandoffs(ranked: readonly GraphFact[], request: ImpactScanRequest, snapshotId: string): ImpactHandoff[] {
  const files = new Set(request.changedFiles?.map(normalizeOwnerDocument));
  const fileIds = new Set([...files].map(path => repositoryFileNode(path).id));
  const symbols = new Set(request.symbols);
  const origins = new Set(request.capabilities);
  const anchors = new Map<string, GraphFact>();
  const implementations = new Map<string, GraphFact>();
  if (!(files.size || symbols.size || origins.size || request.ownerDocument)) return [];

  for (const fact of ranked) {
    if (!isProduct(fact.subject)) continue;
    if (fact.predicate !== 'implementedBy' || !((fact.object.kind === 'CodeSymbol' && fact.object.codeSymbol?.resolution === 'indexed-definition') ||
        (fact.object.kind === 'Component' && fact.object.id.startsWith('component:file:')))) continue;
    const previous = implementations.get(fact.subject.id);
    if (!previous || (previous.object.kind !== 'CodeSymbol' && fact.object.kind === 'CodeSymbol')) {
      implementations.set(fact.subject.id, fact);
    }
    if (fileIds.has(fact.object.id) || symbols.has(fact.object.id) || citesOwner(fact, request.ownerDocument) ||
        (fact.codeBinding && (files.has(fact.codeBinding.selector.path) ||
          fact.codeBinding.definitions.some(d => files.has(d.provenance.path))))) {
      origins.add(fact.subject.id);
      if (!anchors.has(fact.subject.id)) anchors.set(fact.subject.id, fact);
    }
  }
  const isAnchor = (fact: GraphFact) => origins.has(fact.subject.id) || fileIds.has(fact.subject.id) ||
    citesOwner(fact, request.ownerDocument) || files.has(normalizeOwnerDocument(fact.provenance.path));
  if (!origins.size && !request.ownerDocument && !files.size) return [];
  // Two distinct emitters suffice to find a producer different from a consumer.
  const emissions = new Map<string, GraphFact[]>();
  for (const fact of ranked) {
    if (!(isProduct(fact.subject) || declaredEndpoint(fact, 'guarantee')) ||
        !(fact.predicate === 'emits' || fact.predicate === 'persistsTo') ||
        !(fact.object.kind === 'Contract' || fact.object.kind === 'PersistenceModel') || !isAnchor(fact)) continue;
    const group = emissions.get(fact.object.id) ?? [];
    if (group.length < 2 && !group.some(f => f.subject.id === fact.subject.id)) group.push(fact);
    emissions.set(fact.object.id, group);
  }

  const paths: ImpactHandoff[] = [];
  const destinations = new Set<string>();
  for (const fact of ranked) {
    let producer: GraphNode, consumer: GraphNode, steps: ImpactHandoff['steps'];
    if (fact.predicate === 'routesThrough' && isAnchor(fact) && isProduct(fact.subject) && isProduct(fact.object)) {
      producer = fact.subject; consumer = fact.object; steps = [step(fact, 'forward')];
    } else if (fact.predicate === 'consumes' && (isProduct(fact.subject) || declaredEndpoint(fact, 'requirement'))) {
      const emission = emissions.get(fact.object.id)?.find(f => f.subject.id !== fact.subject.id);
      if (!emission) continue;
      producer = emission.subject; consumer = fact.subject; steps = [step(emission, 'forward'), step(fact, 'reverse')];
    } else continue;
    const target = implementations.get(consumer.id);
    if ((!target && !declaredEndpoint(fact, 'requirement')) || producer.id === consumer.id || destinations.has(consumer.id)) continue;
    const anchor = anchors.get(producer.id);
    paths.push({ producerId: producer.id, consumerId: consumer.id, endpointId: target?.object.id ?? consumer.id,
      endpointBasis: target ? 'implementedBy' : 'declared-requirement',
      steps: [...(anchor ? [step(anchor, 'reverse')] : []), ...steps, ...(target ? [step(target, 'forward')] : [])],
      followUp: { tool: 'graph.neighbors', arguments: { snapshotId, nodeId: consumer.id } } });
    destinations.add(consumer.id);
    if (paths.length === 2) break;
  }
  return paths;
}

export function describeImpactHandoffs(pack: Omit<ContextPack, 'markdown'>): string[] {
  const paths = pack.exploration?.handoffs;
  if (!paths) return [];
  const selected = pack.exploration?.selectedHandoffCount ?? paths.length;
  const facts = new Map(pack.facts.map(f => [f.id, f]));
  return ['', '## Downstream consumers to inspect',
    `Complete handoffs on this page: ${paths.length} of ${selected} selected (up to two).`,
    ...paths.flatMap(path => [
    `Could this change affect ${path.consumerId} through the handoff from ${path.producerId}?`,
    ...(path.endpointBasis === 'declared-requirement' ? ['The requirement names this consumer file. Check its implementation.'] : []),
    ...path.steps.map(s => {
      const f = facts.get(s.factId)!;
      return `- ${f.subject.label} —${f.predicate}→ ${f.object.label} (followed ${s.direction}; ${sourceLocation(f.provenance)}; ${contextPackEvidenceAuthority(f)}; source ${f.sourceAuthority ?? 'unspecified'}; extraction ${f.extractionReview ?? 'unspecified'})`;
    }),
    `Follow up: graph.neighbors ${JSON.stringify(path.followUp.arguments)}`,
  ])];
}
