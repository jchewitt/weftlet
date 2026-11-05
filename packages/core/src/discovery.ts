import type { ContextPack, DiagnosticKind, GraphFact, GraphNode, SourceSpan } from './core.js';

/** Navigation facets, not new evidence authority or graph relationships. */
export type GraphCatalogView = 'intent' | 'contracts' | 'implementation' | 'evidence' | 'all';
export interface GraphCatalogRequest {
  readonly snapshotId: string;
  readonly view?: GraphCatalogView;
  /** Case-insensitive literal substring of a saved node ID, label, or citation path. */
  readonly search?: string;
  readonly maxNodes?: number;
  readonly continuation?: string;
}
export interface GraphCatalogNode {
  readonly node: GraphNode;
  /** Presentation representative only; differing labels/attributes remain on exact facts. */
  readonly representativeFactId: string;
  readonly citation: SourceSpan;
  readonly incidentFacts: number;
  readonly matchingFacts: number;
  readonly authorities: Readonly<Record<string, number>>;
  readonly sourceAuthorities: Readonly<Record<string, number>>;
  readonly extractionReviews: Readonly<Record<string, number>>;
}
export interface GraphCatalog {
  readonly snapshot: ContextPack['snapshot'];
  readonly evidenceState?: ContextPack['evidenceState'];
  readonly nodes: readonly GraphCatalogNode[];
  readonly overview: {
    readonly scope: 'saved-snapshot';
    readonly facts: number;
    readonly nodes: number;
    readonly views: Readonly<Record<GraphCatalogView, { readonly facts: number; readonly nodes: number }>>;
    readonly diagnosticCounts: Readonly<Record<DiagnosticKind, number>>;
    readonly unclassifiedLegacyDiagnostics: number;
    readonly code: NonNullable<ContextPack['coverage']['code']>;
    readonly limitations: readonly string[];
  };
  readonly selection: {
    readonly version: string;
    readonly view: GraphCatalogView;
    readonly search: string;
    readonly maxNodes: number;
    readonly matchingNodes: number;
    readonly offset: number;
    readonly returnedNodes: number;
    readonly remainingNodes: number;
    readonly truncated: boolean;
    readonly continuation?: string;
  };
  readonly markdown: string;
}
export interface GraphFactRequest { readonly snapshotId: string; readonly factId: string }
export interface GraphFactDetail {
  readonly snapshot: ContextPack['snapshot'];
  readonly evidenceState?: ContextPack['evidenceState'];
  readonly status: 'present' | 'absent-from-snapshot';
  readonly factId: string;
  readonly fact?: GraphFact;
  readonly diagnostics: ContextPack['diagnostics'];
  readonly markdown: string;
}
export interface GraphDiscoveryService {
  catalog(request: GraphCatalogRequest): Promise<GraphCatalog>;
  fact(request: GraphFactRequest): Promise<GraphFactDetail>;
}
