import type { ContextPack, GraphFact, GraphPredicate } from './core.js';
import type { GraphDirection } from './exploration.js';

export interface GraphPathsRequest {
  readonly snapshotId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly direction?: GraphDirection;
  readonly predicates?: readonly GraphPredicate[];
  readonly maxDepth?: number;
  readonly maxPaths?: number;
  /** New candidate-edge examinations per page; replay is reported separately. */
  readonly maxSteps?: number;
  readonly continuation?: string;
}

export interface EvidencePath {
  readonly nodeIds: readonly string[];
  readonly factIds: readonly string[];
}

export interface PathFrontier {
  /** Unexamined adjacency candidates on each active DFS prefix, not a count of paths. */
  readonly pending: readonly {
    readonly nodeId: string;
    readonly viaFactIds: readonly string[];
    readonly nextFactId: string;
    readonly remainingCandidates: number;
  }[];
  readonly depthLimited: {
    readonly count: number;
    readonly examples: readonly {
      readonly nodeId: string;
      readonly viaFactIds: readonly string[];
      readonly nextFactId: string;
      readonly nextNodeId: string;
    }[];
    readonly omitted: number;
  };
}

export interface GraphPaths {
  readonly snapshot: ContextPack['snapshot'];
  readonly evidenceState?: ContextPack['evidenceState'];
  readonly endpoints: {
    readonly from: { readonly nodeId: string; readonly status: 'present' | 'absent-from-snapshot' };
    readonly to: { readonly nodeId: string; readonly status: 'present' | 'absent-from-snapshot' };
  };
  readonly paths: readonly EvidencePath[];
  /** Union of the page's supporting assertions, preserved unchanged. */
  readonly facts: readonly GraphFact[];
  readonly coverage: ContextPack['coverage'];
  readonly diagnostics: ContextPack['diagnostics'];
  readonly search: {
    readonly version: string;
    readonly order: 'fact-id-depth-first';
    readonly direction: GraphDirection;
    readonly predicates: readonly GraphPredicate[];
    readonly maxDepth: number;
    readonly maxPaths: number;
    readonly maxSteps: number;
    readonly searchLimit: number;
    readonly replayedSteps: number;
    readonly examinedSteps: number;
    readonly totalSteps: number;
    readonly stopReason: 'exhausted' | 'path-page-limit' | 'work-page-limit' | 'search-limit';
    readonly exhaustedWithinDepth: boolean;
    readonly depthLimitReached: boolean;
    readonly truncated: boolean;
    readonly continuation?: string;
  };
  readonly frontier: PathFrontier;
  readonly markdown: string;
}

export interface GraphPathQueryService {
  paths(request: GraphPathsRequest): Promise<GraphPaths>;
}
