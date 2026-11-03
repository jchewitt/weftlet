import type { EvidencePath, PathFrontier } from '@weftlet/core';

export interface PathEdge { readonly id: string; readonly from: string; readonly to: string }
export interface PathSearchOptions {
  readonly maxDepth: number;
  readonly maxPaths: number;
  readonly maxSteps: number;
  readonly offset?: number;
}

/** Pure, dependency-free search shared verbatim with the offline viewer. No global visited set:
 * distinct simple paths and parallel assertions survive; cycles do not repeat a node. */
export function searchEvidencePaths(edges: readonly PathEdge[], start: string, target: string, options: PathSearchOptions,
  knownNodeIds?: ReadonlySet<string>) {
  const searchLimit = 100_000;
  const offset = options.offset ?? 0;
  const validateBounds = () => {
    for (const [value, maximum] of [[options.maxDepth, 32], [options.maxPaths, 20], [options.maxSteps, 10_000]]) {
      if (!Number.isInteger(value) || value! < 1 || value! > maximum!) throw new Error('Invalid path search bound');
    }
    if (!Number.isInteger(offset) || offset < 0 || offset >= searchLimit) throw new Error('Invalid path continuation offset');
  };
  validateBounds();
  const adjacency = new Map<string, PathEdge[]>();
  const nodeIds = new Set<string>();
  // Building adjacency already visits every input edge. Prefer closing edges in
  // that index; candidate examination below still counts every selected edge.
  for (const edge of [...edges].sort((a, b) => Number(b.to === target) - Number(a.to === target) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const entries = adjacency.get(edge.from) ?? [];
    entries.push(edge); adjacency.set(edge.from, entries);
    nodeIds.add(edge.from); nodeIds.add(edge.to);
  }
  const paths: EvidencePath[] = [];
  type Prefix = { nodeId: string; next: number; depth: number; via?: string; parent?: Prefix };
  // At most one prefix is allocated per examined edge, bounded by searchLimit.
  // Parent links retain distinct simple paths without copying whole path arrays.
  const queue: Prefix[] = nodeIds.has(start) && nodeIds.has(target) && start !== target
    ? [{ nodeId: start, next: 0, depth: 0 }] : [];
  let head = 0;
  const depthExamples: PathFrontier['depthLimited']['examples'][number][] = [];
  let depthCount = 0;
  let totalSteps = 0;
  const trim = () => {
    while (head < queue.length && queue[head]!.next >= (adjacency.get(queue[head]!.nodeId)?.length ?? 0)) head++;
  };
  const prefixPath = (frame: Prefix): EvidencePath => {
    const nodeIds: string[] = [], factIds: string[] = [];
    for (let cursor: Prefix | undefined = frame; cursor; cursor = cursor.parent) {
      nodeIds.push(cursor.nodeId);
      if (cursor.via !== undefined) factIds.push(cursor.via);
    }
    return { nodeIds: nodeIds.reverse(), factIds: factIds.reverse() };
  };
  const step = (): EvidencePath | undefined => {
    const frame = queue[head]!;
    const edge = adjacency.get(frame.nodeId)![frame.next++]!;
    totalSteps++;
    for (let cursor: Prefix | undefined = frame; cursor; cursor = cursor.parent) {
      if (cursor.nodeId === edge.to) return;
    }
    if (frame.depth === options.maxDepth) {
      depthCount++;
      if (depthExamples.length < 20) depthExamples.push({ nodeId: frame.nodeId, viaFactIds: prefixPath(frame).factIds,
        nextFactId: edge.id, nextNodeId: edge.to });
    } else if (edge.to === target) {
      const path = prefixPath(frame);
      return { nodeIds: [...path.nodeIds, target], factIds: [...path.factIds, edge.id] };
    } else if (adjacency.has(edge.to)) {
      queue.push({ nodeId: edge.to, next: 0, depth: frame.depth + 1, via: edge.id, parent: frame });
    }
  };
  trim();
  // Reconstruct bounded search state; never accept a caller-supplied queue or facts.
  const replay = () => {
    let replayPageSteps = 0;
    let replayPagePaths = 0;
    while (totalSteps < offset && head < queue.length) {
      if (step()) replayPagePaths++;
      replayPageSteps++;
      if (replayPagePaths === options.maxPaths || replayPageSteps === options.maxSteps) {
        replayPagePaths = 0; replayPageSteps = 0;
      }
      trim();
    }
    if (totalSteps !== offset || (offset && (head === queue.length || replayPagePaths || replayPageSteps))) {
      throw new Error('Invalid path continuation boundary');
    }
  };
  replay();
  if (!offset && start === target && (nodeIds.has(start) || knownNodeIds?.has(start))) paths.push({ nodeIds: [start], factIds: [] });
  while (head < queue.length && paths.length < options.maxPaths && totalSteps - offset < options.maxSteps && totalSteps < searchLimit) {
    const path = step();
    if (path) paths.push(path);
    trim();
  }
  const pending: PathFrontier['pending'][number][] = [];
  let pendingCount = 0;
  for (let index = head; index < queue.length; index++) {
    const frame = queue[index]!;
    const entries = adjacency.get(frame.nodeId) ?? [];
    if (frame.next >= entries.length) continue;
    pendingCount++;
    if (pending.length < 32) pending.push({ nodeId: frame.nodeId,
      viaFactIds: prefixPath(frame).factIds, nextFactId: entries[frame.next]!.id,
      remainingCandidates: entries.length - frame.next });
  }
  const exhaustedWithinDepth = head === queue.length;
  const stopReason = () => {
    if (exhaustedWithinDepth) return 'exhausted' as const;
    if (totalSteps === searchLimit) return 'search-limit' as const;
    if (paths.length === options.maxPaths) return 'path-page-limit' as const;
    return 'work-page-limit' as const;
  };
  return { paths, frontier: { pending, pendingCount, omittedPending: pendingCount - pending.length,
    depthLimited: { count: depthCount, examples: depthExamples,
    omitted: depthCount - depthExamples.length } }, search: { searchLimit, replayedSteps: offset,
    examinedSteps: totalSteps - offset, totalSteps, stopReason: stopReason(), exhaustedWithinDepth,
    depthLimitReached: depthCount > 0, truncated: !exhaustedWithinDepth || depthCount > 0 } };
}
