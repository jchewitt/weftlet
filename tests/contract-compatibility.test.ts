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
import type { GraphFact, GraphSnapshot } from '@weftlet/core';
import { createContextGraphApplication } from '../src/application/application.js';
import { buildWorkingOverlay } from '../src/application/overlay.js';
import { SnapshotContractCompatibilityService } from '../src/graph/compatibility.js';
import { RdfEvidenceGraph } from '../src/graph/rdf.js';
import { handleGraphCompatibility } from '../src/interfaces/graph-compatibility.js';
import { compatibilityCases, declarations } from './fixtures/compatibility-cases.js';
import { compatibilityProject } from './fixtures/compatibility-project.js';
import { document } from './fixtures/obligation-project.js';

const execute = promisify(execFile), tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const normalized = (value: unknown) => JSON.parse(JSON.stringify(value));
const selected = (snapshot: GraphSnapshot, name: string, role: string) => snapshot.facts.find(fact =>
  fact.provenance.path === `docs/${name}-${role}.md` && fact.contractObligation);
function request(snapshot: GraphSnapshot, name: string) {
  return { snapshotId: snapshot.manifest.snapshotId, producerFactId: selected(snapshot, name, 'producer')?.id ?? 'missing-producer',
    consumerFactId: selected(snapshot, name, 'consumer')?.id ?? 'missing-consumer' };
}
const service = (snapshot: GraphSnapshot) => new SnapshotContractCompatibilityService({ read: async () => snapshot });

