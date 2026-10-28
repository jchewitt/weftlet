import { readFile, writeFile, rm, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createContextGraphApplication } from '../src/application/application.js';
import { planHydration } from '../src/application/hydration-plan.js';
import { adoptSemanticCache } from '../src/application/cache-adoption.js';
import { buildWorkingOverlay } from '../src/application/overlay.js';
import { SavedEvidenceQueryService } from '../src/application/saved-evidence.js';
import { SnapshotChecks } from '../src/application/snapshot-checks.js';
import { requiredSnapshotExtractorVersions } from '../src/application/extraction-identity.js';
import { resolveSemanticStorageRoots } from '../src/configuration/cache.js';
import { RdfEvidenceGraph, CG } from '../src/graph/rdf.js';
import { SnapshotImpactQueryService } from '../src/graph/query.js';
import { renderContextPackHtml } from '../src/visualization/visualization.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';
import { traversalApplication, traversalFixture } from './fixtures/traversal.js';

const location = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async original => ({ ...await original<typeof import('node:os')>(), homedir: () => location.home }));
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root,
  { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }))); });
async function fixture() {
  const result = await traversalFixture(); roots.push(result.root);
  location.home = join(result.root, 'user-cache');
  return result;
}

it('hydrates the planned canonical closure with actual Codex parsing, SCIP, RDF/query/viewer parity and warm reuse', async () => {
  const f = await fixture();
  const app = traversalApplication(f, f.config, true);
  const plan = await planHydration(f.configPath);
  expect(plan).toMatchObject({ ready: true, scope: { mode: 'traversal', complete: true },
    estimates: { extractions: 6, reusableArtifacts: 0 }, budgets: { selectedDocuments: 6 } });
  expect(plan.documentSelection?.documentPaths).toHaveLength(8);
  expect(plan.documentSelection?.excluded).toEqual([
    { path: 'docs/empty.md', reason: 'validation' }, { path: 'docs/review.md', reason: 'validation' },
  ]);
  const first = await app.hydrate();
  const { snapshot } = first;
  expect(snapshot.manifest.documentSelection).toEqual(plan.documentSelection);
  expect(app.calls.sort()).toEqual(plan.documents.map(document => document.path).sort());
  const facts = snapshot.facts;
  expect(facts.filter(fact => fact.provenance.path === 'docs/empty.md')).toHaveLength(1);
  expect(facts.filter(fact => fact.provenance.path === 'docs/review.md')).toEqual([
    expect.objectContaining({ sourceRole: 'validation', sourceAuthority: 'declared', authority: 'inferred',
      extractionReview: 'deterministic', predicate: 'contains' }),
  ]);
  expect(facts.find(fact => fact.provenance.path === 'docs/planning.md')).toMatchObject({
    sourceRole: 'plan', sourceAuthority: 'inferred', authority: 'inferred', sourceOwnership: { status: 'resolved' },
  });
  const modelFacts = facts.filter(fact => fact.extractor.id.startsWith('codex-cli:'));
  expect(modelFacts).toHaveLength(12);
  expect(modelFacts.every(fact => fact.authority === 'inferred' && fact.extractionReview === 'unreviewed')).toBe(true);
  expect(snapshot.diagnostics?.some(item => item.reason.includes('budget'))).toBe(false);
  const graph = new RdfEvidenceGraph(snapshot);
  expect((await graph.validate()).conforms).toBe(true);
  expect(stableJson([...(await graph.facts())].sort((a, b) => a.id.localeCompare(b.id))))
    .toBe(stableJson([...facts].sort((a, b) => a.id.localeCompare(b.id))));
  expect((await graph.select(`SELECT ?from ?to WHERE { GRAPH ?assertion { ?from <${CG}routesThrough> ?to } }`)).rows).toHaveLength(6);
  const pack = await new SnapshotImpactQueryService(app.store, 'default').scan({ changedFiles: ['src/discovery.ts'], maxDepth: 32, maxFacts: 500 });
  expect(pack.snapshot.documentSelection).toEqual(plan.documentSelection);
  expect(pack.facts.some(fact => fact.provenance.path === 'src/outcomes.ts')).toBe(true);
  expect(pack.facts.some(fact => fact.provenance.path === 'test/pipeline.test.ts')).toBe(true);
  expect(pack.facts.some(fact => fact.predicate === 'consumes' && fact.extractor.id === 'scip-symbol-extractor')).toBe(true);
  expect(renderContextPackHtml(pack)).toContain('validation');
  expect(renderContextPackHtml(pack)).toContain('Document traversal: complete within configured links');
  expect(pack.markdown).toContain('Document traversal: complete within configured links');
  const repeat = await app.hydrate();
  expect(repeat).toMatchObject({ semanticExtracted: 0, semanticReused: 6,
    snapshot: { manifest: { snapshotId: snapshot.manifest.snapshotId, contentDigest: snapshot.manifest.contentDigest } } });
  expect((await planHydration(f.configPath)).estimates).toEqual({ extractions: 0, reusableArtifacts: 6, unknownArtifacts: 0 });
}, 60_000);

