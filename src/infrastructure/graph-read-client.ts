import type { ContextPack, ImpactScanRequest, GraphCatalog, GraphCatalogRequest, GraphFactDetail, GraphFactRequest, GraphNeighborhood,
  GraphNeighborsRequest, GraphPaths, GraphPathsRequest } from '@weftlet/core';

export const graphReadPath = 'api/v1/query';

export interface GraphReadClientOptions {
  /** Service directory, including any deployment prefix. */
  readonly baseUrl: string | URL;
  readonly snapshotId: string;
  /** Compare the digest reported in each response with a trusted manifest digest. */
  readonly contentDigest?: string;
  readonly fetch?: typeof fetch;
}

type Pinned<T> = Omit<T, 'snapshotId'> & { readonly snapshotId?: string };

export interface GraphReadClient {
  scan(request: Pinned<ImpactScanRequest>): Promise<ContextPack>;
  catalog(request?: Pinned<GraphCatalogRequest>): Promise<GraphCatalog>;
  neighbors(request: Pinned<GraphNeighborsRequest>): Promise<GraphNeighborhood>;
  fact(request: Pinned<GraphFactRequest>): Promise<GraphFactDetail>;
  paths(request: Pinned<GraphPathsRequest>): Promise<GraphPaths>;
}

/** Browser and Node client for bounded queries against a single saved snapshot. */
export function createGraphReadClient({ baseUrl, snapshotId, contentDigest, fetch: send = fetch }: GraphReadClientOptions): GraphReadClient {
  const endpoint = new URL(baseUrl);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('Expected an HTTP(S) service directory URL without credentials, query or fragment');
  }
  if (!snapshotId.trim()) throw new Error('A saved snapshot ID is required');
  endpoint.pathname = endpoint.pathname.replace(/\/?$/, '/') + graphReadPath;

  async function query<T extends { snapshot: GraphCatalog['snapshot'] }>(method: string, params: { readonly snapshotId?: string }): Promise<T> {
    if (params.snapshotId !== undefined && params.snapshotId !== snapshotId) throw new Error('Query must use the pinned snapshot');
    const response = await send(endpoint.href, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      redirect: 'error', body: JSON.stringify({ method, params: { ...params, snapshotId } }) });
    if (!response.ok) {
      const error = await response.json().catch(() => undefined);
      throw new Error(`Graph read failed (HTTP ${response.status})${typeof error?.error === 'string' ? ': ' + error.error : ''}`);
    }
    const result: T = await response.json();
    if (result?.snapshot?.snapshotId !== snapshotId || (contentDigest !== undefined && result.snapshot.contentDigest !== contentDigest)) {
      throw new Error('Graph response does not match the pinned snapshot');
    }
    return result;
  }
  return {
    scan: request => query('impact.scan', request),
    catalog: (request = {}) => query('graph.catalog', request),
    neighbors: request => query('graph.neighbors', request),
    fact: request => query('graph.fact', request),
    paths: request => query('graph.paths', request),
  };
}
