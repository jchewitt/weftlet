import { expect, it } from 'vitest';
import { codeCoverageRequestFromArgs, graphCoverageTool, handleCodeCoverage } from './code-coverage.js';
import { parseCodeCoverageRequest } from '../graph/code-coverage-request.js';

it('shares normalized requests, explicit page bounds and read-only semantics', async () => {
  const request = codeCoverageRequestFromArgs(['--snapshot', 's', '--project', 'services/api', '--max-items', '2', '--json', '--config', 'local.json']);
  expect(request).toEqual({ snapshotId: 's', projectRoot: 'services/api', maxItems: 2 });
  expect(graphCoverageTool.annotations.readOnlyHint).toBe(true);
  let received;
  await handleCodeCoverage({ coverage: async value => { received = value; throw Error('stop'); } }, request).catch(e => expect(e.message).toBe('stop'));
  expect(received).toEqual(request);
  expect(parseCodeCoverageRequest({ snapshotId: 's' })).toEqual({ snapshotId: 's', maxItems: 50 });
});
it.each([null, [], {}, { snapshotId: '' }, { snapshotId: 's', maxItems: 0 }, { snapshotId: 's', maxItems: 201 },
  { snapshotId: 's', maxItems: 1.5 }, { snapshotId: 's', projectRoot: '' }, { snapshotId: 's', complete: true },
  { snapshotId: 's', maxItems: null }, { snapshotId: 's', continuation: 'x'.repeat(2049) }])('rejects invalid coverage requests %j', value => expect(() => parseCodeCoverageRequest(value)).toThrow());
it.each([[], ['--snapshot'], ['--project', 'x'], ['--snapshot', 's', '--snapshot', 's'], ['--snapshot', 's', '--unknown', 'x']]
  .map(args => ({ args })))('rejects malformed CLI arguments $args', ({ args }) => expect(() => codeCoverageRequestFromArgs(args)).toThrow());