it('keeps traversal, unchanged repeat and clean comparison within physical filename limits on Windows and POSIX', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'routing.json'), JSON.stringify({ schemaVersion: 1, routes: [{
    id: 'discovery-analysis', scope: 'public-pipeline', channel: 'analysis',
    producer: 'src/discovery.ts', consumer: 'src/analysis.ts',
  }] }));
  await writeFile(join(f.root, 'runtime.json'), '[]\n');
  await f.commit();
  // Exercise the combined identity suffixes. The fixture's runtime provider supplies no traces.
  const config = { ...f.config, routingSources: ['routing.json'], runtimeEvidence: [join(f.root, 'runtime.json')] };
  await f.save(config);
  const app = traversalApplication(f, config, true);
  const first = await app.hydrate();
  const repeat = await app.hydrate();
  expect(repeat).toMatchObject({ semanticExtracted: 0, semanticReused: 6,
    snapshot: { manifest: { snapshotId: first.snapshot.manifest.snapshotId, contentDigest: first.snapshot.manifest.contentDigest } } });
  const clean = await app.hydrator.compareClean({ ref: 'HEAD', headName: 'default' });
  expect(clean).toMatchObject({ semanticExtracted: 0, semanticReused: 6,
    snapshot: { manifest: { contentDigest: first.snapshot.manifest.contentDigest } } });
  expect(clean.snapshot.manifest.snapshotId).toContain('-document-selection-v1-');
  expect(clean.snapshot.manifest.snapshotId).toMatch(/-clean-\d+-runtime-/);
  expect(clean.snapshot.manifest.snapshotId.length).toBeGreaterThan(215);
  const withoutSnapshot = (facts: typeof first.snapshot.facts) => facts.map(({ snapshotId: _snapshotId, ...fact }) => fact);
  expect(withoutSnapshot(clean.snapshot.facts)).toEqual(withoutSnapshot(first.snapshot.facts));
  expect(clean.snapshot.facts.every(fact => fact.snapshotId === clean.snapshot.manifest.snapshotId)).toBe(true);
  expect(clean.snapshot.manifest.documentSelection).toEqual(first.snapshot.manifest.documentSelection);
  expect(await app.store.readHead('default')).toEqual(first.snapshot);
  expect(await app.store.readHead('default-clean')).toEqual(clean.snapshot);
  expect(app.calls).toHaveLength(6);
  for (const path of await readdir(app.storage, { recursive: true })) {
    expect(path.split(/[\\/]/).every(part => part.length <= 133)).toBe(true);
    expect(path.endsWith('.tmp')).toBe(false);
  }
  expect(await f.git('status', '--porcelain')).toBe('');
}, 60_000);

