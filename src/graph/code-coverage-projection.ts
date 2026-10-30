import { repositoryFileNode, type CodeCoverageCounts, type CodeCoverageOverview, type CodeFileCoverage,
  type CodeInventory, type CodeProjectCoverage, type GraphFact, type GraphSnapshot } from '@weftlet/core';
import { sha256, stableJson } from '../infrastructure/util.js';

export const codeCoverageLimits = [
  'Inventory covers regular committed TypeScript-family files and nearest package.json boundaries, not compiler projects or verified workspace membership.',
  'Code roots, requested entry files and observed SCIP documents are separate measurements. Neither selection nor an import alone proves a file was indexed.',
  'Connections count retained indexed code references across package boundaries, not asynchronous product links, runtime delivery or business impact.',
  'Zero observed connections or unresolved references does not prove isolation or complete resolution. Other languages, dynamic targets and absent evidence remain outside this measurement.',
  'Saved or draft coverage never establishes current-diff validity; use graph.neighbors on file/symbol IDs to inspect cited implementation evidence.',
] as const;

function validInventory(snapshot: GraphSnapshot): CodeInventory | undefined {
  const inventory = snapshot.manifest.codeInventory;
  if (!inventory || inventory.version !== 'committed-code-inventory-v1' || inventory.scipIndexDigest !== snapshot.manifest.scipIndexDigest) return;
  const { digest, ...plain } = inventory;
  if (sha256(stableJson(plain)) !== digest) return;
  return inventory;
}
function totals(files: readonly CodeFileCoverage[]): CodeCoverageCounts {
  const count = (test: (file: CodeFileCoverage) => boolean) => files.filter(test).length;
  const sum = (key: 'references' | 'unresolvedReferences' | 'declarationOnlyReferences' | 'implementationGaps') => files.reduce((n, file) => n + file[key], 0);
  return { files: files.length, codeRootSelected: count(file => file.codeRootSelected),
    requested: count(file => file.requested === 'included'), excludedFromRequest: count(file => file.requested === 'excluded'),
    requestUnknown: count(file => file.requested === 'unknown'), indexed: count(file => file.indexed === true),
    indexUnknown: count(file => file.indexed === undefined), requestedNotIndexed: count(file => file.requested === 'included' && file.indexed === false),
    indexedOutsideRequest: count(file => file.requested === 'excluded' && file.indexed === true),
    references: sum('references'), unresolvedReferences: sum('unresolvedReferences'), declarationOnlyReferences: sum('declarationOnlyReferences'),
    implementationGaps: sum('implementationGaps') };
}

type MeasuredFile = { -readonly [K in keyof CodeFileCoverage]: CodeFileCoverage[K] };

function definitionProjects(facts: readonly GraphFact[], byPath: ReadonlyMap<string, MeasuredFile>) {
  const definitions = new Map<string, Set<string>>();
  for (const fact of facts) if (fact.codeOccurrence?.role === 'definition') {
    const owner = byPath.get(fact.provenance.path)?.projectRoot;
    if (owner === undefined) continue;
    const roots = definitions.get(fact.subject.id) ?? new Set<string>(); roots.add(owner); definitions.set(fact.subject.id, roots);
  }
  return definitions;
}

