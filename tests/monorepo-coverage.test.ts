import { execFile } from 'node:child_process';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CodeCoverageReport, GraphSnapshot } from '@weftlet/core';
import { createContextGraphApplication } from '../src/application/application.js';
import { buildWorkingOverlay } from '../src/application/overlay.js';
import { SnapshotCodeCoverageService } from '../src/graph/code-coverage.js';
import { projectCodeCoverage } from '../src/graph/code-coverage-projection.js';
import { RdfEvidenceGraph } from '../src/graph/rdf.js';
import { loadScipRuntime } from '../src/extraction/scip-runtime.js';
import { physicalArtifactKey } from '../src/infrastructure/artifact-paths.js';
import { renderContextPackHtml } from '../src/visualization/visualization.js';
import { monorepoProject, packageRoots } from './fixtures/monorepo-project.js';

const execute = promisify(execFile), tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const normalized = (value: unknown) => JSON.parse(JSON.stringify(value));
const service = (snapshot: GraphSnapshot) => new SnapshotCodeCoverageService({ read: async () => snapshot });

describe('saved monorepo coverage from real source selection and SCIP', () => {
  let f: Awaited<ReturnType<typeof monorepoProject>>;
  beforeAll(async () => { f = await monorepoProject(); }, 90_000);
  afterAll(async () => { if (f) await rm(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });

  it('distinguishes requested entries, transitive indexing, unselected files, excluded packages and independent code', async () => {
    const inventory = f.snapshot.manifest.codeInventory!;
    const report = await f.app.codeCoverageService.coverage({ snapshotId: f.snapshot.manifest.snapshotId });
    expect(report.overview.status).toBe('recorded');
    expect(report.projects.map(p => p.root)).toEqual(['.', ...packageRoots].sort());
    const rows = new Map(projectCodeCoverage(f.snapshot).files.map(file => [file.path, file]));
    // SCIP's generated source project only emits selected documents, even for a resolvable imported file.
    expect(rows.get('services/api/src/imported.ts')).toMatchObject({ codeRootSelected: true, requested: 'excluded', indexed: false });
    expect(rows.get('services/api/src/unselected.ts')).toMatchObject({ codeRootSelected: true, requested: 'excluded', indexed: false });
    expect(rows.get('services/omitted/src/run.ts')).toMatchObject({ codeRootSelected: false, requested: 'excluded', indexed: false });
    expect(report.projects.find(p => p.root === 'services/omitted')).toMatchObject({ counts: { files: 1, indexed: 0, requested: 0 }, connectedProjects: 0 });
    expect(report.projects.find(p => p.root === 'services/independent')).toMatchObject({ counts: { files: 1, indexed: 1, requested: 1 }, connectedProjects: 0 });
    // Zero-occurrence documents may still be indexed. Compare with actual binary documents, never graph fact count.
    const bytes = await readFile(join(f.app.storageRoot, 'scip', `${physicalArtifactKey(f.snapshot.manifest.snapshotId)}.scip`));
    const observed = new Set(loadScipRuntime().scip.Index.deserializeBinary(bytes).documents.map(d => d.relative_path.replaceAll('\\', '/')));
    for (const file of inventory.files) expect(file.indexed).toBe(observed.has(file.path));
    expect(rows.get('services/api/src/collect.ts')!.unresolvedReferences).toBeGreaterThan(0);
    expect(report.markdown).toContain('not completeness or no-impact claims');
  });

  it('connects barrel/alias consumers and TSX through actual cited code while retaining external and unresolved gaps', async () => {
    const projected = projectCodeCoverage(f.snapshot), snapshotId = f.snapshot.manifest.snapshotId;
    for (const root of ['services/api', 'services/execution', 'apps/mobile', 'packages/contracts']) {
      expect(projected.projects.find(p => p.root === root)!.connectedProjects).toBeGreaterThan(0);
    }
    expect(projected.files.find(file => file.path === 'services/api/src/collect.ts')!.declarationOnlyReferences).toBeGreaterThan(0);
    expect(projected.files.find(file => file.path === 'services/execution/src/missing.ts')!.implementationGaps).toBeGreaterThan(0);
    const pack = await f.app.queryService.scan({ snapshotId, changedFiles: ['packages/contracts/src/reading.ts'], maxFacts: 200 });
    expect(pack.facts.some(fact => fact.provenance.path === 'apps/mobile/src/view.tsx' && fact.codeOccurrence?.role === 'reference')).toBe(true);
    expect(pack.facts.some(fact => fact.provenance.path === 'services/omitted/src/run.ts')).toBe(false);
    expect(pack.coverage.code).toEqual(projected.overview);
    const omitted = await f.app.queryService.scan({ snapshotId, changedFiles: ['services/omitted/src/run.ts'], maxFacts: 1 });
    expect(omitted.coverage.code).toEqual(projected.overview);
    const neighborhood = await f.app.explorationService.neighbors({ snapshotId, nodeId: 'component:file:services/api/src/collect.ts', maxFacts: 1 });
    expect(neighborhood.coverage.code).toEqual(projected.overview);
    const html = renderContextPackHtml(pack, 'https://example.test/{commit}/{path}#L{line}');
    expect(html).toContain('Saved repository code coverage');
    const graph = new RdfEvidenceGraph(f.snapshot);
    expect(projectCodeCoverage({ ...f.snapshot, facts: await graph.facts() })).toEqual(projected);
    expect((await graph.validate()).conforms).toBe(true);
  });

  it('pages every package and every selected package file without omissions, and rejects changed cursors', async () => {
    const snapshotId = f.snapshot.manifest.snapshotId;
    const request = { snapshotId, maxItems: 2 };
    let page = await f.app.codeCoverageService.coverage(request);
    const first = page, projects = [...page.projects];
    for (let n = 0; page.selection.continuation; n++) {
      expect(n).toBeLessThan(10);
      page = await f.app.codeCoverageService.coverage({ ...request, continuation: page.selection.continuation }); projects.push(...page.projects);
    }
    expect(projects).toEqual(projectCodeCoverage(f.snapshot).projects);
    const filesRequest = { snapshotId, projectRoot: 'services/api', maxItems: 1 };
    page = await f.app.codeCoverageService.coverage(filesRequest); const files = [...page.files];
    while (page.selection.continuation) {
      page = await f.app.codeCoverageService.coverage({ ...filesRequest, continuation: page.selection.continuation }); files.push(...page.files);
    }
    expect(files).toEqual(projectCodeCoverage(f.snapshot).files.filter(file => file.projectRoot === 'services/api'));
    expect((await f.app.codeCoverageService.coverage({ ...request, projectRoot: 'services/absent' })).projectStatus).toBe('absent');
    for (const change of [{ maxItems: 3 }, { projectRoot: 'services/api' }]) {
      await expect(f.app.codeCoverageService.coverage({ ...request, ...change, continuation: first.selection.continuation })).rejects.toThrow('continuation');
    }
    await expect(service({ ...f.snapshot, diagnostics: [] }).coverage({ ...request, continuation: first.selection.continuation })).rejects.toThrow('continuation');
    await expect(f.app.codeCoverageService.coverage({ ...request, continuation: 'bad-token' })).rejects.toThrow('continuation');
  });

  it('preserves unknown legacy coverage and rejects missing/mismatched snapshot identities without refresh', async () => {
    const legacy = { ...f.snapshot, manifest: { ...f.snapshot.manifest, codeInventory: undefined } };
    const report = await service(legacy).coverage({ snapshotId: legacy.manifest.snapshotId, projectRoot: 'services/api' });
    expect(report.overview.status).toBe('unavailable'); expect(report.overview.totals).toBeUndefined();
    expect(report.projectStatus).toBe('unknown'); expect(report.files).toEqual([]);
    await expect(service(legacy).coverage({ snapshotId: 'wrong' })).rejects.toThrow('identity');
    await expect(new SnapshotCodeCoverageService({ read: async () => undefined }).coverage({ snapshotId: 'missing' })).rejects.toThrow('No graph snapshot');
  });

  it('reuses semantic artifacts, reproduces clean coverage and agrees across API/CLI/MCP with dirty unavailable providers', async () => {
    const repeat = await f.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeat.semanticExtracted).toBe(0); expect(repeat.semanticReused).toBe(1);
    expect(repeat.snapshot.manifest.contentDigest).toBe(f.snapshot.manifest.contentDigest);
    expect(repeat.snapshot.manifest.snapshotId).toBe(f.snapshot.manifest.snapshotId);
    expect(repeat.snapshot.manifest.codeInventory).toEqual(f.snapshot.manifest.codeInventory);
    const clean = await f.app.hydrator.compareClean({ ref: 'HEAD', headName: 'default' });
    expect(clean.snapshot.manifest.contentDigest).toBe(f.snapshot.manifest.contentDigest);
    const path = 'services/omitted/src/run.ts', bytes = await readFile(f.configPath, 'utf8');
    const client = new Client({ name: 'coverage-acceptance', version: '1' });
    try {
      await writeFile(join(f.root, path), f.files[path]! + '// working edit outside index selection\n');
      const config = JSON.parse(bytes); config.semantic.providerModule = './unavailable.mjs'; config.scip.command = 'missing-indexer'; delete config.scip.sourceProject;
      await writeFile(f.configPath, JSON.stringify(config));
      const app = await createContextGraphApplication(f.configPath), request = { snapshotId: f.snapshot.manifest.snapshotId, projectRoot: 'services/omitted', maxItems: 1 };
      const direct = await app.codeCoverageService.coverage(request);
      expect(direct.evidenceState).toMatchObject({ excludedWorkingChanges: [path], configurationMatches: false, eligibleForCurrentDiffValidation: false });
      const cli = await execute(process.execPath, ['--import', tsx, fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
        'graph', 'coverage', '--config', f.configPath, '--snapshot', request.snapshotId, '--project', request.projectRoot, '--max-items', '1', '--json'], { cwd: tmpdir(), timeout: 30_000 });
      expect(JSON.parse(cli.stdout)).toEqual(normalized(direct)); expect(cli.stderr).toBe('');
      await client.connect(new StdioClientTransport({ command: process.execPath,
        args: ['--import', tsx, fileURLToPath(new URL('../src/mcp.ts', import.meta.url))], cwd: tmpdir(),
        env: { ...process.env, CONTEXT_GRAPH_CONFIG: f.configPath }, stderr: 'pipe' }));
      const result = await client.callTool({ name: 'graph.coverage', arguments: request });
      expect(result.isError).not.toBe(true);
      expect(JSON.parse((result.content as { text: string }[])[1]!.text) as CodeCoverageReport).toEqual(normalized(direct));
      expect(await app.snapshotStore.read(request.snapshotId)).toEqual(f.snapshot);
    } finally { await client.close(); await writeFile(f.configPath, bytes); await writeFile(join(f.root, path), f.files[path]!); }
  }, 60_000);

  it('replaces inventory for draft renames/deletions and committed scope changes while keeping historical evidence immutable', async () => {
    const oldPath = 'services/independent/src/run.ts', newPath = 'services/independent/src/renamed.ts', deleted = 'services/api/src/unselected.ts';
    try {
      await rename(join(f.root, oldPath), join(f.root, newPath)); await rm(join(f.root, deleted));
      const overlay = await buildWorkingOverlay(f.app.repository, f.app.config, f.app.snapshotStore, f.app.storageRoot, f.snapshot.manifest.snapshotId, 'coverage');
      expect(overlay.manifest.codeInventory!.files.map(file => file.path)).toContain(newPath);
      expect(overlay.manifest.codeInventory!.files.some(file => [oldPath, deleted].includes(file.path))).toBe(false);
      const report = await f.app.codeCoverageService.coverage({ snapshotId: overlay.manifest.snapshotId, projectRoot: 'services/independent' });
      expect(report.files[0]!.path).toBe(newPath); expect(report.evidenceState?.overlayFreshness).toBe('current');
      expect(report.evidenceState?.eligibleForCurrentDiffValidation).toBe(false);
      expect(await f.app.snapshotStore.read(f.snapshot.manifest.snapshotId)).toEqual(f.snapshot);
      expect((await f.app.snapshotStore.readHead('default'))!.manifest.snapshotId).toBe(f.snapshot.manifest.snapshotId);
      await f.commit();
      const config = { ...f.config, scip: { ...f.config.scip, sourceProject: { ...f.config.scip.sourceProject,
        include: [...f.config.scip.sourceProject.include, 'services/omitted/**/*.ts'] } } };
      await writeFile(f.configPath, JSON.stringify(config));
      const app = await createContextGraphApplication(f.configPath), next = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
      expect(next.snapshot.manifest.codeInventory!.files.find(file => file.path === 'services/omitted/src/run.ts')).toMatchObject({ requested: 'included', indexed: true, codeRootSelected: false });
      expect(next.snapshot.manifest.codeInventory!.digest).not.toBe(f.snapshot.manifest.codeInventory!.digest);
      expect((await app.codeCoverageService.coverage({ snapshotId: f.snapshot.manifest.snapshotId })).evidenceState?.stale).toBe(true);
      expect(await app.snapshotStore.read(f.snapshot.manifest.snapshotId)).toEqual(f.snapshot);
    } finally { await writeFile(f.configPath, JSON.stringify(f.config)); }
  }, 60_000);
});
