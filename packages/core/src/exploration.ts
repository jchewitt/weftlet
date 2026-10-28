import type { ContextPack, GraphFact, GraphPredicate } from './core.js';

export type GraphDirection = 'incoming' | 'outgoing' | 'both';

/** Exact snapshot/node identifiers, normally taken from an impact Context Pack. */
export interface GraphNeighborsRequest {
  readonly snapshotId: string;
  readonly nodeId: string;
  readonly direction?: GraphDirection;
  readonly predicates?: readonly GraphPredicate[];
  readonly maxFacts?: number;
  readonly continuation?: string;
}

export interface GraphNeighborhood {
  readonly snapshot: ContextPack['snapshot'];
  readonly evidenceState?: ContextPack['evidenceState'];
  /** Absence means no assertion in this saved snapshot mentions the exact ID. */
  readonly focus: { readonly nodeId: string; readonly status: 'present' | 'absent-from-snapshot' };
  /** All node descriptions/attributes and authority remain on their cited assertions. */
  readonly facts: readonly GraphFact[];
  readonly coverage: ContextPack['coverage'];
  readonly diagnostics: ContextPack['diagnostics'];
  readonly selection: {
    readonly version: string;
    readonly direction: GraphDirection;
    readonly predicates: readonly GraphPredicate[];
    readonly maxFacts: number;
    readonly incidentFacts: number;
    readonly matchingFacts: number;
    readonly filteredFacts: number;
    readonly offset: number;
    readonly returnedFacts: number;
    readonly remainingFacts: number;
    readonly truncated: boolean;
    readonly continuation?: string;
  };
  readonly frontier: {
    readonly scope: 'selected-one-hop-neighborhood';
    readonly totalNeighbors: number;
    /** Distinct selected neighbors not seen in this or earlier pages. */
    readonly remainingNeighbors: number;
    readonly neighbors: readonly {
      readonly nodeId: string;
      readonly factIds: readonly string[];
      /** Incident facts not touching the focus, irrespective of this request's filters. */
      readonly otherIncidentFacts: number;
    }[];
  };
  readonly markdown: string;
}

export interface GraphExplorationService {
  neighbors(request: GraphNeighborsRequest): Promise<GraphNeighborhood>;
}
