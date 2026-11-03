import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { stableJsonDigest, type ContextPack } from '@weftlet/core';
import { createContextGraphApplication } from '../../src/application/application.js';
import { evidenceBytes } from '../retrieval-study/preservation.js';
import { sameGroupFiles } from '../../tests/fixtures/same-group-project.js';

const [packageArg, rootArg, reportPath] = process.argv.slice(2);
if (!packageArg || !rootArg || !reportPath) throw Error('Usage: tsx scripts/same-group-study/entrypoints.ts <built-package-root> <saved-public-root> <comparison.json>');
const packageRoot = resolve(packageArg), root = resolve(rootArg);
const expected = JSON.parse(await readFile(reportPath, 'utf8'));
assert(['specific', 'symmetric'].includes(expected.mode));
const files = await sameGroupFiles(expected.mode);
for (const [path, content] of Object.entries(files)) assert.equal(await readFile(join(root, path), 'utf8'), content);
assert.equal(stableJsonDigest(files), expected.fixtureDigest);
const config = join(root, 'context-graph.config.json');
const app = await createContextGraphApplication(config);
const before = await evidenceBytes(app.storageRoot);
const snapshot = await app.snapshotStore.readHead('default');
assert.equal(snapshot?.manifest.contentDigest, expected.contentDigest);
const client = new Client({ name: 'public-same-group-check', version: '1' });
const returned = [];
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(packageRoot, 'dist/mcp.js')],
    cwd: tmpdir(), env: { ...process.env, CONTEXT_GRAPH_CONFIG: config } as Record<string, string>, stderr: 'pipe' }));
  const description = (await client.listTools()).tools.find(tool => tool.name === 'graph.paths')!.description!;
  assert(description.includes('Shortest-first') && description.includes('not proof of causality') && !description.includes('Depth-first'));
  let cliContinuation: string | undefined, mcpContinuation: string | undefined;
  for (let page = 0; page < 3; page++) {
    const args = [join(packageRoot, 'dist/cli.js'), 'impact', 'scan', '--config', config, '--snapshot', expected.snapshotId,
      '--changed-file', 'src/catalog.ts', '--max-depth', '3', '--max-facts', '60', '--json'];
    if (cliContinuation) args.push('--continuation', cliContinuation);
    const output = await promisify(execFile)(process.execPath, args, { cwd: tmpdir(), timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    const cli: ContextPack = JSON.parse(output.stdout);
    const response = await client.callTool({ name: 'impact.scan', arguments: { snapshotId: expected.snapshotId,
      changedFiles: ['src/catalog.ts'], maxDepth: 3, maxFacts: 60, ...(mcpContinuation ? { continuation: mcpContinuation } : {}) } });
    assert(!response.isError);
    const content = response.content as { type: string; text: string }[];
    const mcp: ContextPack = JSON.parse(content[1]!.text);
    assert.deepEqual(mcp.facts, cli.facts);
    assert.deepEqual(cli.facts.map(fact => fact.id), expected.returnedFactIds.slice(page * 60, (page + 1) * 60));
    for (const pack of [cli, mcp]) {
      assert.equal(pack.exploration?.reachableFacts, expected.reachable);
      assert.equal(pack.exploration?.rankingVersion, expected.rankingVersion);
      assert(pack.exploration.truncated && pack.exploration.continuation);
    }
    returned.push(...cli.facts); cliContinuation = cli.exploration!.continuation; mcpContinuation = mcp.exploration!.continuation;
  }
} finally { await client.close(); }
for (const target of expected.targets) if (target.returned) {
  assert.deepEqual(returned.find(fact => fact.id === target.fact.id), target.fact);
}
assert.deepEqual(await evidenceBytes(app.storageRoot), before);
console.log(JSON.stringify({ mode: expected.mode, cliMcpPagesAgree: 3, returned: returned.length,
  reachable: expected.reachable, ranking: expected.rankingVersion, storedFilesUnchanged: Object.keys(before).length,
  modelCalls: 0, hydration: false }));
