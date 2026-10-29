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
  for (const edge of [...edges].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const entries = adjacency.get(edge.from) ?? [];
    entries.push(edge); adjacency.set(edge.from, entries);
    nodeIds.add(edge.from); nodeIds.add(edge.to);
  }
  const paths: EvidencePath[] = [];
  const stack: { nodeId: string; next: number; via?: string }[] =
    nodeIds.has(start) && nodeIds.has(target) && start !== target ? [{ nodeId: start, next: 0 }] : [];
  const depthExamples: PathFrontier['depthLimited']['examples'][number][] = [];
  let depthCount = 0;
  let totalSteps = 0;
  const trim = () => {
    while (stack.length && stack.at(-1)!.next >= (adjacency.get(stack.at(-1)!.nodeId)?.length ?? 0)) stack.pop();
  };
  const step = (): EvidencePath | undefined => {
    const frame = stack.at(-1)!;
    const edge = adjacency.get(frame.nodeId)![frame.next++]!;
    totalSteps++;
    if (stack.some(item => item.nodeId === edge.to)) return;
    const viaFactIds = stack.slice(1).map(item => item.via!);
    if (viaFactIds.length === options.maxDepth) {
      depthCount++;
      if (depthExamples.length < 20) depthExamples.push({ nodeId: frame.nodeId, viaFactIds,
        nextFactId: edge.id, nextNodeId: edge.to });
    } else if (edge.to === target) {
      return { nodeIds: [...stack.map(item => item.nodeId), target], factIds: [...viaFactIds, edge.id] };
    } else {
      stack.push({ nodeId: edge.to, next: 0, via: edge.id });
    }
  };
  trim();
  // Reconstruct only bounded search state. Never accept a caller-supplied stack or facts.
  const replay = () => {
    let replayPageSteps = 0;
    let replayPagePaths = 0;
    while (totalSteps < offset && stack.length) {
      if (step()) replayPagePaths++;
      replayPageSteps++;
      if (replayPagePaths === options.maxPaths || replayPageSteps === options.maxSteps) {
        replayPagePaths = 0; replayPageSteps = 0;
      }
      trim();
    }
    if (totalSteps !== offset || (offset && (!stack.length || replayPagePaths || replayPageSteps))) {
      throw new Error('Invalid path continuation boundary');
    }
  };
  replay();
  if (!offset && start === target && (nodeIds.has(start) || knownNodeIds?.has(start))) paths.push({ nodeIds: [start], factIds: [] });
  while (stack.length && paths.length < options.maxPaths && totalSteps - offset < options.maxSteps && totalSteps < searchLimit) {
    const path = step();
    if (path) paths.push(path);
    trim();
  }
  const pending = stack.flatMap((frame, index) => {
    const entries = adjacency.get(frame.nodeId) ?? [];
    return frame.next < entries.length ? [{ nodeId: frame.nodeId,
      viaFactIds: stack.slice(1, index + 1).map(item => item.via!), nextFactId: entries[frame.next]!.id,
      remainingCandidates: entries.length - frame.next }] : [];
  });
  const exhaustedWithinDepth = stack.length === 0;
  const stopReason = () => {
    if (exhaustedWithinDepth) return 'exhausted' as const;
    if (totalSteps === searchLimit) return 'search-limit' as const;
    if (paths.length === options.maxPaths) return 'path-page-limit' as const;
    return 'work-page-limit' as const;
  };
  return { paths, frontier: { pending, depthLimited: { count: depthCount, examples: depthExamples,
    omitted: depthCount - depthExamples.length } }, search: { searchLimit, replayedSteps: offset,
    examinedSteps: totalSteps - offset, totalSteps, stopReason: stopReason(), exhaustedWithinDepth,
    depthLimitReached: depthCount > 0, truncated: !exhaustedWithinDepth || depthCount > 0 } };
}
