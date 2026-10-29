import { expect, it } from 'vitest';
import { graphPredicates } from '@weftlet/core';
import { graphPathsRequestFromArgs, graphPathsTool, handleGraphPaths } from './graph-paths.js';

it('shares normalized bounded requests and predicate vocabulary between CLI and MCP', async () => {
  expect(graphPathsTool.inputSchema.properties.predicates.items.enum).toEqual(graphPredicates);
  const request = graphPathsRequestFromArgs(['--snapshot', 's', '--from', 'a', '--to', 'b', '--direction', 'both',
    '--predicate', 'references', '--max-depth', '12', '--max-paths', '2', '--max-steps', '10', '--json', '--config', 'local.json']);
  expect(request).toEqual({ snapshotId: 's', fromNodeId: 'a', toNodeId: 'b', direction: 'both', predicates: ['references'], maxDepth: 12, maxPaths: 2, maxSteps: 10 });
  let received;
  await handleGraphPaths({ paths: async value => { received = value; throw Error('stop'); } }, request).catch(error => expect(error.message).toBe('stop'));
  expect(received).toEqual(request);
});

it.each([[], ['--snapshot', 's'], ['--from'], ['--snapshot', '--to', 't'],
  ['--snapshot', 's', '--from', 'a', '--to', 'b', '--to', 'c'],
  ['--snapshot', 's', '--from', 'a', '--to', 'b', '--task', 'text'],
  ['--snapshot', 's', '--from', 'a', '--to', 'b', '--max-depth', '33'],
])('rejects malformed path CLI arguments %j', args => expect(() => graphPathsRequestFromArgs(args)).toThrow());
