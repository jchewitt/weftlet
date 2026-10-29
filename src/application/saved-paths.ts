import type { GraphPathQueryService, GraphPathsRequest } from '@weftlet/core';
import type { GitRepository } from '../repository/git.js';
import { renderGraphPaths } from '../graph/paths-renderer.js';
import { inspectSavedEvidence } from './saved-evidence.js';

export class SavedGraphPathService implements GraphPathQueryService {
  constructor(private readonly queries: GraphPathQueryService, private readonly repository: GitRepository,
    private readonly configurationDigest: string, private readonly expectedExtractors?: Readonly<Record<string, string>>) {}

  async paths(request: GraphPathsRequest) {
    const result = await this.queries.paths(request);
    const evidenceState = await inspectSavedEvidence(result.snapshot, this.repository,
      this.configurationDigest, this.expectedExtractors);
    const withState = { ...result, evidenceState };
    return { ...withState, markdown: renderGraphPaths(withState) };
  }
}
