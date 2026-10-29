import { codeSymbolNode, repositoryFileNode, type CodeOccurrence, type CodeRange, type CodeSymbolNode,
  type ExtractionContext, type ExtractorIdentity, type GraphFact, type SourceSpan } from '@weftlet/core';
import { sha256, stableJson } from '../infrastructure/util.js';
import type { ScipIndex } from './scip-runtime.js';
import { comparePosition, containsRange, rangeText, scipRange } from './scip-ranges.js';

interface Site {
  readonly key: string;
  readonly nativeSymbol: string;
  readonly nativeRoles: number;
  readonly definition: boolean;
  readonly label: string;
  readonly span: SourceSpan & CodeRange;
  readonly declarationRange?: CodeRange;
}

function readSites(index: ScipIndex, sources: ReadonlyMap<string, string>, commitSha: string): Site[] {
  const result: Site[] = [];
  for (const document of index.documents) {
    const path = document.relative_path.replaceAll('\\', '/');
    if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path) ||
        path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid SCIP repository path');
    const content = sources.get(path);
    if (content === undefined) throw new Error(`Missing committed SCIP source: ${path}`);
    const lines = content.split('\n'), digest = sha256(content);
    for (const occurrence of document.occurrences) {
      if (!occurrence.symbol) continue;
      if (!Number.isSafeInteger(occurrence.symbol_roles) || occurrence.symbol_roles < 0) throw new Error('Invalid SCIP symbol roles');
      const range = scipRange(occurrence.range, lines, path);
      const definition = (occurrence.symbol_roles & 1) !== 0;
      const declarationRange = definition && occurrence.enclosing_range?.length
        ? scipRange(occurrence.enclosing_range, lines, path) : undefined;
      // Native extents may cover an arrow initializer after its variable name.
      // Preserve both ranges; containment of the name is not a SCIP invariant.
      result.push({ key: stableJson([occurrence.symbol.startsWith('local ') ? path : '', occurrence.symbol]),
        nativeSymbol: occurrence.symbol, nativeRoles: occurrence.symbol_roles, definition,
        label: rangeText(range, lines), span: { path, ...range, digest, commitSha },
        ...(declarationRange ? { declarationRange } : {}) });
    }
  }
  return result;
}

function symbolsFor(sites: readonly Site[], context: ExtractionContext, indexDigest: string): Map<string, CodeSymbolNode> {
  const grouped = new Map<string, Site[]>();
  for (const site of sites) {
    const group = grouped.get(site.key) ?? [];
    group.push(site); grouped.set(site.key, group);
  }
  return new Map([...grouped].map(([key, group]) => {
    const definitions = group.filter(site => site.definition);
    const first = group[0]!, local = first.nativeSymbol.startsWith('local ');
    const labels = definitions.map(site => site.label).filter(Boolean).sort();
    const node = codeSymbolNode({ schemaVersion: 1, provider: 'scip-typescript', repositoryId: context.repositoryId,
      nativeSymbol: first.nativeSymbol, identityScope: local ? 'index-document' : 'repository',
      ...(local ? { documentPath: first.span.path, indexDigest } : {}),
      resolution: definitions.length === 0 ? 'no-indexed-definition' : definitions.every(site => /\.d\.[cm]?ts$/.test(site.span.path))
        ? 'declaration-only' : 'indexed-definition' }, labels[0] ?? first.nativeSymbol);
    return [key, node];
  }));
}

/** Sweep sorted sites against active native declaration extents, not every declaration in the file. */
function enclosures(sites: readonly Site[], symbols: ReadonlyMap<string, CodeSymbolNode>): Map<Site, Pick<CodeOccurrence, 'enclosure' | 'enclosingSymbolId'>> {
  const result = new Map<Site, Pick<CodeOccurrence, 'enclosure' | 'enclosingSymbolId'>>();
  const files = new Map<string, Site[]>();
  for (const site of sites) {
    const group = files.get(site.span.path) ?? []; group.push(site); files.set(site.span.path, group);
  }
  for (const group of files.values()) {
    const ordered = [...group].sort((a, b) => comparePosition(a.span.startLine, a.span.startColumn, b.span.startLine, b.span.startColumn));
    const scopes = group.filter(site => site.declarationRange).sort((a, b) => comparePosition(
      a.declarationRange!.startLine, a.declarationRange!.startColumn, b.declarationRange!.startLine, b.declarationRange!.startColumn));
    let cursor = 0;
    let active: Site[] = [];
    for (const site of ordered) {
      while (cursor < scopes.length && comparePosition(scopes[cursor]!.declarationRange!.startLine,
        scopes[cursor]!.declarationRange!.startColumn, site.span.startLine, site.span.startColumn) <= 0) active.push(scopes[cursor++]!);
      active = active.filter(scope => comparePosition(scope.declarationRange!.endLine,
        scope.declarationRange!.endColumn, site.span.startLine, site.span.startColumn) >= 0);
      // A recursive reference is enclosed by its own symbol; its definition is not self-enclosed.
      const candidates = active.filter(scope => !(site.definition && scope.key === site.key) && containsRange(scope.declarationRange!, site.span));
      const narrowest = candidates.filter(scope => !candidates.some(other =>
        containsRange(scope.declarationRange!, other.declarationRange!) && !containsRange(other.declarationRange!, scope.declarationRange!)));
      const ids = [...new Set(narrowest.map(scope => symbols.get(scope.key)!.id))];
      result.set(site, ids.length === 1 ? { enclosure: 'native-range', enclosingSymbolId: ids[0]! }
        : { enclosure: ids.length ? 'ambiguous' : 'file' });
    }
  }
  return result;
}

export function extractCodeOccurrences(index: ScipIndex, sources: ReadonlyMap<string, string>, context: ExtractionContext,
  indexDigest: string, identity: ExtractorIdentity): readonly GraphFact[] {
  const sites = readSites(index, sources, context.commitSha);
  const symbols = symbolsFor(sites, context, indexDigest);
  const byId = new Map([...symbols.values()].map(symbol => [symbol.id, symbol]));
  const scopes = enclosures(sites, symbols);
  const facts = sites.map(site => {
    const symbol = symbols.get(site.key)!;
    const scope = scopes.get(site)!;
    const file = repositoryFileNode(site.span.path);
    const codeOccurrence: CodeOccurrence = { schemaVersion: 1, role: site.definition ? 'definition' : 'reference',
      locationKind: site.span.startLine === site.span.endLine && site.span.startColumn === site.span.endColumn ? 'zero-width-anchor' : 'name',
      nativeRoles: site.nativeRoles, ...scope, ...(site.declarationRange ? { declarationRange: site.declarationRange } : {}) };
    const fact: Omit<GraphFact, 'id' | 'snapshotId'> = {
      subject: site.definition ? symbol : scope.enclosingSymbolId ? byId.get(scope.enclosingSymbolId)! : file,
      predicate: site.definition ? 'definedBy' : 'references', object: site.definition ? file : symbol,
      provenance: site.span, codeOccurrence, extractor: identity, authority: 'implemented', extractionReview: 'deterministic', confidence: 1,
    };
    return { ...fact, id: sha256(stableJson(fact)), snapshotId: context.snapshotId };
  });
  // Duplicate native entries at the identical target/range/role add no distinct evidence.
  return [...new Map(facts.map(fact => [fact.id, fact])).values()].sort((a, b) => a.id.localeCompare(b.id));
}
