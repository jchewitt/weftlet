import { canonical, digest } from './normalize.mjs';

const overlaps = (span, anchor) => !span.invalid && span.path === anchor.path &&
  span.startLine <= anchor.line && span.endLine >= anchor.line &&
  (span.startColumn === null || (span.startLine < anchor.line || span.startColumn <= anchor.column)) &&
  (span.endColumn === null || (span.endLine > anchor.line || span.endColumn >= anchor.column + anchor.length));

/** Transform frozen anchors mechanically; the normalizers never see the case labels. */
export function caseLocations(suite, corpus, sources, scenario) {
  const locations = {};
  const changes = scenario.id === 'dirty' ? [] : scenario.operations;
  const used = new Set([...suite.cases.map(item => item.from), ...Object.values(suite.entities).flat(), ...suite.gaps.map(gap => gap.from)]);
  for (const [id, anchor] of Object.entries(suite.anchors)) {
    if (!used.has(id)) continue;
    if (!anchor.path.startsWith(`${corpus.root}/`)) continue;
    let path = anchor.path.slice(corpus.root.length + 1);
    let text = anchor.text;
    for (const change of changes) {
      if (change.path !== path) continue;
      if (change.kind === 'rename') path = change.to;
      if (change.kind === 'replace' && text === change.before) text = change.after;
    }
    if (!(path in sources)) continue;
    const offset = sources[path].indexOf(text);
    if (offset < 0 || sources[path].indexOf(text, offset + 1) !== -1) throw new Error(`Ambiguous scenario anchor: ${id}`);
    const token = text.indexOf(anchor.token);
    if (token < 0) throw new Error(`Missing scenario token: ${id}`);
    const position = offset + token;
    locations[id] = { path, line: sources[path].slice(0, position).split('\n').length,
      column: position - sources[path].lastIndexOf('\n', position - 1), length: anchor.token.length };
  }
  return locations;
}

export function scoreNative(normalized, suite, locations, sources, commit) {
  const validity = span => !span.invalid && span.commit === commit && Object.hasOwn(sources, span.path) && span.digest === digest(sources[span.path]);
  const mapping = new Map();
  for (const entity of normalized.entities) {
    const families = Object.entries(suite.entities).filter(([, declarations]) => declarations.some(id => locations[id] &&
      entity.definitions.some(span => validity(span) && overlaps(span, locations[id])))).map(([id]) => id);
    mapping.set(entity.id, families);
  }
  const considered = new Set();
  const cases = [];
  const removedCases = [];
  for (const item of suite.cases) {
    const from = locations[item.from];
    if (!from || !suite.entities[item.to].some(id => locations[id])) { removedCases.push(item.id); continue; }
    const unsupported = normalized.unsupportedTracks.includes(item.track);
    const candidates = item.track === 'definition'
      ? normalized.entities.filter(entity => entity.definitions.some(span => suite.entities[item.to]
        .some(anchor => locations[anchor] && overlaps(span, locations[anchor]))))
        .map(entity => ({ target: entity.id, spans: entity.definitions }))
      : normalized.references.filter((reference, index) => {
        const selected = overlaps(reference.span, from) && (item.track !== 'call' || reference.relation === 'call');
        if (selected) considered.add(index);
        return selected;
      }).map(reference => ({ target: reference.target, spans: [reference.span], caller: reference.caller }));
    const judged = [...new Map(candidates.map(candidate => [candidate.target, candidate])).values()];
    const ambiguousSource = normalized.granularity === 'native-line' && new Set(judged.map(candidate =>
      mapping.get(candidate.target)?.length === 1 ? mapping.get(candidate.target)[0] : candidate.target)).size > 1;
    const correct = judged.filter(candidate => mapping.get(candidate.target)?.length === 1 &&
      mapping.get(candidate.target)[0] === item.to && candidate.spans.every(validity) &&
      (item.track !== 'call' || normalized.entities.some(entity => entity.id === candidate.caller &&
        (entity.definitions.some(validity) || (entity.fileSpan && validity(entity.fileSpan))))));
    const asserted = item.expected === 'present' ? judged.length > 0 : correct.length > 0;
    const tp = !unsupported && !ambiguousSource && item.expected === 'present' && correct.length > 0 ? 1 : 0;
    const fn = item.expected === 'present' && !tp ? 1 : 0;
    const fp = !unsupported && !ambiguousSource && ((item.expected === 'absent' && asserted) ||
      (item.expected === 'present' && judged.some(candidate => !correct.includes(candidate)))) ? 1 : 0;
    cases.push({ id: item.id, from: item.from, track: item.track, expected: item.expected, tp, fp, fn, unsupported, ambiguousSource,
      outcome: unsupported ? 'unsupported' : ambiguousSource ? 'ambiguous-source-location' : fp ? 'false-join-or-invalid-citation' : tp ? 'supported' : fn ? 'missing' : 'correctly-absent',
      nativeTargets: judged.map(candidate => ({ id: candidate.target, mappedFamilies: mapping.get(candidate.target) ?? [] })),
      coarseCandidate: normalized.granularity === 'file-symbol' && (item.track === 'definition'
        ? normalized.entities.some(entity => mapping.get(entity.id)?.includes(item.to) && entity.definitions.some(span => span.path === from.path))
        : normalized.references.some(reference => reference.span.path === from.path && mapping.get(reference.target)?.includes(item.to))) });
  }
  const tracks = Object.fromEntries(['definition', 'reference', 'call'].map(track => {
    const rows = cases.filter(item => item.track === track);
    const tp = rows.reduce((n, row) => n + row.tp, 0), fp = rows.reduce((n, row) => n + row.fp, 0), fn = rows.reduce((n, row) => n + row.fn, 0);
    return [track, { cases: rows.length, tp, fp, fn, precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null, unsupported: rows.filter(row => row.unsupported).length,
      ambiguousSource: rows.filter(row => row.ambiguousSource).length }];
  }));
  const requiredGapCodes = { 'external-implementation': ['declaration-only'], 'dynamic-target': ['unresolved-call'], 'undeclared-queue': ['missing-wiring'] };
  const gaps = suite.gaps.filter(gap => locations[gap.from]).map(gap => ({ id: gap.id,
    status: cases.some(row => row.from === gap.from && row.fp) ? 'fabricated' : normalized.diagnostics.some(diagnostic => requiredGapCodes[gap.id].includes(diagnostic.code) &&
      validity(diagnostic.span) && overlaps(diagnostic.span, locations[gap.from])) ? 'explicit' : 'silent' }));
  const allSpans = [...normalized.entities.flatMap(entity => entity.definitions), ...normalized.references.map(reference => reference.span)];
  return { tracks, cases, removedCases, gaps, invalidCitations: allSpans.filter(span => !validity(span)),
    ambiguousIdentities: [...mapping].filter(([, families]) => families.length > 1).map(([id, families]) => ({ id, families })),
    unjudgedReferences: normalized.references.length - considered.size,
    declarationSpans: Object.entries(suite.entities).filter(([, ids]) => ids.some(id => locations[id])).map(([id, ids]) => ({ id,
      expected: ids.filter(anchor => locations[anchor]).length, found: ids.filter(anchor => locations[anchor] && normalized.entities.some(entity =>
        mapping.get(entity.id)?.includes(id) && entity.definitions.some(span => validity(span) && overlaps(span, locations[anchor])))).length })),
    logicalDigest: digest(canonical(normalized)) };
}
