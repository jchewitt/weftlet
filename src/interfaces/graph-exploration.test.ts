import { expect, it } from 'vitest';
import { graphPredicates } from '@weftlet/core';
import { graphNeighborsRequestFromArgs, graphNeighborsTool, handleGraphNeighbors } from './graph-exploration.js';
import { semanticOutputSchema } from '../extraction/semantic.js';

it('keeps static-only calls out of semantic extraction while allowing agent queries', () => {
  const schema = semanticOutputSchema(4) as { properties: { assertions: { items: { properties: { predicate: { enum: string[] } } } } } };
  expect(Object.isFrozen(graphPredicates)).toBe(true);
  expect(schema.properties.assertions.items.properties.predicate.enum).toEqual(graphPredicates.filter(predicate => predicate !== 'calls'));
  expect(graphNeighborsRequestFromArgs(['--snapshot', 'saved', '--node', 'code:x', '--predicate', 'calls']).predicates).toEqual(['calls']);
  expect(graphNeighborsTool.inputSchema.properties.predicates.items.enum).toEqual(graphPredicates);
});

it('passes a normalized explicit query through CLI and MCP without treating an exact ID as a search', async () => {
  const request = graphNeighborsRequestFromArgs(['--snapshot', 'saved', '--node', 'component:file:a.ts',
    '--direction', 'incoming', '--predicate', 'consumes', '--predicate', 'references', '--max-facts', '2', '--json', '--config', 'local.json']);
  expect(request).toEqual({ snapshotId: 'saved', nodeId: 'component:file:a.ts', direction: 'incoming',
    predicates: ['consumes', 'references'], maxFacts: 2 });
  let received: unknown;
  await handleGraphNeighbors({ neighbors: async value => { received = value; throw Error('test-stop'); } }, request)
    .catch(error => expect(error.message).toBe('test-stop'));
  expect(received).toEqual(request);
});

it.each([
  [], ['--snapshot', 'saved'], ['--snapshot'], ['--snapshot', '--node', 'n'],
  ['--snapshot', 'saved', '--node', 'n', '--max-facts', '201'],
  ['--snapshot', 'saved', '--node', 'n', '--task', 'search'],
  ['--snapshot', 'saved', '--node', 'n', '--direction', 'sideways'],
  ['--snapshot', 'saved', '--node', 'n', '--node', 'other'],
])('rejects malformed or unsupported CLI options %j', args => {
  expect(() => graphNeighborsRequestFromArgs(args)).toThrow();
});