it('reuses unchanged Codex artifacts on activation and policy edits without rewriting their bytes or approving claims', async () => {
  const f = await fixture();
  const old = traversalApplication(f, f.direct);
  const baseline = (await old.hydrate()).snapshot;
  expect(old.calls).toHaveLength(8);
  const directory = join(resolveSemanticStorageRoots(f.root, f.direct).primary, 'artifacts/semantic');
  const artifacts = async () => Promise.all((await readdir(directory)).sort().map(async name => [name, await readFile(join(directory, name), 'utf8')]));
  const before = await artifacts();
  const app = traversalApplication(f);
  const first = await app.hydrate();
  expect(first).toMatchObject({ semanticExtracted: 0, semanticReused: 6 });
  expect(app.calls).toEqual([]);
  const config = { ...f.config, documentTraversal: { ...f.config.documentTraversal!,
    policy: { ...f.config.documentTraversal!.policy!, owners: [] } } };
  await f.save(config);
  expect((await planHydration(f.configPath)).ready).toBe(true);
  const changed = await traversalApplication(f, config).hydrate();
  expect(changed).toMatchObject({ semanticExtracted: 0, semanticReused: 6 });
  expect(changed.snapshot.manifest.snapshotId).not.toBe(first.snapshot.manifest.snapshotId);
  expect(changed.snapshot.facts.find(fact => fact.provenance.path === 'docs/planning.md')).toMatchObject({
    sourceOwnership: { status: 'missing' }, authority: 'inferred',
  });
  expect(changed.snapshot.diagnostics?.some(item => item.kind === 'missingIntent')).toBe(true);
  expect(await artifacts()).toEqual(before);
  const previous = join(f.root, 'previous.config.json');
  await writeFile(previous, JSON.stringify(f.direct));
  const adopted = await adoptSemanticCache(f.configPath, { fromConfigPath: previous, dryRun: true });
  expect(adopted).toMatchObject({ ready: true, counts: { reusable: 6 } });
  expect(await old.store.readHead('default')).toEqual(baseline);
}, 60_000);

it('blocks incomplete reads, broken links, ambiguous roles and semantic budgets before providers/indexing without losing evidence', async () => {
  const f = await fixture();
  const app = traversalApplication(f);
  const baseline = (await app.hydrate()).snapshot;
  for (const config of [
    { ...f.config, documentTraversal: { ...f.config.documentTraversal!, maxReadDocuments: 1 } },
    { ...f.config, semantic: { ...f.config.semantic, maxDocuments: 1 } },
    { ...f.config, documentTraversal: { ...f.config.documentTraversal!, policy: { ...f.config.documentTraversal!.policy!,
      roles: [...f.config.documentTraversal!.policy!.roles!, { id: 'conflict', pattern: 'docs/planning.md', role: 'validation' as const }] } } },
  ]) {
    await f.save(config);
    expect((await planHydration(f.configPath)).ready).toBe(false);
    const blocked = traversalApplication(f, config);
    await expect(blocked.hydrate()).rejects.toThrow();
    expect(blocked.calls).toEqual([]);
    expect(blocked.indexes()).toBe(0);
    expect(await app.store.readHead('default')).toEqual(baseline);
  }
  await f.save(f.config);
  const path = join(f.root, 'docs/analysis.md');
  await writeFile(path, await readFile(path, 'utf8') + '\n[Missing](missing.md)\n');
  await f.commit();
  expect((await planHydration(f.configPath)).documentSelection?.complete).toBe(false);
  await expect(app.hydrate()).rejects.toThrow();
  expect(app.calls).toHaveLength(6);
  expect(app.indexes()).toBe(1);
  expect(await app.store.readHead('default')).toEqual(baseline);
  await expect(app.hydrator.hydrate({ ref: 'HEAD', headName: 'default', semanticSources: [] })).rejects.toThrow('override');
}, 60_000);

