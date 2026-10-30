/** Measured against a saved committed tree (or the captured tree of a draft overlay). */
export interface CodeInventoryFile {
  readonly path: string;
  readonly blobId: string;
  readonly projectRoot: string;
  readonly codeRootSelected: boolean;
  readonly requested: 'included' | 'excluded' | 'unknown';
  readonly indexed?: boolean;
}
export interface CodeInventory {
  readonly version: 'committed-code-inventory-v1';
  readonly digest: string;
  readonly scipIndexDigest: string;
  readonly selection: 'source-project' | 'indexer-command';
  readonly indexObservation: 'recorded' | 'unavailable';
  readonly codeRoots: readonly string[];
  readonly includePatterns?: readonly string[];
  /** Nearest package.json boundaries, not inferred compiler projects or workspace membership. */
  readonly projects: readonly { readonly root: string; readonly manifest?: { readonly path: string; readonly blobId: string } }[];
  /** All regular committed .ts/.tsx/.mts/.cts files, including declarations and omitted packages. */
  readonly files: readonly CodeInventoryFile[];
  readonly otherIndexedFiles?: number;
}
export interface CodeCoverageCounts {
  readonly files: number;
  readonly codeRootSelected: number;
  readonly requested: number;
  readonly excludedFromRequest: number;
  readonly requestUnknown: number;
  readonly indexed: number;
  readonly indexUnknown: number;
  readonly requestedNotIndexed: number;
  readonly indexedOutsideRequest: number;
  readonly references: number;
  readonly unresolvedReferences: number;
  readonly declarationOnlyReferences: number;
  readonly implementationGaps: number;
}
export interface CodeCoverageOverview {
  readonly scope: 'saved-snapshot';
  readonly status: 'recorded' | 'unavailable' | 'invalid-inventory';
  readonly inventoryDigest?: string;
  readonly selection?: CodeInventory['selection'];
  readonly indexObservation?: CodeInventory['indexObservation'];
  readonly projects?: number;
  readonly totals?: CodeCoverageCounts;
  readonly crossProjectReferences?: number;
  readonly otherIndexedFiles?: number;
  readonly limitations: readonly string[];
}
export interface CodeFileCoverage extends CodeInventoryFile {
  readonly nodeId: string;
  readonly references: number;
  readonly unresolvedReferences: number;
  readonly declarationOnlyReferences: number;
  readonly implementationGaps: number;
}
export interface CodeProjectCoverage {
  readonly root: string;
  readonly manifestPath?: string;
  readonly counts: CodeCoverageCounts;
  readonly connectedProjects: number;
  readonly outgoingReferences: number;
  readonly incomingReferences: number;
}
