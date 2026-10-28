import type { GraphExplorationService, GraphNeighborsRequest } from '@weftlet/core';
import type { GitRepository } from '../repository/git.js';
import { renderGraphNeighborhood } from '../graph/neighborhood-renderer.js';
import { inspectSavedEvidence } from './saved-evidence.js';

/** Adds checkout/overlay state without extracting, refreshing or changing a saved graph. */
export class SavedGraphExplorationService implements GraphExplorationService {
  constructor(
    private readonly queries: GraphExplorationService,
    private readonly repository: GitRepository,
    private readonly configurationDigest: string,
    private readonly expectedExtractors?: Readonly<Record<string, string>>,
  ) {}

  async neighbors(request: GraphNeighborsRequest) {
    const result = await this.queries.neighbors(request);
    const evidenceState = await inspectSavedEvidence(result.snapshot, this.repository,
      this.configurationDigest, this.expectedExtractors);
    const withState = { ...result, evidenceState };
    return { ...withState, markdown: renderGraphNeighborhood(withState) };
  }
}