it('recomputes committed reachability for renames/deletions while preserving immutable history and freshness gates', async () => {
  const f = await fixture();
  const app = traversalApplication(f);
  const initial = (await app.hydrate()).snapshot;
  await rename(join(f.root, 'docs/planning.md'), join(f.root, 'docs/planned.md'));
  const path = join(f.root, 'docs/admission.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace('(planning.md)', '(planned.md)'));
  await f.commit();
  const renamed = await app.hydrate();
  expect(renamed).toMatchObject({ semanticExtracted: 1, semanticReused: 5 });
  expect(renamed.snapshot.facts.some(fact => fact.provenance.path === 'docs/planning.md')).toBe(false);
  expect(renamed.snapshot.facts.some(fact => fact.provenance.path === 'docs/planned.md' && fact.extractor.id.startsWith('codex-cli:'))).toBe(true);
  await rm(join(f.root, 'docs/planned.md'));
  await writeFile(path, (await readFile(path, 'utf8')).replace('(planned.md)', '(execution.md)'));
  await f.commit();
  const deleted = await app.hydrate();
  expect(deleted).toMatchObject({ semanticExtracted: 1, semanticReused: 4 });
  expect(deleted.snapshot.manifest.scope).not.toContain('docs/planned.md');
  expect(deleted.snapshot.facts.some(fact => fact.provenance.path === 'docs/planned.md')).toBe(false);
  expect(await app.store.read(initial.manifest.snapshotId)).toEqual(initial);
  const query = new SavedEvidenceQueryService(new SnapshotImpactQueryService(app.store, 'default'),
    f.repository, sha256(stableJson(f.config)));
  expect((await query.scan({ snapshotId: initial.manifest.snapshotId })).evidenceState).toMatchObject({ stale: true, eligibleForCurrentDiffValidation: false });
  const checks = new SnapshotChecks(app.store, f.repository, app.hydrator, undefined,
    sha256(stableJson(f.config)), requiredSnapshotExtractorVersions(f.config));
  await expect(checks.read({}, f.head)).rejects.toThrow('exact-commit');
}, 60_000);

it('rebuilds draft document structure and invalidates changed owners and incomplete coverage without model calls', async () => {
  const f = await fixture();
  const app = traversalApplication(f);
  const base = (await app.hydrate()).snapshot;
  const path = join(f.root, 'docs/discovery.md');
  await writeFile(path, await readFile(path, 'utf8') + '\nDraft owner change.\n');
  const overlay = () => buildWorkingOverlay(f.repository, f.config, app.store, app.storage, base.manifest.snapshotId);
  const first = await overlay();
  expect(first.facts.some(fact => fact.extractor.id.startsWith('codex-cli:'))).toBe(false);
  expect(first.facts.find(fact => fact.provenance.path === 'docs/review.md')).toMatchObject({
    authority: 'draft', sourceAuthority: 'draft', sourceRole: 'validation',
  });
  const repeat = await overlay();
  expect(repeat.manifest.documentSelection).toEqual(first.manifest.documentSelection);
  expect(repeat.manifest.contentDigest).toBe(first.manifest.contentDigest);
  await rm(join(f.root, 'docs/review.md'));
  const deleted = await overlay();
  expect(deleted.manifest.documentSelection?.complete).toBe(false);
  const draftPack = await new SnapshotImpactQueryService(app.store, 'default').scan({ snapshotId: deleted.manifest.snapshotId });
  expect(draftPack.markdown).toContain('Document traversal: INCOMPLETE');
  expect(renderContextPackHtml(draftPack)).toContain('Document traversal: INCOMPLETE');
  expect(deleted.facts.some(fact => fact.provenance.path === 'docs/review.md')).toBe(false);
  expect(deleted.diagnostics?.some(item => item.kind === 'implementationGaps')).toBe(true);
  expect(await app.store.readHead('default')).toEqual(base);
  expect(app.calls).toHaveLength(6);
}, 60_000);


it.each(['workspace', 'user'] as const)('isolates traversal module artifacts from direct/changed policies and reuses unchanged %s inputs', async storageScope => {
  const f = await fixture();
  const provider = join(f.root, 'provider.mjs');
  await writeFile(provider, `import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
export function createSemanticExtractor(config) {
  return { identity: config.providerIdentity, async extract(source, context) {
    await mkdir(join(context.repositoryRoot, '.context-graph'), { recursive: true });
    await appendFile(join(context.repositoryRoot, '.context-graph/module-calls'), source.path + '\\n');
    const parsed = { assertions: [{ subject: { id: 'document:' + source.path, kind: 'Document', label: source.path },
      predicate: 'references', object: { id: 'capability:public', kind: 'Capability', label: 'Public fixture' },
      citation: { startLine: 1, endLine: 1 }, confidence: 1 }], diagnostics: [], oml: '' };
    return { parsed, rawModelOutput: JSON.stringify(parsed) };
  } };
}`);
  const direct = { ...f.direct, storageScope, semantic: { ...f.direct.semantic, provider: 'module' as const,
    providerModule: './provider.mjs', providerIdentity: 'public-module:1' } };
  await f.save(direct);
  const original = await createContextGraphApplication(f.configPath);
  const before = await original.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
  expect(before.semanticExtracted).toBe(8);
  const config = { ...direct, documentTraversal: f.config.documentTraversal,
    semantic: { ...direct.semantic, maxDocuments: 6 } };
  await f.save(config);
  expect((await planHydration(f.configPath)).estimates.extractions).toBe(6);
  const application = await createContextGraphApplication(f.configPath);
  const first = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
  expect(first).toMatchObject({ semanticExtracted: 6, semanticReused: 0 });
  expect(await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' }))
    .toMatchObject({ semanticExtracted: 0, semanticReused: 6 });
  expect((await application.queryService.scan({ ownerDocument: 'docs/discovery.md' })).snapshot.documentSelection)
    .toEqual(first.snapshot.manifest.documentSelection);
  expect(await original.snapshotStore.read(before.snapshot.manifest.snapshotId)).toEqual(before.snapshot);
  await f.save({ ...config, documentTraversal: { ...config.documentTraversal!,
    policy: { ...config.documentTraversal!.policy!, owners: [] } } });
  expect((await planHydration(f.configPath)).estimates.extractions).toBe(6);
  const changed = await createContextGraphApplication(f.configPath);
  expect(await changed.hydrator.hydrate({ ref: 'HEAD', headName: 'default' }))
    .toMatchObject({ semanticExtracted: 6, semanticReused: 0 });
  expect((await readFile(join(f.root, '.context-graph/module-calls'), 'utf8')).trim().split('\n')).toHaveLength(20);
}, 60_000);

it('invalidates unreachable draft assertions and captures new/renamed documents without promoting their text', async () => {
  const f = await fixture();
  const app = traversalApplication(f);
  const base = (await app.hydrate()).snapshot;
  await rename(join(f.root, 'docs/planning.md'), join(f.root, 'docs/planned.md'));
  const path = join(f.root, 'docs/admission.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace('(planning.md)', '(planned.md)'));
  const draft = await buildWorkingOverlay(f.repository, f.config, app.store, app.storage, base.manifest.snapshotId);
  expect(draft.manifest.documentSelection).toMatchObject({ complete: true });
  expect(draft.manifest.documentSelection?.documentPaths).toContain('docs/planned.md');
  expect(draft.facts.some(fact => fact.provenance.path === 'docs/planning.md')).toBe(false);
  const renamed = draft.facts.filter(fact => fact.provenance.path === 'docs/planned.md');
  expect(renamed.length).toBeGreaterThan(0);
  expect(renamed.every(fact => fact.authority === 'draft' && fact.extractionReview === 'deterministic')).toBe(true);
  expect(draft.facts.some(fact => fact.extractor.id.startsWith('codex-cli:') && fact.provenance.path === 'docs/analysis.md')).toBe(true);
  await writeFile(path, (await readFile(path, 'utf8')).replace('(planned.md)', '(execution.md)'));
  const unreachable = await buildWorkingOverlay(f.repository, f.config, app.store, app.storage, base.manifest.snapshotId);
  expect(unreachable.manifest.documentSelection?.documentPaths).not.toContain('docs/planned.md');
  expect(unreachable.facts.some(fact => fact.provenance.path === 'docs/planned.md')).toBe(false);
  expect(await app.store.readHead('default')).toEqual(base);
  expect(app.calls).toHaveLength(6);
}, 60_000);
