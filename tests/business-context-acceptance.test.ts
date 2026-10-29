import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContextPack, GraphNeighborhood, GraphPaths, ImpactScanRequest } from '@weftlet/core';
import { createContextGraphApplication } from '../src/application/application.js';
import { handleImpactScan } from '../src/interfaces/mcp-facade.js';
import { handleGraphNeighbors } from '../src/interfaces/graph-exploration.js';
import { CG, nodeIri, RdfEvidenceGraph } from '../src/graph/rdf.js';
import { sha256 } from '../src/infrastructure/util.js';

const execute = promisify(execFile);
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const paths = {
  collection: 'services/api/src/collect.ts', execution: 'services/execution/src/execute.ts',
  notifications: 'services/notifications/src/notify.ts', mobile: 'apps/mobile/src/status.tsx',
  apiStatus: 'services/api/src/status.ts', contract: 'packages/contracts/src/status.ts',
  test: 'tests/execution.test.ts', unrelated: 'services/billing/src/report.ts',
};
const collection = 'semantic-id: public:collection\n# Collection\n' +
  `The collection workflow is implemented by ${paths.collection}.\n` +
  'The collection workflow is governed by Stored readings may be at most 600 seconds old.\n';
const handoff = 'The collection workflow routes through the execution workflow using stored readings.\n';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-business-context-'));
  try {
    const files: Record<string, string> = {
      '.gitignore': '.context-graph/\ncontext-graph.config.json\n', '.gitattributes': '* text eol=lf\n',
      'package.json': JSON.stringify({ name: 'public-business-context', private: true, type: 'module' }),
      'pnpm-workspace.yaml': "packages:\n  - 'services/*'\n  - 'apps/*'\n  - 'packages/*'\n",
      [paths.collection]: 'export function collect(reading: { observedAt: number; value: number }) { return JSON.stringify(reading); }\n',
      [paths.execution]: 'export function execute(reading: { observedAt: number; value: number }, now: number) { return now - reading.observedAt <= 60000; }\n',
      [paths.notifications]: 'export function notify(message: string) { return message; }\n',
      [paths.mobile]: "import type { Status } from '@public/contracts';\nexport function show(status: Status) { return status.state; }\n",
      [paths.apiStatus]: "import type { Status } from '@public/contracts';\nexport function status(): Status { return { state: 'queued' }; }\n",
      [paths.contract]: "export interface Status { state: 'queued' | 'complete' }\n",
      'packages/contracts/src/index.ts': "export type { Status } from './status.js';\n",
      [paths.test]: "import { execute } from '../services/execution/src/execute.js';\nexport const result = execute({ observedAt: 0, value: 1 }, 61000);\n",
      [paths.unrelated]: 'export function report(value: number) { return value; }\n',
      'docs/collection.md': collection,
      'docs/execution.md': 'semantic-id: public:execution\n# Execution\n' +
        `The execution workflow is implemented by ${paths.execution}.\n` +
        'The execution workflow is governed by Execution requires readings at most 60 seconds old.\n' +
        'The execution workflow routes through the notifications workflow using stored readings.\n',
      'docs/notifications.md': 'semantic-id: public:notifications\n# Notifications\n' +
        `The notifications workflow is implemented by ${paths.notifications}.\n` +
        'The notifications workflow routes through the mobile workflow using stored readings.\n',
      'docs/mobile.md': 'semantic-id: public:mobile\n# Mobile\n' +
        `The mobile workflow is implemented by ${paths.mobile}.\n`,
      'docs/billing.md': 'semantic-id: public:billing\n# Separate domain\n' +
        `The billing workflow is implemented by ${paths.unrelated}.\n` +
        'The billing workflow is governed by Execution requires readings at most 60 seconds old.\n',
    };
    for (const directory of ['services/api', 'services/execution', 'services/notifications', 'services/billing', 'apps/mobile', 'packages/contracts']) {
      files[`${directory}/package.json`] = JSON.stringify({ name: `@public/${directory.split('/').at(-1)}`,
        version: '1.0.0', type: 'module', ...(directory === 'packages/contracts' ? { types: 'dist/index.d.ts' } : {}) });
    }
    await Promise.all(Object.entries(files).map(async ([path, content]) => {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }));
    await copyFile(new URL('./fixtures/business-context-provider.mjs', import.meta.url), join(root, 'provider.mjs'));
    const template = JSON.parse(await readFile(new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    const config = { ...template, repositoryId: 'public/business-context', approvedIntentSources: ['docs/**'],
      codeRoots: ['services', 'apps', 'packages', 'tests'], evidenceRoots: ['tests'],
      semantic: { ...template.semantic, provider: 'module', providerModule: './provider.mjs',
        providerIdentity: 'public-business-context-parser:1', model: 'offline-grammar', maxDocuments: 8 },
      scip: { version: '0.4.0', command: 'bundled-scip-typescript', args: ['index', '--no-global-caches'],
        sourceProject: { include: ['services/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts', 'tests/**/*.ts'],
          aliases: { '@public/contracts': 'packages/contracts/src/index.ts' } } },
    };
    const configPath = join(root, 'context-graph.config.json');
    await writeFile(configPath, JSON.stringify(config));
    const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false',
      '-c', 'gc.auto=0', ...args], { cwd: root })).stdout.trim();
    const commit = async () => {
      await git('add', '.');
      await git('-c', 'user.name=Public Business Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public acceptance evidence');
    };
    await git('init', '--quiet'); await commit();
    const application = await createContextGraphApplication(configPath);
    const control = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    await writeFile(join(root, 'docs/collection.md'), collection + handoff);
    await commit();
    const linked = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    return { root, application, control, linked, git };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

