import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { canonical, digest, normalizeCurrent, normalizeGraphify, normalizeScip } from './normalize.mjs';
import { caseLocations, scoreNative } from './score.mjs';

const spec = JSON.parse(await readFile(process.argv[2], 'utf8'));
const load = path => import(pathToFileURL(join(spec.baseline, path)).href);
const { RdfEvidenceGraph } = await load('dist/graph/rdf.js');
const { FileSnapshotStore } = await load('dist/storage/storage.js');
const { SnapshotImpactQueryService } = await load('dist/graph/query.js');
const { SnapshotGraphPathService } = await load('dist/graph/paths.js');
const { repositoryFileNode } = await load('packages/core/dist/index.js');
const { scoreImpactCase } = await load('scripts/evaluation/score.ts');
const baseline = JSON.parse(await readFile(join(spec.output, 'baseline.snapshot.json'), 'utf8'));
const raw = JSON.parse(await readFile(join(spec.output, 'scip.raw.json'), 'utf8'));
const graphify = JSON.parse(await readFile(join(spec.output, 'graphify.raw.json'), 'utf8'));
const sources = Object.fromEntries(await Promise.all(spec.selectedFiles.map(async path =>
  [path, await readFile(join(spec.isolatedRoot, path), 'utf8')])));
const suite = JSON.parse(await readFile(spec.cases, 'utf8'));
const allSources = { ...sources };
// Document anchors participate in the fixed business control, not code-extractor metrics.
for (const path of spec.allFiles.filter(path => path.endsWith('.md'))) allSources[path] = await readFile(join(spec.isolatedRoot, path), 'utf8');
const locations = caseLocations(suite, spec.corpus, allSources, spec.scenario);
const currentFacts = baseline.facts.filter(fact => fact.extractor.id === 'scip-symbol-extractor');
const common = baseline.facts.filter(fact => fact.extractor.id !== 'scip-symbol-extractor');
const started = performance.now();
const arms = [normalizeCurrent(currentFacts), normalizeScip(raw, sources, spec.commit), normalizeGraphify(graphify, sources, spec.commit)];
const normalizationSeconds = (performance.now() - started) / 1000;

function project(arm, snapshotId) {
  if (arm.arm === 'weftlet-scip') return currentFacts.map(fact => ({ ...fact, snapshotId }));
  const symbol = entity => ({ id: `study:${arm.arm}:${digest(entity.id)}`, kind: 'Contract', label: entity.nativeId });
  const entities = new Map(arm.entities.map(entity => [entity.id, entity]));
  const facts = [];
  function add(span, entity, predicate, authority, confidence = 1) {
    if (span.invalid || !Object.hasOwn(sources, span.path)) return;
    const provenance = { path: span.path, startLine: span.startLine, endLine: span.endLine,
      digest: span.digest, commitSha: span.commit };
    const fact = { subject: repositoryFileNode(span.path), predicate, object: symbol(entity), provenance,
      extractor: { id: `study-${arm.arm}`, version: '1' }, authority, confidence,
      extractionReview: 'deterministic' };
    facts.push({ ...fact, id: digest(canonical({ ...fact, nativeSpan: span })), snapshotId });
  }
  for (const entity of arm.entities) for (const definition of entity.definitions) add(definition, entity, 'contains', 'implemented');
  for (const reference of arm.references) {
    const entity = entities.get(reference.target);
    // No numeric score was supplied for some native inferred edges. Use an explicit conservative
    // lower bound in this required legacy field; retain the unknown native value in normalized JSON.
    if (entity?.definitions.some(span => !span.invalid)) add(reference.span, entity, 'consumes', reference.authority,
      arm.arm === 'graphify-static' ? reference.confidence ?? 0 : 1);
  }
  return [...new Map(facts.map(fact => [fact.id, fact])).values()];
}

async function scan(query, snapshotId, changedFiles, task) {
  const request = { snapshotId, changedFiles, task, maxFacts: spec.bounds.impact.maxFacts, maxDepth: spec.bounds.impact.maxDepth };
  const facts = [];
  let continuation;
  let last;
  let pages = 0;
  do {
    last = await query.scan({ ...request, ...(continuation ? { continuation } : {}) });
    facts.push(...last.facts); pages++;
    continuation = last.exploration?.continuation;
  } while (continuation && pages < spec.bounds.impact.maxPages);
  if (new Set(facts.map(fact => fact.id)).size !== facts.length) throw new Error('Repeated query facts');
  return { pages, truncated: Boolean(continuation) || Boolean(last.exploration?.depthLimitReached),
    factIds: facts.map(fact => fact.id), nodeIds: [...new Set(facts.flatMap(fact => [fact.subject.id, fact.object.id]))].sort(),
    rules: facts.filter(fact => fact.predicate === 'governedBy').map(fact => ({ id: fact.id, label: fact.object.label,
      authority: fact.authority, sourceAuthority: fact.sourceAuthority, extractionReview: fact.extractionReview, provenance: fact.provenance })) };
}

