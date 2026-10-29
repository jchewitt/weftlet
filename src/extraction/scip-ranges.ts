import type { CodeRange } from '@weftlet/core';

export function comparePosition(line: number, column: number, otherLine: number, otherColumn: number): number {
  return line - otherLine || column - otherColumn;
}

export function containsRange(outer: CodeRange, inner: CodeRange): boolean {
  return comparePosition(outer.startLine, outer.startColumn, inner.startLine, inner.startColumn) <= 0 &&
    comparePosition(outer.endLine, outer.endColumn, inner.endLine, inner.endColumn) >= 0;
}

/** SCIP TypeScript uses zero-based UTF-16 positions; graph citations are one-based. */
export function scipRange(raw: readonly number[], lines: readonly string[], path: string): CodeRange {
  if ((raw.length !== 3 && raw.length !== 4) || raw.some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`Invalid SCIP range in ${path}`);
  }
  const startLine = raw[0]! + 1;
  const endLine = (raw.length === 3 ? raw[0]! : raw[2]!) + 1;
  // TypeScript's file reader strips a leading UTF-8 BOM. Citations address the
  // original committed text, whose first line retains that UTF-16 code unit.
  const firstLineOffset = lines[0]?.startsWith('\uFEFF') ? 1 : 0;
  const startColumn = raw[1]! + 1 + (startLine === 1 ? firstLineOffset : 0);
  const endColumn = raw.at(-1)! + 1 + (endLine === 1 ? firstLineOffset : 0);
  if (startLine > lines.length || endLine > lines.length || startColumn > lines[startLine - 1]!.length + 1 ||
      endColumn > lines[endLine - 1]!.length + 1 || comparePosition(startLine, startColumn, endLine, endColumn) > 0) {
    throw new Error(`SCIP range is outside committed source in ${path}`);
  }
  return { startLine, startColumn, endLine, endColumn, columnEncoding: 'utf-16' };
}

export function rangeText(range: CodeRange, lines: readonly string[]): string {
  if (range.startLine === range.endLine) return lines[range.startLine - 1]!.slice(range.startColumn - 1, range.endColumn - 1);
  return [lines[range.startLine - 1]!.slice(range.startColumn - 1),
    ...lines.slice(range.startLine, range.endLine - 1), lines[range.endLine - 1]!.slice(0, range.endColumn - 1)].join('\n');
}
