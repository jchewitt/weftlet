import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => JSON.stringify(value, (_, item) => item && !Array.isArray(item) &&
  typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

/** No labels/expected answers enter this module. Locations and native identities are retained. */
export function sourceSpan(path, range, sources, commit) {
  path = String(path ?? '').replaceAll('\\', '/');
  if (!Object.hasOwn(sources, path)) return { path, invalid: 'source outside selected committed inputs' };
  const [startLine, startColumn, endLine, endColumn] = range;
  const lines = sources[path].split('\n');
  const valid = Number.isInteger(startLine) && startLine > 0 && endLine >= startLine && endLine <= lines.length &&
    (startColumn === null || (Number.isInteger(startColumn) && startColumn > 0 && startColumn <= lines[startLine - 1].length + 1)) &&
    (endColumn === null || (Number.isInteger(endColumn) && endColumn >= 1 && endColumn <= lines[endLine - 1].length + 1)) &&
    (startLine !== endLine || startColumn === null || endColumn === null || endColumn >= startColumn);
  return { path, startLine, startColumn, endLine, endColumn, digest: digest(sources[path]), commit,
    ...(valid ? {} : { invalid: 'invalid native source range' }) };
}

const localId = (path, symbol) => symbol.startsWith('local ') ? `local:${path}:${symbol}` : symbol;
const scipRange = range => range.length === 3
  ? [range[0] + 1, range[1] + 1, range[0] + 1, range[2] + 1]
  : [range[0] + 1, range[1] + 1, range[2] + 1, range[3] + 1];

export function normalizeScip(raw, sources, commit) {
  const entities = new Map();
  const references = [];
  const diagnostics = [];
  for (const document of raw.documents ?? []) {
    const path = document.relative_path.replaceAll('\\', '/');
    for (const occurrence of document.occurrences ?? []) {
      if (!occurrence.symbol) continue;
      const id = localId(path, occurrence.symbol);
      const entity = entities.get(id) ?? { id, nativeId: occurrence.symbol, definitions: [] };
      entities.set(id, entity);
      const span = sourceSpan(path, scipRange(occurrence.range), sources, commit);
      if (occurrence.symbol_roles & 1) entity.definitions.push(span);
      else references.push({ target: id, span, relation: 'reference', authority: 'implemented' });
      for (const diagnostic of occurrence.diagnostics ?? []) diagnostics.push({ code: 'native-diagnostic', span, native: diagnostic });
    }
  }
  for (const reference of references) {
    const declarations = entities.get(reference.target).definitions;
    if (!declarations.length) diagnostics.push({ code: 'no-indexed-definition', span: reference.span, target: reference.target });
    else if (declarations.every(site => /\.d\.[cm]?ts$/.test(site.path))) {
      diagnostics.push({ code: 'declaration-only', span: reference.span, target: reference.target });
    }
  }
  return { arm: 'raw-scip', granularity: 'occurrence', entities: [...entities.values()], references, diagnostics,
    unsupportedTracks: ['call'], rawCounts: { documents: raw.documents?.length ?? 0,
      occurrences: (raw.documents ?? []).reduce((sum, document) => sum + document.occurrences.length, 0) } };
}

function graphifyRange(location) {
  const match = /^L?(\d+)(?:-L?(\d+))?$/.exec(String(location ?? ''));
  return match ? [Number(match[1]), null, Number(match[2] ?? match[1]), null] : [NaN, null, NaN, null];
}

export function normalizeGraphify(raw, sources, commit) {
  const entities = new Map();
  const diagnostics = [];
  for (const node of raw.nodes ?? []) {
    const entity = entities.get(node.id) ?? { id: node.id, nativeId: node.id, definitions: [] };
    entities.set(node.id, entity);
    if (node.source_file && node.source_location) {
      const span = sourceSpan(node.source_file, graphifyRange(node.source_location), sources, commit);
      // The pinned emitter labels file nodes with path.name; they are not declarations on line 1.
      // This is file-kind discrimination within one cited path, never a name-based entity join.
      if (node.file_type === 'code' && !node._callable && node.label === node.source_file.split('/').at(-1)) {
        entity.fileSpan = span;
      } else if (!entity.definitions.some(value => canonical(value) === canonical(span))) entity.definitions.push(span);
      if (node.definition_file && node.definition_location) {
        entity.definitions.push(sourceSpan(node.definition_file, graphifyRange(node.definition_location), sources, commit));
      }
    }
    for (const unresolved of node.metadata?.unresolved_calls ?? []) diagnostics.push({ code: 'unresolved-call',
      span: sourceSpan(unresolved.file ?? node.source_file, graphifyRange(unresolved.line), sources, commit), native: unresolved });
  }
  const references = [];
  const unprojectedRelations = {};
  for (const edge of raw.edges ?? []) {
    if (!['references', 'calls', 'uses', 'imports', 'reexports', 'indirect_call'].includes(edge.relation)) {
      unprojectedRelations[edge.relation] = (unprojectedRelations[edge.relation] ?? 0) + 1;
      continue;
    }
    references.push({ target: edge.target, caller: edge.source,
      span: sourceSpan(edge.source_file, graphifyRange(edge.source_location), sources, commit),
      relation: edge.relation === 'calls' ? 'call' : edge.relation === 'indirect_call' ? 'possible-call' : 'reference',
      nativeRelation: edge.relation, nativeConfidence: edge.confidence,
      confidence: Number.isFinite(edge.confidence_score) ? edge.confidence_score : edge.confidence === 'EXTRACTED' ? 1 : null,
      authority: edge.confidence === 'EXTRACTED' ? 'implemented' : 'inferred' });
  }
  for (const reference of references) {
    const declarations = entities.get(reference.target)?.definitions ?? [];
    if (declarations.length && declarations.every(site => /\.d\.[cm]?ts$/.test(site.path))) {
      diagnostics.push({ code: 'declaration-only', span: reference.span, target: reference.target });
    }
  }
  return { arm: 'graphify-static', granularity: 'native-line', entities: [...entities.values()], references, diagnostics,
    unsupportedTracks: [], unprojectedRelations, failedSources: raw.failed_sources ?? [],
    skippedSources: raw.skipped_sources ?? [], rawCounts: { nodes: raw.nodes?.length ?? 0, edges: raw.edges?.length ?? 0 } };
}

export function normalizeCurrent(facts) {
  const entities = new Map();
  const references = [];
  for (const fact of facts) {
    const entity = entities.get(fact.object.id) ?? { id: fact.object.id, nativeId: fact.object.label, definitions: [] };
    entities.set(entity.id, entity);
    const span = { path: fact.provenance.path, startLine: fact.provenance.startLine, endLine: fact.provenance.endLine,
      startColumn: null, endColumn: null, digest: fact.provenance.digest, commit: fact.provenance.commitSha };
    if (fact.predicate === 'contains') entity.definitions.push(span);
    else references.push({ target: entity.id, span, relation: 'reference', authority: 'implemented' });
  }
  return { arm: 'weftlet-scip', granularity: 'file-symbol', entities: [...entities.values()], references,
    diagnostics: [], unsupportedTracks: ['definition', 'reference', 'call'], rawCounts: { facts: facts.length } };
}
