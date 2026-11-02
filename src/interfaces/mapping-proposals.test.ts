import { expect, it } from 'vitest';
import { parseMappingRequest } from '../extraction/mapping-request.js';
import { mappingPlanTool, mappingReadTool, parseMappingRead } from './mapping-proposals.js';

const request = { snapshotId: 'saved', ruleId: 'invariant:public', documentPath: 'docs/owner.md', files: ['src/public.ts'] };
it('bounds operation inputs and exposes only no-model read-only MCP operations', () => {
  expect(parseMappingRequest(request)).toEqual({ ...request, maxCandidates: 8, maxInputBytes: 32768 });
  for (const tool of [mappingPlanTool, mappingReadTool]) expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  expect(parseMappingRead({ snapshotId: 'saved', key: 'a'.repeat(64) })).toEqual({ snapshotId: 'saved', key: 'a'.repeat(64) });
});
it.each([
  { files: [] }, { files: ['src/a.ts', 'src/a.ts'] }, { files: ['../private'] }, { files: ['/absolute.ts'] },
  { files: ['src\\private.ts'] }, { documentPath: '.git/config' }, { files: ['src/x:stream'] },
  { maxCandidates: null }, { maxCandidates: 21 }, { maxInputBytes: 131073 }, { maxInputBytes: 1.5 },
  { allowModel: true }, { ruleId: '' }, { snapshotId: 'x'.repeat(257) },
])('rejects invalid mapping scope %j', change => { expect(() => parseMappingRequest({ ...request, ...change })).toThrow(); });
it.each([{}, { snapshotId: 'saved', key: '../escape' }, { snapshotId: '', key: 'a'.repeat(64) }, { snapshotId: 'saved', key: 'a'.repeat(64), allowModel: true }])(
  'rejects invalid saved-proposal read %j', input => { expect(() => parseMappingRead(input)).toThrow(); });
