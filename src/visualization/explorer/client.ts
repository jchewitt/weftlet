import type { GraphCatalog, GraphCatalogRequest, GraphFactDetail, GraphFactRequest,
  GraphNeighborhood, GraphNeighborsRequest, GraphPaths, GraphPathsRequest } from '@weftlet/core';
import type { ExplorerDataSource, ExplorerMetadata } from '../explorer-contract.js';

export class LiveEvidenceSource implements ExplorerDataSource {
  constructor(readonly metadata: ExplorerMetadata) {}
  private async query<T>(method: string, params: unknown): Promise<T> {
    const response = await fetch('./api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Saved-evidence query failed');
    return result as T;
  }
  catalog(request: GraphCatalogRequest) { return this.query<GraphCatalog>('graph.catalog', request); }
  neighbors(request: GraphNeighborsRequest) { return this.query<GraphNeighborhood>('graph.neighbors', request); }
  fact(request: GraphFactRequest) { return this.query<GraphFactDetail>('graph.fact', request); }
  paths(request: GraphPathsRequest) { return this.query<GraphPaths>('graph.paths', request); }
}