function measureReferences(facts: readonly GraphFact[], byPath: ReadonlyMap<string, MeasuredFile>) {
  const definitions = definitionProjects(facts, byPath);
  const connections = new Map<string, { peers: Set<string>; incoming: Set<string>; outgoing: Set<string> }>();
  const project = (root: string) => {
    if (!connections.has(root)) connections.set(root, { peers: new Set(), incoming: new Set(), outgoing: new Set() });
    return connections.get(root)!;
  };
  const crossReferences = new Set<string>(), seen = new Set<string>();
  for (const fact of facts) {
    if (fact.codeOccurrence?.role !== 'reference' || seen.has(fact.id)) continue;
    seen.add(fact.id);
    const file = byPath.get(fact.provenance.path); if (!file) continue;
    file.references++;
    const targets = definitions.get(fact.object.id);
    if (!targets?.size || fact.object.codeSymbol?.resolution === 'no-indexed-definition') file.unresolvedReferences++;
    if (fact.object.codeSymbol?.resolution === 'declaration-only') file.declarationOnlyReferences++;
    for (const root of targets ?? []) if (root !== file.projectRoot) {
      crossReferences.add(fact.id);
      project(file.projectRoot).peers.add(root); project(file.projectRoot).outgoing.add(fact.id);
      project(root).peers.add(file.projectRoot); project(root).incoming.add(fact.id);
    }
  }
  return { project, crossReferences };
}

/** Derived only from saved inventory and retained occurrence facts; does not invent graph edges. */
export function projectCodeCoverage(snapshot: GraphSnapshot): {
  overview: CodeCoverageOverview; projects: readonly CodeProjectCoverage[]; files: readonly CodeFileCoverage[];
} {
  const inventory = validInventory(snapshot);
  if (!inventory) return { overview: { scope: 'saved-snapshot', status: snapshot.manifest.codeInventory ? 'invalid-inventory' : 'unavailable',
    limitations: codeCoverageLimits }, projects: [], files: [] };
  const files = inventory.files.map(file => ({ ...file, nodeId: repositoryFileNode(file.path).id,
    references: 0, unresolvedReferences: 0, declarationOnlyReferences: 0, implementationGaps: 0 }));
  const byPath = new Map(files.map(file => [file.path, file]));
  const { project, crossReferences } = measureReferences(snapshot.facts, byPath);
  for (const gap of snapshot.diagnostics ?? []) if (gap.kind === 'implementationGaps') {
    for (const path of new Set(gap.provenance.map(span => span.path))) {
      const file = byPath.get(path); if (file) file.implementationGaps++;
    }
  }
  const groups = new Map<string, CodeFileCoverage[]>();
  for (const file of files) { const group = groups.get(file.projectRoot) ?? []; group.push(file); groups.set(file.projectRoot, group); }
  const projects = inventory.projects.map(item => ({ root: item.root, ...(item.manifest ? { manifestPath: item.manifest.path } : {}),
    counts: totals(groups.get(item.root) ?? []), connectedProjects: project(item.root).peers.size,
    outgoingReferences: project(item.root).outgoing.size, incomingReferences: project(item.root).incoming.size }));
  return { overview: { scope: 'saved-snapshot', status: 'recorded', inventoryDigest: inventory.digest, selection: inventory.selection,
    indexObservation: inventory.indexObservation, projects: projects.length, totals: totals(files),
    crossProjectReferences: crossReferences.size, otherIndexedFiles: inventory.otherIndexedFiles, limitations: codeCoverageLimits }, projects, files };
}

export function codeCoverageDescription(code?: CodeCoverageOverview): string {
  if (!code || code.status !== 'recorded' || !code.totals) return `Saved repository code coverage: ${code?.status ?? 'unavailable'}; absence is not zero coverage.`;
  const n = code.totals;
  return `Saved repository code coverage (TypeScript-family files): ${n.files} inventoried; ${n.codeRootSelected} selected by code roots; ` +
    `${n.requested} requested entries, ${n.excludedFromRequest} outside entries, ${n.requestUnknown} selection unknown; ` +
    `${n.indexed} observed in SCIP, ${n.indexUnknown} index observation unknown, ${n.requestedNotIndexed} requested but not observed. ` +
    `${code.crossProjectReferences} observed cross-package references; ${n.unresolvedReferences} references lack an indexed definition; ` +
    `${n.declarationOnlyReferences} reference declaration-only targets; ${n.implementationGaps} cited implementation gaps. ` +
    'These are saved-snapshot measurements, not completeness or no-impact claims. Use graph.coverage for package/file pages.';
}