const reports = [];
const phase = (name, budgetSeconds) => process.env.WEFTLET_STUDY_PHASE_FILE
  ? writeFile(process.env.WEFTLET_STUDY_PHASE_FILE, JSON.stringify({ name, budgetSeconds })) : Promise.resolve();
for (const arm of arms) {
  const score = scoreNative(arm, suite, locations, sources, spec.commit);
  const normalizedPath = join(spec.output, `${arm.arm}.normalized.json`);
  await writeFile(normalizedPath, JSON.stringify(arm) + '\n');
  const modes = {};
  for (const mode of ['codeOnly', 'fixedBusiness']) {
    await phase(`${arm.arm}-${mode}-assembly`, spec.bounds.extractionSeconds);
    const begin = performance.now();
    const snapshotId = `${spec.commit}-study-${arm.arm}-${mode}-${spec.scenario.id === 'omitted-project' ? 'omitted' : 'full'}`;
    const projected = project(arm, snapshotId);
    const facts = mode === 'codeOnly' ? projected : [...common.map(fact => ({ ...fact, snapshotId })), ...projected];
    const snapshot = { ...baseline, facts, manifest: { ...baseline.manifest, snapshotId,
      generatedAt: '2026-10-29T00:00:00.000Z', contentDigest: digest(canonical(facts)),
      configurationDigest: digest(canonical({ baseline: baseline.manifest.configurationDigest, arm: arm.arm, mode, selectedFiles: spec.selectedFiles })),
      scope: [...new Set(facts.map(fact => fact.provenance.path))].sort(),
      semanticArtifactKeys: mode === 'fixedBusiness' ? baseline.manifest.semanticArtifactKeys : [],
      semanticModel: mode === 'fixedBusiness' ? baseline.manifest.semanticModel : 'none-code-only-study',
      scipIndexDigest: arm.arm === 'graphify-static' ? 'not-applicable-graphify-source-study' : baseline.manifest.scipIndexDigest,
      extractorVersions: Object.fromEntries(facts.map(fact => [fact.extractor.id, fact.extractor.version])) } };
    const graph = new RdfEvidenceGraph(snapshot);
    const validation = await graph.validate();
    const projection = await graph.facts();
    if (canonical(projection) !== canonical(facts)) throw new Error('RDF projection changed facts');
    if (!validation.conforms) throw new Error(`Strict SHACL failed: ${JSON.stringify(validation)}`);
    const store = new FileSnapshotStore(join(spec.armStore, arm.arm, mode));
    await store.write(snapshot);
    const validationSeconds = (performance.now() - begin) / 1000;
    const query = new SnapshotImpactQueryService(store, 'default');
    await phase(`${arm.arm}-${mode}-queries`, spec.bounds.querySeconds);
    const queryStarted = performance.now();
    const business = spec.corpus.id === 'business' ? {
      collection: await scan(query, snapshotId, ['services/api/src/collect.ts'], 'stored readings'),
      status: await scan(query, snapshotId, ['packages/contracts/src/status.ts'], 'Status'),
    } : { dispatch: await Promise.all(spec.legacyCases.cases.map(item => scoreImpactCase(query, snapshot, item, spec.bounds.impact))) };
    if (spec.corpus.id === 'business' && mode === 'fixedBusiness') {
      const paths = new SnapshotGraphPathService(store);
      const pages = [];
      let continuation;
      const { maxPages, ...budget } = spec.bounds.paths;
      do {
        const page = await paths.paths({ snapshotId, fromNodeId: 'workflow:collection', toNodeId: 'workflow:mobile',
          direction: 'outgoing', predicates: ['routesThrough'], ...budget, ...(continuation ? { continuation } : {}) });
        pages.push(page); continuation = page.search.continuation;
      } while (continuation && pages.length < maxPages);
      business.paths = pages;
    }
    const querySeconds = (performance.now() - queryStarted) / 1000;
    if (querySeconds > spec.bounds.querySeconds) throw new Error('Query phase exceeded frozen budget');
    modes[mode] = { factCount: facts.length, rdfProjectionParity: true, shapeConformance: validation,
      validationSeconds, querySeconds, business, snapshotId, contentDigest: snapshot.manifest.contentDigest };
    await writeFile(join(spec.output, `${arm.arm}.${mode}.snapshot.json`), JSON.stringify(snapshot) + '\n');
  }
  reports.push({ arm: arm.arm, score, modes, rawCounts: arm.rawCounts, unsupportedTracks: arm.unsupportedTracks,
    unprojectedRelations: arm.unprojectedRelations, failedSources: arm.failedSources, skippedSources: arm.skippedSources });
}
await writeFile(join(spec.output, 'comparison.json'), JSON.stringify({ normalizationSeconds, reports }, null, 2) + '\n');
