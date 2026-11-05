import type { GraphCatalog, GraphCatalogView, GraphDiagnostic } from '@weftlet/core';
import type { CatalogEntry } from '../graph/discovery-projection.js';

export interface PortableReportScope {
  readonly scope: 'focused-report';
  readonly indexFile: string;
  readonly roots: readonly string[];
  readonly depth: number;
  readonly includedFacts: number;
  readonly expandedNodes: number;
  readonly frontierNodes: number;
  readonly sourceFacts: number;
  readonly sourceNodes: number;
}
/** Read tables derived from the pinned source, never a replacement GraphSnapshot. */
export interface PortableEvidenceIndex {
  readonly version: 1;
  readonly evidenceDigest: string;
  readonly roots: readonly string[];
  readonly depth: number;
  readonly overview: GraphCatalog['overview'];
  readonly catalogs: Readonly<Record<GraphCatalogView, readonly CatalogEntry[]>>;
  readonly expanded: readonly { readonly nodeId: string; readonly factIds: readonly string[] }[];
  readonly degrees: readonly { readonly nodeId: string; readonly count: number }[];
  readonly facts: readonly { readonly factId: string; readonly chunk: string }[];
  readonly diagnostics: readonly GraphDiagnostic[];
}
