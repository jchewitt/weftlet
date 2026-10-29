// Extracted from core.ts; modified for standalone extraction; see docs/extraction-manifest.json.
/** A cited span in committed UTF-8 source; optional columns use one-based UTF-16 units. */
export interface SourceSpan {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly digest: string;
  readonly commitSha: string;
  /** Both columns must be present together; the end is exclusive. */
  readonly startColumn?: number;
  readonly endColumn?: number;
  readonly columnEncoding?: 'utf-16';
}