describe('B4b selected compatibility over actual committed extraction', () => {
  let f: Awaited<ReturnType<typeof compatibilityProject>>;
  beforeAll(async () => { f = await compatibilityProject(); }, 90_000);
  afterAll(async () => { if (f) await rm(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });

  it.each(compatibilityCases)('$id preserves cited evidence and reports $expected', async item => {
    const report = await f.app.compatibilityService.assess(request(f.snapshot, item.id));
    expect(report.assessment).toMatchObject({ status: item.expected, scope: 'selected-assertion-pair',
      authority: 'inferred', gateEligible: false, fulfillment: 'not-evaluated' });
    for (const fact of report.facts) expect(fact).toEqual(f.snapshot.facts.find(original => original.id === fact.id));
    expect(report.facts).toHaveLength(item.id === 'missing-endpoint' ? 1 : 2);
    expect(report.evidenceState?.eligibleForCurrentDiffValidation).toBe(false);
    expect(report.snapshot).toMatchObject({ snapshotId: f.snapshot.manifest.snapshotId, commitSha: f.snapshot.manifest.commitSha,
      configurationDigest: f.snapshot.manifest.configurationDigest, scope: f.snapshot.manifest.scope });
    expect(report.coverage.counts.implementationAndConsumers).toBe(0); // declarations are not implementation proof
    if (item.id === 'queue-subset') {
      expect(report.facts[0]).toMatchObject({ sourceAuthority: 'declared', authority: 'inferred', extractionReview: 'deterministic' });
      expect(report.facts[1]!.sourceAuthority).toBe('inferred');
    }
    if (item.id === 'competing') expect(report.context).toMatchObject({ competingFacts: 1, omittedCompetingFacts: 0 });
  });

  it('follows changed-file evidence to exact declarations and onward to real implementation and test references', async () => {
    const snapshotId = f.snapshot.manifest.snapshotId, p = selected(f.snapshot, 'stored-revalidation', 'producer')!;
    const pack = await f.app.queryService.scan({ snapshotId, changedFiles: ['services/collector.ts'], maxFacts: 200 });
    expect(pack.facts).toContainEqual(p);
    const page = await f.app.explorationService.neighbors({ snapshotId, nodeId: p.object.id, maxFacts: 2 });
    expect(page.selection.truncated).toBe(false); expect(page.facts).toHaveLength(2);
    const report = await handleGraphCompatibility(f.app.compatibilityService, { snapshotId, producerFactId: p.id,
      consumerFactId: page.facts.find(fact => fact.predicate === 'consumes')!.id });
    expect(report.assessment.status).toBe('revalidation-required');
    const endpoint = await f.app.explorationService.neighbors({ snapshotId, nodeId: 'component:file:services/executor.ts', maxFacts: 200 });
    expect(endpoint.facts.some(fact => fact.codeOccurrence?.role === 'definition')).toBe(true);
    const definition = endpoint.facts.find(fact => fact.codeOccurrence?.role === 'definition' && fact.subject.label === 'execute')!;
    expect(definition).toBeDefined();
    const symbol = await f.app.explorationService.neighbors({ snapshotId, nodeId: definition.subject.id, maxFacts: 200 });
    expect(symbol.facts.some(fact => fact.provenance.path === 'services/executor.spec.ts' && fact.codeOccurrence?.role === 'reference')).toBe(true);
    const paths = await f.app.pathService.paths({ snapshotId, fromNodeId: p.subject.id, toNodeId: 'component:file:services/executor.ts',
      direction: 'both', predicates: ['emits', 'consumes'], maxPaths: 20 });
    expect(paths.markdown).toContain('declared guarantee'); expect(paths.markdown).toContain('declared requirement');
    expect(await new RdfEvidenceGraph(f.snapshot).facts()).toEqual(f.snapshot.facts);
    expect((await new RdfEvidenceGraph(f.snapshot).validate()).conforms).toBe(true);
    // Execute the public fixture's check, separately from what the graph claims about it.
    const runtime = await execute(process.execPath, ['--import', tsx, '--input-type=module', '-e',
      "import { execute } from './services/executor.ts'; if (!execute({ observedAt: 0 }, 60000) || execute({ observedAt: 0 }, 61000)) throw Error('freshness check failed');"], { cwd: f.root });
    expect(runtime.stderr).toBe(''); expect(report.assessment.fulfillment).toBe('not-evaluated');
  });

  it('distinguishes missing selection, invalid evidence and infrastructure failures; never silently drops conflicts', async () => {
    const query = request(f.snapshot, 'queue-subset');
    expect((await service(f.snapshot).assess({ ...query, consumerFactId: 'absent' })).assessment.reasons).toEqual(['missing-assertion']);
    const missing = new SnapshotContractCompatibilityService({ read: async () => undefined });
    await expect(missing.assess(query)).rejects.toThrow('No graph snapshot');
    await expect(service(f.snapshot).assess({ ...query, snapshotId: 'other' })).rejects.toThrow('identity');
    for (const mutate of [
      (fact: any) => { fact.authority = 'declared'; },
      (fact: any) => { fact.contractObligation.endpointSource.commitSha = 'stale'; },
      (fact: any) => { fact.provenance.commitSha = 'stale'; },
      (fact: any) => { delete fact.contractObligation; },
    ]) {
      const snapshot = structuredClone(f.snapshot); mutate(snapshot.facts.find(fact => fact.id === query.producerFactId)!);
      expect((await service(snapshot).assess(query)).assessment.reasons).toEqual(['invalid-evidence']);
    }
    const p = selected(f.snapshot, 'queue-subset', 'producer')!;
    const competitors = Array.from({ length: 25 }, (_, i): GraphFact => ({ ...p, id: `adversarial-competing-${i}` }));
    const report = await service({ ...f.snapshot, facts: [...f.snapshot.facts, ...competitors] }).assess(query);
    expect(report.assessment.reasons).toContain('competing-declarations');
    expect(report.context).toMatchObject({ competingFacts: 25, omittedCompetingFacts: 5 });
    expect(report.context.competingFactIds).toHaveLength(20); expect(report.facts).toHaveLength(2);
    const gap = { id: 'related-gap', kind: 'implementationGaps' as const, evidenceScope: 'source' as const,
      reason: 'Required source missing', provenance: [], relatedNodeIds: [p.object.id] };
    const incomplete = await service({ ...f.snapshot, diagnostics: [...f.snapshot.diagnostics!, gap] }).assess(query);
    expect(incomplete.assessment.reasons).toContain('extraction-gaps');
    expect(incomplete.diagnostics.implementationGaps.items).toContainEqual(gap);
  });

  it('reuses unchanged extraction and exposes identical API/CLI/MCP results while dirty and providers are unavailable', async () => {
    const repeat = await f.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeat.semanticExtracted).toBe(0); expect(repeat.semanticReused).toBe(23);
    expect(repeat.snapshot.manifest.snapshotId).toBe(f.snapshot.manifest.snapshotId);
    expect(repeat.snapshot.manifest.contentDigest).toBe(f.snapshot.manifest.contentDigest);
    const configBytes = await readFile(f.configPath, 'utf8'), source = 'services/collector.ts';
    const changedConfig = JSON.parse(configBytes);
    changedConfig.semantic.providerModule = './unavailable-provider.mjs'; changedConfig.scip.command = 'unavailable-indexer';
    delete changedConfig.scip.sourceProject;
    const client = new Client({ name: 'compatibility-acceptance', version: '1' });
    try {
      await writeFile(f.configPath, JSON.stringify(changedConfig)); await writeFile(join(f.root, source), f.files[source]! + '// draft\n');
      const app = await createContextGraphApplication(f.configPath), query = request(f.snapshot, 'queue-subset');
      const direct = await app.compatibilityService.assess(query);
      expect(direct.assessment.status).toBe('compatible-constraints');
      expect(direct.evidenceState).toMatchObject({ excludedWorkingChanges: [source], configurationMatches: false, eligibleForCurrentDiffValidation: false });
      const cli = await execute(process.execPath, ['--import', tsx, fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
        'graph', 'compatibility', '--config', f.configPath, '--snapshot', query.snapshotId, '--producer-fact', query.producerFactId,
        '--consumer-fact', query.consumerFactId, '--json'], { cwd: tmpdir(), timeout: 30_000 });
      expect(JSON.parse(cli.stdout)).toEqual(normalized(direct)); expect(cli.stderr).toBe('');
      await client.connect(new StdioClientTransport({ command: process.execPath,
        args: ['--import', tsx, fileURLToPath(new URL('../src/mcp.ts', import.meta.url))], cwd: tmpdir(),
        env: { ...process.env, CONTEXT_GRAPH_CONFIG: f.configPath }, stderr: 'pipe' }));
      expect((await client.listTools()).tools.find(tool => tool.name === 'graph.compatibility')?.annotations?.readOnlyHint).toBe(true);
      const response = await client.callTool({ name: 'graph.compatibility', arguments: query });
      expect(response.isError).not.toBe(true);
      expect(JSON.parse((response.content as { text: string }[])[1]!.text)).toEqual(normalized(direct));
      expect(await app.snapshotStore.read(query.snapshotId)).toEqual(f.snapshot);
    } finally { await client.close(); await writeFile(f.configPath, configBytes); await writeFile(join(f.root, source), f.files[source]!); }
  }, 60_000);

  it('assesses draft edits and renames, invalidates deletion, and retains the immutable historical assessment', async () => {
    const item = compatibilityCases[0]!, [, c] = declarations(item), path = 'docs/queue-subset-consumer.md';
    const moved = 'docs/renamed-consumer.md';
    try {
      await rename(join(f.root, path), join(f.root, moved));
      await writeFile(join(f.root, moved), document({ ...c, constraint: { ...c.constraint!, operator: 'at-least', value: 120 } }));
      const overlay = await buildWorkingOverlay(f.app.repository, f.app.config, f.app.snapshotStore, join(f.root, '.context-graph'),
        f.snapshot.manifest.snapshotId, 'compatibility-edits');
      const draft = overlay.facts.find(fact => fact.provenance.path === moved && fact.contractObligation)!;
      const report = await f.app.compatibilityService.assess({ ...request(overlay, item.id), consumerFactId: draft.id });
      expect(report.assessment).toMatchObject({ authority: 'draft', status: 'disjoint-constraints', gateEligible: false });
      expect(report.facts).toContainEqual(draft); expect(report.evidenceState?.overlayFreshness).toBe('current');
      await rm(join(f.root, moved));
      const deleted = await buildWorkingOverlay(f.app.repository, f.app.config, f.app.snapshotStore, join(f.root, '.context-graph'),
        f.snapshot.manifest.snapshotId, 'compatibility-deletion');
      expect((await f.app.compatibilityService.assess(request(deleted, item.id))).assessment.reasons).toContain('missing-assertion');
      expect((await f.app.compatibilityService.assess(request(f.snapshot, item.id))).assessment.status).toBe('compatible-constraints');
      expect(await f.app.snapshotStore.read(f.snapshot.manifest.snapshotId)).toEqual(f.snapshot);
      expect((await f.app.snapshotStore.readHead('default'))!.manifest.snapshotId).toBe(f.snapshot.manifest.snapshotId);
    } finally { await rm(join(f.root, moved), { force: true }); await writeFile(join(f.root, path), f.files[path]!); }
    expect(await f.git('status', '--porcelain')).toBe('');
  }, 60_000);
});
