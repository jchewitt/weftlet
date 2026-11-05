import type { ContextPack, DiagnosticReport, GraphCatalog, GraphCatalogRequest, GraphFactDetail, GraphFactRequest, GraphPredicate,
  GraphNeighborhood, GraphNeighborsRequest, GraphPaths, GraphPathsRequest } from '@weftlet/core';
import type { PortableReportScope } from './portable-contract.js';

export interface ExplorerMetadata {
  readonly version: 1;
  readonly mode: 'local' | 'portable';
  readonly snapshot: ContextPack['snapshot'];
  readonly repositoryId: string;
  readonly evidenceDigest: string;
  readonly checkout?: { readonly checkedAt: string; readonly state: ContextPack['evidenceState'] };
  readonly diagnostics: DiagnosticReport;
  readonly capabilities: { readonly paths: boolean; readonly search: boolean };
  readonly predicates: readonly GraphPredicate[];
  readonly sourceUrlTemplate?: string;
  readonly report?: PortableReportScope;
}
export interface ExplorerDataSource {
  readonly metadata: ExplorerMetadata;
  canExplore?(nodeId: string): boolean;
  catalog(request: GraphCatalogRequest): Promise<GraphCatalog>;
  neighbors(request: GraphNeighborsRequest): Promise<GraphNeighborhood>;
  fact(request: GraphFactRequest): Promise<GraphFactDetail>;
  paths(request: GraphPathsRequest): Promise<GraphPaths>;
}
