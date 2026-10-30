import type { ContractCompatibilityRequest, ContractCompatibilityService } from '@weftlet/core';
import type { GitRepository } from '../repository/git.js';
import { renderContractCompatibility } from '../graph/compatibility-renderer.js';
import { inspectSavedEvidence } from './saved-evidence.js';

export class SavedContractCompatibilityService implements ContractCompatibilityService {
  constructor(private readonly queries: ContractCompatibilityService, private readonly repository: GitRepository,
    private readonly configurationDigest: string, private readonly expectedExtractors?: Readonly<Record<string, string>>) {}
  async assess(request: ContractCompatibilityRequest) {
    const report = await this.queries.assess(request);
    const evidenceState = await inspectSavedEvidence(report.snapshot, this.repository, this.configurationDigest, this.expectedExtractors);
    const result = { ...report, evidenceState };
    return { ...result, markdown: renderContractCompatibility(result) };
  }
}
