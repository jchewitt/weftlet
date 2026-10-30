import type { CodeCoverageRequest, CodeCoverageService } from '@weftlet/core';
import type { GitRepository } from '../repository/git.js';
import { renderCodeCoverage } from '../graph/code-coverage-renderer.js';
import { inspectSavedEvidence } from './saved-evidence.js';

export class SavedCodeCoverageService implements CodeCoverageService {
  constructor(private readonly queries: CodeCoverageService, private readonly repository: GitRepository,
    private readonly configurationDigest: string, private readonly expectedExtractors?: Readonly<Record<string, string>>) {}
  async coverage(request: CodeCoverageRequest) {
    const report = await this.queries.coverage(request);
    const evidenceState = await inspectSavedEvidence(report.snapshot, this.repository, this.configurationDigest, this.expectedExtractors);
    const result = { ...report, evidenceState };
    return { ...result, markdown: renderCodeCoverage(result) };
  }
}
