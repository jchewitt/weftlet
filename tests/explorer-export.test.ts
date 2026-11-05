import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphCatalogView, GraphDirection } from '@weftlet/core';
import { createExplorerFixtureProject } from '../examples/explorer/create-project.js';
import { createExplorerService } from '../src/application/explorer-service.js';
import { exportExplorerReport } from '../src/application/explorer-export.js';
import { PortableEvidenceSource } from '../src/visualization/explorer/portable-client.js';
import { writeReportJson } from '../src/visualization/report-json.js';

const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
async function reader(output: string) {
  return PortableEvidenceSource.open(await json(join(output, 'explorer.json')), async path => {
    const bytes = await readFile(join(output, path));
    expect(path).toBe(`data/${createHash('sha256').update(bytes).digest('hex')}.json`);
    return JSON.parse(bytes.toString('utf8'));
  });
}

it('exports complete selected neighborhoods with exact live-query parity, stable repeat shards and explicit boundaries', async () => {
  const fixture = await createExplorerFixtureProject(500), snapshotId = fixture.snapshot.manifest.snapshotId;
  try {
    const service = await createExplorerService(fixture.configPath, snapshotId);
    const before = await fixture.store.readRevision(snapshotId);
    const snapshotFile = join(fixture.root, '.context-graph/snapshots', (await readdir(join(fixture.root, '.context-graph/snapshots')))[0]!);
    const snapshotBytes = await readFile(snapshotFile);
    const output = join(fixture.root, '.context-graph/reports/first');
    const exported = await exportExplorerReport(service, { output, roots: ['capability:orders'], depth: 3 });
    expect(exported.report).toMatchObject({ includedFacts: 4, expandedNodes: 4, frontierNodes: 1, sourceFacts: 506 });
    const portable = await reader(output);
    const index = await json(join(output, exported.report.indexFile));
    for (const entry of index.expanded) for (const direction of ['both', 'incoming', 'outgoing'] as GraphDirection[]) {
      for (const predicates of [[], ['routesThrough'], ['realizes', 'governedBy']] as const) {
        let localCursor: string | undefined, portableCursor: string | undefined;
        const seen = new Set<string>();
        do {
          const request = { snapshotId, nodeId: entry.nodeId, direction, predicates, maxFacts: 1 };
          const live = await service.exploration.neighbors({ ...request, continuation: localCursor });
          const offline = await portable.neighbors({ ...request, continuation: portableCursor });
          for (const key of ['snapshot', 'focus', 'facts', 'coverage', 'diagnostics', 'frontier'] as const) expect(offline[key]).toEqual(live[key]);
          const { version: _a, continuation: _b, ...localSelection } = live.selection;
          const { version: _c, continuation: _d, ...portableSelection } = offline.selection;
          expect(portableSelection).toEqual(localSelection);
          for (const fact of offline.facts) { expect(seen.has(fact.id)).toBe(false); seen.add(fact.id); }
          localCursor = live.selection.continuation; portableCursor = offline.selection.continuation;
          expect(Boolean(portableCursor)).toBe(Boolean(localCursor));
        } while (portableCursor);
      }
    }
    const expanded = new Set(index.expanded.map((item: { nodeId: string }) => item.nodeId));
    for (const view of ['intent', 'contracts', 'implementation', 'evidence', 'all'] as GraphCatalogView[]) {
      const full = []; let continuation: string | undefined;
      do { const page = await service.discovery.catalog({ snapshotId, view, maxNodes: 100, continuation }); full.push(...page.nodes); continuation = page.selection.continuation; } while (continuation);
      const included = []; continuation = undefined;
      do { const page = await portable.catalog({ snapshotId, view, maxNodes: 2, continuation }); included.push(...page.nodes); continuation = page.selection.continuation; } while (continuation);
      expect(included).toEqual(full.filter(entry => expanded.has(entry.node.id)));
    }
    const fact = await portable.fact({ snapshotId, factId: 'policy-queue' });
    expect(Object.isFrozen(fact.fact)).toBe(true); expect(Object.isFrozen(fact.fact!.provenance)).toBe(true);
    const { markdown: _liveText, ...liveDetail } = await service.discovery.fact({ snapshotId, factId: 'policy-queue' });
    const { markdown: _portableText, ...portableDetail } = fact; expect(portableDetail).toEqual(liveDetail);
    expect(portable.canExplore('component:file:src/worker.ts')).toBe(false);
    await expect(portable.neighbors({ snapshotId, nodeId: 'component:file:src/worker.ts' })).rejects.toThrow('outside the focused report');
    await expect(portable.fact({ snapshotId, factId: 'draft' })).rejects.toThrow('outside this focused report');
    await expect(portable.paths({ snapshotId, fromNodeId: 'workflow:reserve', toNodeId: 'workflow:ship' })).rejects.toThrow('Full-snapshot');
    await expect(portable.catalog({ snapshotId: 'other' })).rejects.toThrow('report snapshot');
    const first = await portable.catalog({ snapshotId, maxNodes: 1 });
    await expect(portable.catalog({ snapshotId, maxNodes: 2, continuation: first.selection.continuation })).rejects.toThrow('continuation');
    const again = await exportExplorerReport(service, { output: join(fixture.root, '.context-graph/reports/repeat'), roots: ['capability:orders', 'capability:orders'], depth: 3 });
    expect(again.report).toEqual(exported.report); expect(again.evidenceDigest).toBe(exported.evidenceDigest);
    for (const file of await readdir(join(output, 'data'))) expect(await readFile(join(again.output, 'data', file))).toEqual(await readFile(join(output, 'data', file)));
    expect(await fixture.store.readRevision(snapshotId)).toBe(before);
    expect(await readFile(snapshotFile)).toEqual(snapshotBytes);
  } finally { await fixture.cleanup(); }
});

