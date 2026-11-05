import type { GraphCatalogRequest, GraphDiscoveryService, GraphFactRequest } from '@weftlet/core';
import type { GitRepository } from '../repository/git.js';
import { renderGraphCatalog, renderGraphFact } from '../graph/discovery.js';
import { inspectSavedEvidence } from './saved-evidence.js';

export class SavedGraphDiscoveryService implements GraphDiscoveryService {
  constructor(private readonly queries: GraphDiscoveryService, private readonly repository: GitRepository,
    private readonly configurationDigest: string, private readonly expectedExtractors?: Readonly<Record<string, string>>) {}
  async catalog(request: GraphCatalogRequest) {
    const result = await this.queries.catalog(request);
    const evidenceState = await inspectSavedEvidence(result.snapshot, this.repository, this.configurationDigest, this.expectedExtractors);
    const withState = { ...result, evidenceState };
    return { ...withState, markdown: renderGraphCatalog(withState) };
  }
  async fact(request: GraphFactRequest) {
    const result = await this.queries.fact(request);
    const evidenceState = await inspectSavedEvidence(result.snapshot, this.repository, this.configurationDigest, this.expectedExtractors);
    const withState = { ...result, evidenceState };
    return { ...withState, markdown: renderGraphFact(withState) };
  }
}
