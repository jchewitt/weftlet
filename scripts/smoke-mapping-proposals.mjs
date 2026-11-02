import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/** Installed transport/packaging control with a canned module; no external model call. */
export async function smokeMappingProposals(installedRoot, baseConfig) {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-installed-mapping-'));
  const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
  const cli = (...args) => JSON.parse(run(process.execPath, [join(installedRoot, 'dist/cli.js'), ...args]));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/admit.ts'), 'export function admit(age: number) { return age <= 60; }\n');
    await writeFile(join(root, 'owner.md'), 'Admit observations no older than sixty seconds. Implementation: src/admit.ts\n');
    await writeFile(join(root, '.gitignore'), '.context-graph/\nrequest.json\n');
    await writeFile(join(root, 'package.json'), '{"name":"public-installed-proposal","version":"1.0.0","type":"module"}');
    await writeFile(join(root, 'provider.mjs'), `
export function createSemanticExtractor(config) { return { identity: config.providerIdentity, async extract() {
 const parsed = { assertions: [{ subject: { id: 'invariant:freshness', kind: 'Invariant', label: 'Fresh observations' },
 predicate: 'implementedBy', object: { id: 'component:file:src/admit.ts', kind: 'Component', label: 'src/admit.ts' },
 citation: { startLine: 1, endLine: 1 }, confidence: 1 }], diagnostics: [], oml: '' };
 return { parsed, rawModelOutput: JSON.stringify(parsed) }; } }; }
export function createMappingProposalProvider(config) { return { identity: config.providerIdentity, async propose(input) {
 const c = input.candidates[0]; return { decision: 'proposed', reason: 'Public packaging control', proposals: [{ symbolId: c.node.id,
 rationale: 'Age comparison appears in this body.', confidence: 0.8, documentCitation: { startLine: 1, endLine: 1 },
 codeCitation: { startLine: c.body.startLine, endLine: c.body.endLine } }] }; } }; }
`);
    const config = { ...baseConfig, adapter: undefined, agentContext: undefined, documentTraversal: undefined,
      storagePath: '.context-graph', codeRoots: ['src'], semanticSources: ['owner.md'], approvedIntentSources: ['owner.md'], evidenceRoots: [],
      semantic: { ...baseConfig.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity: 'public-installed-mapping:1' },
      scip: { ...baseConfig.scip, args: ['index', '--no-global-caches'], sourceProject: { include: ['src/**/*.ts'] } } };
    await writeFile(join(root, 'context-graph.config.json'), JSON.stringify(config));
    run('git', ['init', '--quiet']); run('git', ['add', '.']);
    run('git', ['-c', 'user.name=Public fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public mapping installation']);
    const hydrated = cli('hydrate', '--json', '--quiet');
    const request = { snapshotId: hydrated.snapshotId, ruleId: 'invariant:freshness', documentPath: 'owner.md', files: ['src/admit.ts'] };
    await writeFile(join(root, 'request.json'), JSON.stringify(request));
    const plan = cli('mappings', 'plan', '--request', 'request.json');
    if (!plan.ready || plan.candidates.length !== 1 || plan.expectedModelRequests !== 1) throw Error('Installed mapping preview failed');
    const first = cli('mappings', 'propose', '--request', 'request.json', '--allow-model', '--quiet');
    await rename(join(root, 'provider.mjs'), join(root, 'provider-unavailable.mjs'));
    const repeated = cli('mappings', 'propose', '--request', 'request.json', '--quiet');
    if (first.reused || !repeated.reused || repeated.artifact.outputDigest !== first.artifact.outputDigest ||
        first.artifact.authority !== 'inferred' || first.artifact.extractionReview !== 'unreviewed') throw Error('Installed proposal reuse/authority failed');
    const publicApi = await import(pathToFileURL(join(installedRoot, 'dist/index.js')).href);
    publicApi.validateMappingOutput(first.artifact.output, first.artifact.plan);
    const service = await publicApi.createMappingProposalService(join(root, 'context-graph.config.json'));
    if ((await service.read(hydrated.snapshotId, first.artifact.key)).artifact.outputDigest !== first.artifact.outputDigest) throw Error('Installed configured proposal API failed');
    if (cli('impact', 'scan', '--json').snapshot.contentDigest !== hydrated.contentDigest) throw Error('Proposal operation mutated graph evidence');
    const transport = new StdioClientTransport({ command: process.execPath, args: [join(installedRoot, 'dist/mcp.js')], cwd: root,
      env: { ...process.env, CONTEXT_GRAPH_CONFIG: join(root, 'context-graph.config.json') }, stderr: 'pipe' });
    const client = new Client({ name: 'installed-proposal-control', version: '1' });
    try {
      await client.connect(transport);
      const read = cli('mappings', 'read', '--snapshot', hydrated.snapshotId, '--key', first.artifact.key);
      const response = await client.callTool({ name: 'mapping.proposals', arguments: { snapshotId: hydrated.snapshotId, key: first.artifact.key } });
      if (response.isError || JSON.stringify(JSON.parse(response.content[1].text)) !== JSON.stringify(read)) throw Error('Installed mapping MCP/CLI differ');
    } finally { await client.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
}