it('retrieves every assertion across multiple hashed shards and bounded pages without pruning a high-degree root', async () => {
  const fixture = await createExplorerFixtureProject(350);
  try {
    const snapshotId = 'public-hub', root = fixture.snapshot.facts.find(fact => fact.id === 'code-000000')!.subject;
    await fixture.store.write({ ...fixture.snapshot, manifest: { ...fixture.snapshot.manifest, snapshotId },
      facts: fixture.snapshot.facts.map(fact => ({ ...fact, snapshotId, ...(fact.id.startsWith('code-') ? { subject: root } : {}) })) });
    const service = await createExplorerService(fixture.configPath, snapshotId);
    const exported = await exportExplorerReport(service, { output: join(fixture.root, '.context-graph/hub-report'), roots: [root.id], depth: 1 });
    expect(exported.report.includedFacts).toBe(350);
    const index = await json(join(exported.output, exported.report.indexFile));
    expect(new Set(index.facts.map((item: { chunk: string }) => item.chunk)).size).toBe(4);
    const portable = await reader(exported.output), seen: string[] = [];
    let continuation: string | undefined, localContinuation: string | undefined;
    do {
      const request = { snapshotId, nodeId: root.id, maxFacts: 60 };
      const page = await portable.neighbors({ ...request, continuation });
      const live = await service.exploration.neighbors({ ...request, continuation: localContinuation });
      expect(page.facts).toEqual(live.facts); expect(page.frontier).toEqual(live.frontier);
      seen.push(...page.facts.map(fact => fact.id));
      continuation = page.selection.continuation; localContinuation = live.selection.continuation;
    } while (continuation);
    expect(new Set(seen).size).toBe(350); expect(seen).toEqual(index.facts.map((item: { factId: string }) => item.factId));
  } finally { await fixture.cleanup(); }
});

it('rejects incomplete exports and existing outputs, cleans failures, and isolates concurrent publishers', async () => {
  const fixture = await createExplorerFixtureProject(0);
  try {
    const service = await createExplorerService(fixture.configPath, fixture.snapshot.manifest.snapshotId);
    const parent = join(fixture.root, '.context-graph/reports'), output = join(parent, 'bounded');
    for (const options of [{ maxFacts: 1 }, { maxNodes: 1 }, { maxBytes: 80 }, { roots: ['missing'] }, { depth: 0 }]) {
      await expect(exportExplorerReport(service, { output, roots: ['workflow:reserve'], ...options })).rejects.toThrow();
    }
    expect(await readdir(parent)).toEqual([]);
    const attempts = await Promise.allSettled([1, 2].map(() => exportExplorerReport(service, { output, roots: ['workflow:reserve'], depth: 3 })));
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1);
    const bytes = await readFile(join(output, 'explorer.json'));
    await expect(exportExplorerReport(service, { output, roots: ['workflow:ship'] })).rejects.toThrow('already exists');
    expect(await readFile(join(output, 'explorer.json'))).toEqual(bytes);
    expect(await readdir(parent)).toEqual(['bounded']);
    const empty = join(parent, 'empty'); await mkdir(empty);
    await expect(exportExplorerReport(service, { output: empty, roots: ['workflow:ship'] })).rejects.toThrow('already exists');
  } finally { await fixture.cleanup(); }
});

it('bounds serialization and rejects broken report tables without altering the snapshot', async () => {
  const fixture = await createExplorerFixtureProject(0);
  try {
    const data = join(fixture.root, '.context-graph/data'); await mkdir(data);
    await expect(writeReportJson(data, { content: 'x'.repeat(4000) }, 100)).rejects.toThrow('byte budget');
    expect(await readdir(data)).toEqual([]);
    const service = await createExplorerService(fixture.configPath, fixture.snapshot.manifest.snapshotId);
    const exported = await exportExplorerReport(service, { output: join(fixture.root, '.context-graph/report'), roots: ['workflow:reserve'] });
    const metadata = await json(join(exported.output, 'explorer.json'));
    await expect(PortableEvidenceSource.open(metadata, async () => ({ version: 1, evidenceDigest: 'different' }))).rejects.toThrow('pinned evidence');
    const index = await json(join(exported.output, exported.report.indexFile));
    const source = await PortableEvidenceSource.open(metadata, async path => path === exported.report.indexFile ? index : []);
    await expect(source.fact({ snapshotId: metadata.snapshot.snapshotId, factId: 'policy-queue' })).rejects.toThrow('missing assertion');
    await writeFile(join(exported.output, exported.report.indexFile), '{}');
    await expect(reader(exported.output)).rejects.toThrow();
  } finally { await fixture.cleanup(); }
});