function ids(pack: Pick<ContextPack, 'facts'>) {
  return new Set(pack.facts.flatMap(fact => [fact.subject.id, fact.object.id]));
}

describe('public business-context acceptance boundaries', () => {
  let state: Awaited<ReturnType<typeof fixture>>;
  beforeAll(async () => { state = await fixture(); }, 60_000);
  afterAll(async () => { if (state) await rm(state.root, { recursive: true, force: true }); });

  it('bridges isolated service code only after the stored-data handoff is documented, retaining both rules and authority', async () => {
    const { application, control, linked } = state;
    const request = { changedFiles: [paths.collection], maxFacts: 200 };
    const before = await application.queryService.scan({ ...request, snapshotId: control.snapshot.manifest.snapshotId });
    expect(ids(before)).not.toContain(`component:file:${paths.execution}`);
    const after = await application.queryService.scan({ ...request, snapshotId: linked.snapshot.manifest.snapshotId });
    expect(after.exploration?.truncated).toBe(false);
    for (const path of [paths.execution, paths.notifications, paths.mobile, paths.test]) {
      expect(ids(after)).toContain(`component:file:${path}`);
    }
    expect(ids(after)).not.toContain(`component:file:${paths.unrelated}`);
    const rules = after.facts.filter(fact => fact.predicate === 'governedBy');
    expect(rules.map(fact => fact.object.label).sort()).toEqual([
      'Execution requires readings at most 60 seconds old', 'Stored readings may be at most 600 seconds old',
    ]);
    for (const fact of rules) expect(fact).toMatchObject({ authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed' });
    const route = after.facts.find(fact => fact.subject.id === 'workflow:collection' && fact.predicate === 'routesThrough');
    expect(route).toMatchObject({ object: { id: 'workflow:execution' }, provenance: { path: 'docs/collection.md',
      startLine: 5, endLine: 5, digest: sha256(collection + handoff), commitSha: linked.snapshot.manifest.commitSha } });
    expect(linked.semanticExtracted).toBe(1);
    expect(linked.semanticReused).toBe(4);
    expect((await new RdfEvidenceGraph(linked.snapshot).validate()).conforms).toBe(true);
    // Retrieving differing obligations is not an automatic business-compatibility verdict.
    expect(linked.snapshot.invariants).toEqual([]);
    expect(linked.snapshot.runtimeEvidence).toEqual([]);
    expect(await application.snapshotStore.read(control.snapshot.manifest.snapshotId)).toEqual(control.snapshot);
  });

  it('supports bounded MCP-facade pagination and focused follow-up without hiding depth exhaustion', async () => {
    const { application, linked } = state;
    const snapshotId = linked.snapshot.manifest.snapshotId;
    const request: ImpactScanRequest = { snapshotId, changedFiles: [paths.collection], maxFacts: 3, maxDepth: 32 };
    const first = await handleImpactScan(application.queryService, request);
    expect(first.facts).toHaveLength(3);
    expect(first.exploration?.continuation).toBeTruthy();
    expect(first.exploration?.truncated).toBe(true);
    const all = [...first.facts];
    let page = first;
    for (let count = 0; page.exploration?.continuation; count++) {
      if (count > 100) throw new Error('Pagination did not terminate');
      page = await handleImpactScan(application.queryService, { ...request, continuation: page.exploration.continuation });
      expect(page.snapshot.snapshotId).toBe(snapshotId);
      all.push(...page.facts);
    }
    const unpaged = await application.queryService.scan({ ...request, maxFacts: 200 });
    expect(all).toEqual(unpaged.facts);
    expect(new Set(all.map(fact => fact.id)).size).toBe(all.length);
    const shallow = await handleImpactScan(application.queryService, { ...request, maxFacts: 200, maxDepth: 1 });
    expect(shallow.exploration?.depthLimitReached).toBe(true);
    expect(shallow.exploration?.truncated).toBe(true);
    const followup = await handleImpactScan(application.queryService, { snapshotId, changedFiles: [paths.execution],
      task: 'freshness', maxFacts: 200 });
    expect(followup.facts.some(fact => fact.subject.id === 'workflow:execution' && fact.predicate === 'governedBy')).toBe(true);
    await expect(handleImpactScan(application.queryService, { ...request, changedFiles: [paths.execution],
      continuation: first.exploration!.continuation })).rejects.toThrow('does not match');
  });

  it('resolves shared contracts across separate workspace packages and TSX, with source and repeat identity intact', async () => {
    const { application, linked } = state;
    const graph = new RdfEvidenceGraph(linked.snapshot);
    const symbol = linked.snapshot.facts.find(fact => fact.extractor.id === 'scip-symbol-extractor' &&
      fact.provenance.path === paths.contract && fact.predicate === 'contains' && fact.object.label.includes('Status#'));
    expect(symbol).toBeDefined();
    for (const path of [paths.apiStatus, paths.mobile]) {
      expect(linked.snapshot.facts.some(fact => fact.extractor.id === 'scip-symbol-extractor' &&
        fact.subject.id === `component:file:${path}` && fact.predicate === 'consumes' && fact.object.id === symbol!.object.id)).toBe(true);
    }
    const query = await graph.select(`SELECT ?file WHERE { ?file <${CG}consumes> <${nodeIri(symbol!.object.id)}> }`);
    expect(query.rows.map(row => row.file)).toEqual(expect.arrayContaining([
      nodeIri(`component:file:${paths.apiStatus}`), nodeIri(`component:file:${paths.mobile}`),
    ]));
    const pack = await application.queryService.scan({ changedFiles: [paths.contract], maxFacts: 200 });
    for (const path of [paths.apiStatus, paths.mobile]) expect(ids(pack)).toContain(`component:file:${path}`);
    const repeated = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeated.semanticExtracted).toBe(0);
    expect(repeated.semanticReused).toBe(5);
    expect(repeated.snapshot.manifest.snapshotId).toBe(linked.snapshot.manifest.snapshotId);
    expect(repeated.snapshot.manifest.contentDigest).toBe(linked.snapshot.manifest.contentDigest);
    expect(await state.git('status', '--porcelain')).toBe('');
  });

  it('follows exact IDs across actual extracted service evidence through CLI and MCP while dirty and providers are unavailable', async () => {
    const { root, application, linked } = state;
    const snapshotId = linked.snapshot.manifest.snapshotId;
    const request = { snapshotId, nodeId: 'workflow:collection', direction: 'outgoing' as const,
      predicates: ['routesThrough'] as const, maxFacts: 1 };
    const before = JSON.stringify(await application.snapshotStore.read(snapshotId));
    const configPath = join(root, 'context-graph.config.json');
    const configBytes = await readFile(configPath, 'utf8');
    const sourcePath = join(root, paths.collection);
    const sourceBytes = await readFile(sourcePath, 'utf8');
    const changedConfig = JSON.parse(configBytes);
    changedConfig.semantic.providerModule = './unavailable-provider.mjs';
    changedConfig.scip.command = 'unavailable-indexer';
    delete changedConfig.scip.sourceProject;
    await writeFile(configPath, JSON.stringify(changedConfig));
    await writeFile(sourcePath, sourceBytes + '// draft working change\n');
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ['--import', tsx, fileURLToPath(new URL('../src/mcp.ts', import.meta.url))], cwd: tmpdir(),
      env: { ...process.env, CONTEXT_GRAPH_CONFIG: configPath }, stderr: 'pipe' });
    const client = new Client({ name: 'public-exploration-acceptance', version: '1' });
    try {
      const savedApp = await createContextGraphApplication(configPath);
      const direct = await handleGraphNeighbors(savedApp.explorationService, request);
      expect(direct.facts).toEqual(linked.snapshot.facts.filter(fact =>
        fact.subject.id === request.nodeId && fact.predicate === 'routesThrough'));
      expect(direct.frontier.neighbors[0]).toMatchObject({ nodeId: 'workflow:execution' });
      expect(direct.frontier.neighbors[0]!.otherIncidentFacts).toBeGreaterThan(0);
      expect(direct.evidenceState).toMatchObject({ excludedWorkingChanges: [paths.collection],
        configurationMatches: false, eligibleForCurrentDiffValidation: false });
      const cli = await execute(process.execPath, ['--import', tsx, fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
        'graph', 'neighbors', '--config', configPath, '--snapshot', snapshotId, '--node', request.nodeId,
        '--direction', 'outgoing', '--predicate', 'routesThrough', '--max-facts', '1', '--json'], { cwd: tmpdir(), timeout: 30_000 });
      expect(JSON.parse(cli.stdout)).toEqual(JSON.parse(JSON.stringify(direct)));
      await client.connect(transport);
      const tools = (await client.listTools()).tools;
      expect(tools.map(tool => tool.name)).toContain('graph.neighbors');
      expect(tools.find(tool => tool.name === 'graph.neighbors')!.annotations?.readOnlyHint).toBe(true);
      const response = await client.callTool({ name: 'graph.neighbors', arguments: request });
      expect(response.isError).not.toBe(true);
      const content = response.content as { type: string; text?: string }[];
      expect(JSON.parse(content[1]!.text!)).toEqual(JSON.parse(JSON.stringify(direct)));
      const follow = await client.callTool({ name: 'graph.neighbors', arguments: { snapshotId,
        nodeId: direct.frontier.neighbors[0]!.nodeId, maxFacts: 200 } });
      const followPack: GraphNeighborhood = JSON.parse((follow.content as { text: string }[])[1]!.text);
      expect(followPack.facts.some(fact => fact.predicate === 'governedBy' &&
        fact.object.label === 'Execution requires readings at most 60 seconds old')).toBe(true);
      expect(followPack.facts.some(fact => fact.object.id === `component:file:${paths.execution}`)).toBe(true);
      expect(followPack.facts.some(fact => fact.subject.id === 'workflow:billing')).toBe(false);
      const pathRequest = { snapshotId, fromNodeId: `component:file:${paths.collection}`,
        toNodeId: `component:file:${paths.execution}`, direction: 'both' as const,
        predicates: ['implementedBy', 'routesThrough'] as const, maxPaths: 1, maxSteps: 1 };
      const firstPath = await savedApp.pathService.paths(pathRequest);
      expect(firstPath.search.truncated).toBe(true);
      expect(firstPath.evidenceState).toEqual(direct.evidenceState);
      const pathCli = await execute(process.execPath, ['--import', tsx, fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
        'graph', 'paths', '--config', configPath, '--snapshot', snapshotId, '--from', pathRequest.fromNodeId,
        '--to', pathRequest.toNodeId, '--direction', 'both', '--predicate', 'implementedBy', '--predicate', 'routesThrough',
        '--max-paths', '1', '--max-steps', '1', '--json'], { cwd: tmpdir(), timeout: 30_000 });
      expect(JSON.parse(pathCli.stdout)).toEqual(JSON.parse(JSON.stringify(firstPath)));
      let pathPage = firstPath;
      const found = [...pathPage.paths];
      for (let count = 0; pathPage.search.continuation; count++) {
        expect(count).toBeLessThan(50);
        const nextPath = await client.callTool({ name: 'graph.paths', arguments: { ...pathRequest, continuation: pathPage.search.continuation } });
        expect(nextPath.isError).not.toBe(true);
        pathPage = JSON.parse((nextPath.content as { text: string }[])[1]!.text) as GraphPaths;
        found.push(...pathPage.paths);
        for (const fact of pathPage.facts) expect(fact).toEqual(linked.snapshot.facts.find(item => item.id === fact.id));
      }
      expect(found.map(path => path.nodeIds)).toContainEqual([pathRequest.fromNodeId, 'workflow:collection', 'workflow:execution', pathRequest.toNodeId]);
      expect(found.some(path => path.nodeIds.includes('workflow:billing'))).toBe(false);
      expect(pathPage.search.truncated).toBe(false);
      const bad = await client.callTool({ name: 'graph.neighbors', arguments: { nodeId: request.nodeId } });
      expect(bad.isError).toBe(true);
      expect(JSON.stringify(bad)).toContain('snapshotId');
      expect(JSON.stringify(await application.snapshotStore.read(snapshotId))).toBe(before);
    } finally {
      await client.close();
      await writeFile(configPath, configBytes);
      await writeFile(sourcePath, sourceBytes);
    }
    expect(await state.git('status', '--porcelain')).toBe('');
  }, 60_000);
});
