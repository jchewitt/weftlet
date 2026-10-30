import type { CodeCoverageService } from '@weftlet/core';
import { parseCodeCoverageRequest } from '../graph/code-coverage-request.js';
import { parseGraphQueryArgs } from './graph-query-args.js';

export const graphCoverageTool = {
  name: 'graph.coverage',
  description: 'Inspect saved TypeScript-family source coverage. Page package boundaries, then select an exact projectRoot to page files. Distinguishes code-root selection, requested index entries, observed SCIP documents, cross-package references and unresolved evidence. Missing or zero observations never prove no impact. Does not rebuild evidence.',
  inputSchema: { type: 'object' as const, additionalProperties: false, required: ['snapshotId'], properties: {
    snapshotId: { type: 'string', minLength: 1, maxLength: 256 }, projectRoot: { type: 'string', minLength: 1, maxLength: 8192 },
    maxItems: { type: 'integer', minimum: 1, maximum: 200, default: 50 }, continuation: { type: 'string', minLength: 1, maxLength: 2048 },
  } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};
export function handleCodeCoverage(service: CodeCoverageService, value: unknown) {
  return service.coverage(parseCodeCoverageRequest(value));
}
export function codeCoverageRequestFromArgs(args: readonly string[]) {
  return parseCodeCoverageRequest(parseGraphQueryArgs(args, 'coverage', {
    '--snapshot': 'snapshotId', '--project': 'projectRoot', '--max-items': 'maxItems', '--continuation': 'continuation',
  }));
}
