import { copyFile, lstat, mkdir, mkdtemp, open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { GraphFact } from '@weftlet/core';
import type { ExplorerService } from './explorer-service.js';
import type { ExplorerMetadata } from '../visualization/explorer-contract.js';
import type { PortableEvidenceIndex, PortableReportScope } from '../visualization/portable-contract.js';
import { catalogEntries } from '../graph/discovery-projection.js';
import { catalogViews } from '../graph/discovery-request.js';
import { relevantDiagnostic, selectDiagnostics } from '../graph/diagnostics.js';
import { explorerAssetFiles, explorerAssetsRoot } from '../visualization/explorer-assets.js';
import { writeReportJson } from '../visualization/report-json.js';
import { sourceLink } from '../visualization/source-links.js';
import { sha256 } from '../infrastructure/util.js';

export interface ExplorerExportOptions {
  readonly output: string;
  readonly roots: readonly string[];
  readonly depth?: number;
  readonly maxFacts?: number;
  readonly maxNodes?: number;
  readonly maxBytes?: number;
  readonly sourceUrlTemplate?: string;
}
function bound(value: number | undefined, fallback: number, max: number, name: string) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > max) throw new Error(`${name} must be an integer between 1 and ${max}`);
  return result;
}
function selectScope(service: ExplorerService, options: ExplorerExportOptions) {
  const depth = bound(options.depth, 2, 8, 'depth');
  const maxFacts = bound(options.maxFacts, 20_000, 100_000, 'maxFacts');
  const maxNodes = bound(options.maxNodes, 2_000, 10_000, 'maxNodes');
  const roots = [...new Set(options.roots)].sort();
  if (!roots.length || roots.length > 64 || roots.some(id => typeof id !== 'string' || !id.trim() || id.length > 8192)) {
    throw new Error('Choose between 1 and 64 exact report root node IDs');
  }
  for (const id of roots) if (!service.index.adjacency.has(id)) throw new Error('A selected report root is absent from the saved snapshot');
  const expanded = new Set<string>(), nodes = new Set(roots), facts = new Map<string, GraphFact>();
  let frontier = roots;
  for (let round = 0; round < depth; round++) {
    const next = new Set<string>();
    for (const id of frontier) {
      if (expanded.has(id)) continue;
      expanded.add(id);
      for (const fact of service.index.adjacency.get(id)!) {
        facts.set(fact.id, fact);
        for (const endpoint of [fact.subject.id, fact.object.id]) { nodes.add(endpoint); if (!expanded.has(endpoint)) next.add(endpoint); }
        if (facts.size > maxFacts || nodes.size > maxNodes) throw new Error('Portable report fact/node budget exceeded; select fewer roots or a smaller depth. No report was published.');
      }
    }
    frontier = [...next].sort();
  }
  return { roots, depth, expanded, nodes, facts: [...facts.values()].sort((a, b) => a.id < b.id ? -1 : 1) };
}
async function absent(path: string) {
  try { await lstat(path); throw new Error('Portable report output already exists; choose a new directory'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

/** Export complete neighborhoods of selected nodes. Frontier endpoints are explicitly not queryable. */
export async function exportExplorerReport(service: ExplorerService, options: ExplorerExportOptions) {
  const maxBytes = bound(options.maxBytes, 64 * 1024 * 1024, 256 * 1024 * 1024, 'maxBytes');
  const metadata = await service.metadata(), selection = selectScope(service, options);
  if (options.sourceUrlTemplate) sourceLink({ path: 'README.md', startLine: 1, endLine: 1, digest: '', commitSha: metadata.snapshot.commitSha }, options.sourceUrlTemplate);
  const output = resolve(options.output), parent = dirname(output);
  await mkdir(parent, { recursive: true });
  const lockPath = join(parent, `.weftlet-export-${sha256(output)}.lock`);
  const lock = await open(lockPath, 'wx'); // cooperating exports cannot replace each other's completed directory
  let stage: string | undefined;
  try {
    await absent(output);
    stage = await mkdtemp(join(parent, '.weftlet-report-'));
    await mkdir(join(stage, 'assets')); await mkdir(join(stage, 'data'));
    const assets = explorerAssetsRoot();
    await copyFile(new URL('index.html', assets), join(stage, 'index.html'));
    for (const name of explorerAssetFiles) await copyFile(new URL(name, assets), join(stage, 'assets', name));
    let dataBytes = 0;
    const write = async (value: unknown) => {
      const result = await writeReportJson(join(stage!, 'data'), value, Math.min(8 * 1024 * 1024, maxBytes - dataBytes));
      dataBytes += result.bytes; return `data/${result.name}`;
    };
    const factChunks: { factId: string; chunk: string }[] = [];
    for (let i = 0; i < selection.facts.length; i += 100) {
      const chunkFacts = selection.facts.slice(i, i + 100), chunk = await write(chunkFacts);
      factChunks.push(...chunkFacts.map(fact => ({ factId: fact.id, chunk })));
    }
    const overview = (await service.discovery.catalog({ snapshotId: metadata.snapshot.snapshotId, maxNodes: 1 })).overview;
    const index: PortableEvidenceIndex = { version: 1, evidenceDigest: metadata.evidenceDigest,
      roots: selection.roots, depth: selection.depth, overview,
      catalogs: Object.fromEntries(catalogViews.map(view => [view, catalogEntries(service.index, view, selection.expanded)])) as unknown as PortableEvidenceIndex['catalogs'],
      expanded: [...selection.expanded].sort().map(nodeId => ({ nodeId, factIds: service.index.adjacency.get(nodeId)!.map(fact => fact.id).sort() })),
      degrees: [...selection.nodes].sort().map(nodeId => ({ nodeId, count: service.index.adjacency.get(nodeId)!.length })),
      facts: factChunks,
      diagnostics: service.index.snapshot.diagnostics?.filter(item => relevantDiagnostic(item, {}, selection.facts, [], selection.nodes)) ?? [],
    };
    const indexFile = await write(index);
    const report: PortableReportScope = { scope: 'focused-report', indexFile, roots: selection.roots, depth: selection.depth,
      includedFacts: selection.facts.length, expandedNodes: selection.expanded.size, frontierNodes: selection.nodes.size - selection.expanded.size,
      sourceFacts: overview.facts, sourceNodes: overview.nodes };
    const portable: ExplorerMetadata = { ...metadata, mode: 'portable', report,
      capabilities: { paths: false, search: true },
      diagnostics: selectDiagnostics(service.index.snapshot, {}, selection.facts, [], [], selection.nodes),
      ...(options.sourceUrlTemplate ? { sourceUrlTemplate: options.sourceUrlTemplate } : {}) };
    // Metadata is bounded too; publish it under the app's stable entry-point name.
    const metadataFile = await write(portable);
    await rename(join(stage, metadataFile), join(stage, 'explorer.json'));
    await writeFile(join(stage, 'README.txt'), 'Focused Weftlet evidence report. Serve this directory through localhost HTTP or HTTPS. No API or model provider is needed. Nodes outside the report require the full saved snapshot. Review citations and snapshot metadata before sharing.\n');
    await service.pinned(); await absent(output);
    await rename(stage, output); stage = undefined;
    return { output, report, dataBytes, evidenceDigest: metadata.evidenceDigest };
  } finally {
    try { if (stage) await rm(stage, { recursive: true, force: true }); }
    finally { try { await lock.close(); } finally { await rm(lockPath, { force: true }); } }
  }
}
