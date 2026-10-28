import type { ContextPack, ImpactQueryService, ImpactScanRequest } from "@weftlet/core";
import type { GitRepository } from "../repository/git.js";
import { MarkdownContextPackRenderer } from "../graph/query.js";
import { inWorkingScope, readWorkingContent } from "../repository/working-content.js";
import { sha256 } from "../infrastructure/util.js";
import { incompatibleSnapshotExtractors } from './extraction-identity.js';

/** Read-side metadata; never calls an indexer, model, compiler, or refresh operation. */
export class SavedEvidenceQueryService implements ImpactQueryService {
  constructor(
    private readonly queries: ImpactQueryService,
    private readonly repository: GitRepository,
    private readonly configurationDigest: string,
    private readonly expectedExtractors?: Readonly<Record<string, string>>,
  ) {}

  async scan(request: ImpactScanRequest) {
    const pack = await this.queries.scan(request);
    const evidenceState = await inspectSavedEvidence(pack.snapshot, this.repository, this.configurationDigest, this.expectedExtractors);
    const result = { ...pack, evidenceState };
    return { ...result, markdown: new MarkdownContextPackRenderer().render(result) };
  }
}

/** Shared read-side state for impact scans and exact-node exploration. */
export async function inspectSavedEvidence(
  snapshot: ContextPack['snapshot'],
  repository: GitRepository,
  configurationDigest: string,
  expectedExtractors?: Readonly<Record<string, string>>,
): Promise<NonNullable<ContextPack['evidenceState']>> {
  const currentCommit = await repository.resolveRef('HEAD').catch(() => undefined);
  const workingChanges = await repository.workingChanges();
  const capturedWorkingChanges: string[] = [];
  const changedSinceCapture = new Set<string>();
  let overlayFreshness: 'current' | 'stale' | 'unknown' | undefined;
  if (snapshot.overlayDigest) {
    overlayFreshness = 'unknown';
    const capture = snapshot.overlayCapture;
    if (capture) {
      overlayFreshness = 'current';
      for (const file of capture.files) {
        try {
          const content = await readWorkingContent(repository.root, file.path);
          if ((content === null ? null : sha256(content)) === file.digest) capturedWorkingChanges.push(file.path);
          else changedSinceCapture.add(file.path);
        } catch {
          overlayFreshness = 'unknown';
          changedSinceCapture.add(file.path);
        }
      }
      for (const path of workingChanges) {
        if (!capturedWorkingChanges.includes(path) && inWorkingScope(path, capture.sourcePatterns)) changedSinceCapture.add(path);
      }
      if (changedSinceCapture.size && overlayFreshness !== 'unknown') overlayFreshness = 'stale';
    }
  }
  const excludedWorkingChanges = workingChanges.filter((path) => !capturedWorkingChanges.includes(path));
  const incompatibleExtractors = expectedExtractors
    ? incompatibleSnapshotExtractors(snapshot.extractorVersions, expectedExtractors) : undefined;
  return {
    currentCommit,
    excludedWorkingChanges,
    ...(overlayFreshness ? { overlayFreshness, capturedWorkingChanges, changedSinceCapture: [...changedSinceCapture].sort() } : {}),
    stale: currentCommit !== snapshot.commitSha || (overlayFreshness !== undefined && overlayFreshness !== 'current'),
    configurationMatches: snapshot.configurationDigest === configurationDigest,
    ...(incompatibleExtractors ? { extractionCompatible: incompatibleExtractors.length === 0, incompatibleExtractors } : {}),
    eligibleForCurrentDiffValidation: false as const,
  };
}
