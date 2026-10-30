import { expect, it } from 'vitest';
import { parseContractCompatibilityRequest } from '../graph/compatibility-request.js';
import { graphCompatibilityRequestFromArgs, graphCompatibilityTool, handleGraphCompatibility } from './graph-compatibility.js';

const request = { snapshotId: 'saved', producerFactId: 'producer', consumerFactId: 'consumer' };
it('shares exact selection and read-only semantics across CLI and MCP', async () => {
  const parsed = graphCompatibilityRequestFromArgs(['--snapshot', 'saved', '--producer-fact', 'producer',
    '--consumer-fact', 'consumer', '--json', '--config', 'local.json']);
  expect(parsed).toEqual(request); expect(graphCompatibilityTool.annotations.readOnlyHint).toBe(true);
  expect(graphCompatibilityTool.inputSchema.additionalProperties).toBe(false);
  let received;
  await handleGraphCompatibility({ assess: async value => { received = value; throw Error('stop'); } }, parsed)
    .catch(error => expect(error.message).toBe('stop'));
  expect(received).toEqual(request);
});
it.each([null, [], {}, { ...request, snapshotId: ' ' }, { ...request, producerFactId: 3 },
  { ...request, consumerFactId: 'producer' }, { ...request, snapshotId: 'x'.repeat(257) },
  { ...request, approved: true }, { ...request, consumerFactId: 'x'.repeat(8193) },
])('rejects invalid or authority-changing input %j', value => expect(() => parseContractCompatibilityRequest(value)).toThrow());
it.each([[], ['--snapshot'], ['--snapshot', 's', '--snapshot', 't'], ['--task', 'guess'],
  ['--snapshot', '--producer-fact'], ['--producer-fact', 'p'],
].map(args => ({ args })))('rejects malformed CLI arguments $args', ({ args }) => expect(() => graphCompatibilityRequestFromArgs(args)).toThrow());
