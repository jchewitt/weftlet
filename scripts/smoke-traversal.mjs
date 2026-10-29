import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/** Run the installed CLI, provider contract and runtime assets from an independent packed consumer. */
export async function smokeTraversal(consumer, installedRoot, baseConfig, policy) {
  const config = { ...baseConfig, adapter: undefined, storagePath: '.context-graph/traversal-smoke',
    documentTraversal: { entryPoints: ['role-owner.md'], policy },
    semantic: { ...baseConfig.semantic, providerModule: './traversal-provider.mjs', maxDocuments: 2 } };
  await writeFile(join(consumer, 'traversal-provider.mjs'), `
export function createSemanticExtractor(config) {
  return { identity: config.providerIdentity, async extract(source) {
    const parsed = { assertions: [{ subject: { id: 'document:' + source.path, kind: 'Document', label: source.path },
      predicate: 'references', object: { id: 'capability:public-smoke', kind: 'Capability', label: 'Public smoke' },
      citation: { startLine: 1, endLine: 1 }, confidence: 1 }], diagnostics: [], oml: '' };
    return { parsed, rawModelOutput: JSON.stringify(parsed) };
  } };
}`);
  await writeFile(join(consumer, 'traversal.config.json'), JSON.stringify(config));
  const cli = (...args) => JSON.parse(execFileSync(process.execPath,
    [join(installedRoot, 'dist/cli.js'), ...args, '--config', 'traversal.config.json'],
    { cwd: consumer, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }));
  const plan = cli('hydrate', '--plan', '--json');
  if (!plan.ready || plan.estimates.extractions !== 2 || plan.documentSelection.documentPaths.length !== 4 ||
      plan.documentSelection.excluded.length !== 2) throw new Error('Installed traversal plan must exclude validation sources');
  const first = cli('hydrate', '--json', '--quiet');
  const repeated = cli('hydrate', '--json', '--quiet');
  if (first.semanticExtracted !== 2 || repeated.semanticExtracted !== 0 || repeated.semanticReused !== 2 ||
      first.snapshotId !== repeated.snapshotId || first.contentDigest !== repeated.contentDigest) {
    throw new Error('Installed traversal hydration must publish once and reuse unchanged module artifacts');
  }
  const pack = cli('impact', 'scan', '--owner-doc', 'role-owner.md', '--json');
  if (JSON.stringify(pack.snapshot.documentSelection) !== JSON.stringify(plan.documentSelection) ||
      !pack.facts.some(fact => fact.provenance.path === 'empty-review.md' && fact.sourceRole === 'validation') ||
      !pack.facts.some(fact => fact.provenance.path === 'draft-plan.md' && fact.sourceRole === 'plan' &&
        fact.sourceAuthority === 'inferred' && fact.authority === 'inferred' && fact.extractionReview === 'unreviewed')) {
    throw new Error('Installed saved queries must preserve traversal coverage and source/assertion authority');
  }
  const request = { snapshotId: first.snapshotId, nodeId: 'capability:public-smoke', direction: 'incoming',
    predicates: ['references'], maxFacts: 1 };
  const neighborhoodArgs = ['graph', 'neighbors', '--snapshot', request.snapshotId, '--node', request.nodeId,
    '--direction', request.direction, '--predicate', 'references', '--max-facts', '1', '--json'];
  const neighborhood = cli(...neighborhoodArgs);
  if (neighborhood.focus.status !== 'present' || neighborhood.selection.matchingFacts !== 2 ||
      !neighborhood.selection.continuation || neighborhood.frontier.remainingNeighbors !== 1) {
    throw new Error('Installed exact-ID neighborhood must expose pending evidence and neighbors');
  }
  const next = cli(...neighborhoodArgs, '--continuation', neighborhood.selection.continuation);
  const expected = pack.facts.filter(fact => fact.object.id === request.nodeId && fact.predicate === 'references');
  if (next.selection.truncated || next.selection.remainingFacts ||
      JSON.stringify([...neighborhood.facts, ...next.facts].sort((a, b) => a.id.localeCompare(b.id))) !==
      JSON.stringify(expected.sort((a, b) => a.id.localeCompare(b.id)))) {
    throw new Error('Installed neighborhood pagination must preserve all cited assertions and authority');
  }
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [join(installedRoot, 'dist/mcp.js')], cwd: consumer,
    env: { ...process.env, CONTEXT_GRAPH_CONFIG: join(consumer, 'traversal.config.json') }, stderr: 'pipe' });
  const client = new Client({ name: 'installed-exploration', version: '1' });
  try {
    await client.connect(transport);
    if (!(await client.listTools()).tools.some(tool => tool.name === 'graph.neighbors')) throw new Error('Missing graph.neighbors');
    const response = await client.callTool({ name: 'graph.neighbors', arguments: request });
    if (response.isError || JSON.stringify(JSON.parse(response.content[1].text)) !== JSON.stringify(neighborhood)) {
      throw new Error('Installed MCP and CLI exact-node exploration differ');
    }
    const pathRequest = { snapshotId: first.snapshotId, fromNodeId: expected[0].subject.id,
      toNodeId: expected[1].subject.id, direction: 'both', predicates: ['references'], maxSteps: 1, maxPaths: 1 };
    const pathArgs = ['graph', 'paths', '--snapshot', first.snapshotId, '--from', pathRequest.fromNodeId,
      '--to', pathRequest.toNodeId, '--direction', 'both', '--predicate', 'references', '--max-steps', '1', '--max-paths', '1', '--json'];
    let pathPage = cli(...pathArgs);
    const pathResponse = await client.callTool({ name: 'graph.paths', arguments: pathRequest });
    if (pathResponse.isError || JSON.stringify(JSON.parse(pathResponse.content[1].text)) !== JSON.stringify(pathPage)) {
      throw new Error('Installed MCP and CLI path exploration differ');
    }
    const pathFacts = new Map(pathPage.facts.map(fact => [fact.id, fact]));
    const pathResults = [...pathPage.paths];
    for (let page = 0; pathPage.search.continuation; page++) {
      if (page >= 20) throw new Error('Installed path search did not exhaust bounded fixture');
      pathPage = cli(...pathArgs, '--continuation', pathPage.search.continuation);
      pathPage.facts.forEach(fact => pathFacts.set(fact.id, fact));
      pathResults.push(...pathPage.paths);
    }
    // These real documents also contain a direct Markdown link. Keep that path as well as
    // the semantic capability path; neither producer's cited relationship may be discarded.
    const directFacts = pack.facts.filter(fact => fact.predicate === 'references' &&
      ((fact.subject.id === pathRequest.fromNodeId && fact.object.id === pathRequest.toNodeId) ||
       (fact.subject.id === pathRequest.toNodeId && fact.object.id === pathRequest.fromNodeId)));
    const signatures = paths => paths.map(path => JSON.stringify(path.factIds)).sort();
    const expectedPaths = [...directFacts.map(fact => ({ factIds: [fact.id] })), { factIds: expected.map(fact => fact.id) }];
    const expectedFacts = [...expected, ...directFacts].sort((a, b) => a.id.localeCompare(b.id));
    if (pathPage.search.truncated || !directFacts.length || JSON.stringify(signatures(pathResults)) !== JSON.stringify(signatures(expectedPaths)) ||
        JSON.stringify([...pathFacts.values()].sort((a, b) => a.id.localeCompare(b.id))) !== JSON.stringify(expectedFacts)) {
      throw new Error('Installed path pagination must retain exact cited evidence across the shared capability');
    }
  } finally { await client.close(); }
  const before = await readFile(join(consumer, config.storagePath, 'heads/default.json'), 'utf8');
  config.documentTraversal.maxReadDocuments = 1;
  await writeFile(join(consumer, 'traversal.config.json'), JSON.stringify(config));
  let blocked = false;
  try { cli('hydrate', '--json', '--quiet'); } catch { blocked = true; }
  if (!blocked || await readFile(join(consumer, config.storagePath, 'heads/default.json'), 'utf8') !== before) {
    throw new Error('Installed failed traversal must preserve the previous snapshot head');
  }
}
