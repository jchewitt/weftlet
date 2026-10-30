import type { ContextPack } from './core.js';
import type { CodeCoverageOverview, CodeFileCoverage, CodeProjectCoverage } from './code-coverage.js';

export interface CodeCoverageRequest {
  readonly snapshotId: string;
  /** Omit to page package boundaries; select an exact returned root to page its files. */
  readonly projectRoot?: string;
  readonly maxItems?: number;
  readonly continuation?: string;
}
export interface CodeCoverageReport {
  readonly snapshot: ContextPack['snapshot'];
  readonly evidenceState?: ContextPack['evidenceState'];
  readonly overview: CodeCoverageOverview;
  readonly view: 'projects' | 'files';
  readonly project?: CodeProjectCoverage;
  readonly projectStatus?: 'present' | 'absent' | 'unknown';
  readonly projects: readonly CodeProjectCoverage[];
  readonly files: readonly CodeFileCoverage[];
  readonly selection: { readonly projectRoot?: string; readonly maxItems: number; readonly offset: number;
    readonly total: number; readonly remaining: number; readonly truncated: boolean; readonly continuation?: string };
  readonly markdown: string;
}
export interface CodeCoverageService { coverage(request: CodeCoverageRequest): Promise<CodeCoverageReport> }
