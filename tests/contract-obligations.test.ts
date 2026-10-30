import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { obligationContractNode, type ExtractionContext, type GraphFact, type GraphSnapshot } from '@weftlet/core';
import { createContextGraphApplication } from '../src/application/application.js';
import { buildWorkingOverlay } from '../src/application/overlay.js';
import { extractDocumentObligations } from '../src/extraction/document-obligations.js';
import { handleGraphNeighbors } from '../src/interfaces/graph-exploration.js';
import { CG, factIri, RdfEvidenceGraph } from '../src/graph/rdf.js';
import { evidenceShapes } from '../src/graph/shacl-shapes.js';
import { renderContextPackHtml } from '../src/visualization/visualization.js';
import { sha256 } from '../src/infrastructure/util.js';
import { consumer, document, obligationFiles, producer, queueContract, readingContract } from './fixtures/obligation-project.js';

const execute = promisify(execFile), obligations = (snapshot: GraphSnapshot) => snapshot.facts.filter(fact => fact.contractObligation);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-obligations-'));
  try {
    for (const [path, content] of Object.entries(obligationFiles)) {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content);
    }
    const template = JSON.parse(await readFile(new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    const config = { ...template, repositoryId: 'public/obligations', approvedIntentSources: ['docs/collection.md'],
      semanticSources: ['docs', 'validation'], codeRoots: ['services'], evidenceRoots: ['validation'],
      semantic: { ...template.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity: 'public-obligation-empty:1', maxDocuments: 16 },
      scip: { ...template.scip, args: ['index', '--no-global-caches'], sourceProject: { include: ['services/**/*.ts'] } } };
    const configPath = join(root, 'context-graph.config.json'); await writeFile(configPath, JSON.stringify(config));
    const git = async (...args: string[]) => (await execute('git', args, { cwd: root })).stdout.trim();
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Public fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public obligations');
    const app = await createContextGraphApplication(configPath);
    return { root, config, configPath, app, git };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}

describe('cited obligations through real committed extraction and shared queries', () => {
  let f: Awaited<ReturnType<typeof fixture>>, snapshot: GraphSnapshot;
  beforeAll(async () => { f = await fixture(); snapshot = (await f.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).snapshot; }, 90_000);
  afterAll(async () => { if (f) await rm(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });

  it('retains both stages, units, revisions, unknowns and source authority without a business verdict', async () => {
    expect(obligations(snapshot)).toHaveLength(7);
    const fact = obligations(snapshot).find(fact => fact.provenance.path === 'docs/collection.md')!;
    expect(fact).toMatchObject({ subject: { id: 'component:file:services/collector.ts', kind: 'Component' }, predicate: 'emits',
      authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'deterministic', sourceRole: 'intent',
      provenance: { path: 'docs/collection.md', startLine: 3, endLine: document(producer).split('\n').length - 1,
        commitSha: snapshot.manifest.commitSha, digest: sha256(document(producer)) },
      contractObligation: { declaration: producer, endpointSource: { path: producer.endpoint,
        digest: sha256(obligationFiles[producer.endpoint]!), commitSha: snapshot.manifest.commitSha } } });
    const execution = obligations(snapshot).find(fact => fact.provenance.path === 'docs/execution.md')!;
    expect(execution.object.id).toBe(fact.object.id);
    expect(execution.contractObligation!.declaration).toEqual(consumer);
    expect(execution.sourceAuthority).toBe('inferred');
    expect(obligations(snapshot).find(fact => fact.provenance.path === 'docs/test-consumer.md')!.subject.kind).toBe('Evidence');
    const unknown = obligations(snapshot).find(fact => fact.provenance.path === 'docs/queue-consumer.md')!.contractObligation!.declaration;
    for (const key of ['domain', 'stage', 'constraint', 'revalidation']) expect(unknown).not.toHaveProperty(key);
    expect(snapshot.diagnostics?.map(item => item.reason)).toEqual(expect.arrayContaining([
      expect.stringContaining('endpoint is missing'), expect.stringContaining('validation sources cannot'), expect.stringContaining('only one side'),
    ]));
    expect(snapshot.invariants).toEqual([]); expect(snapshot.runtimeEvidence).toEqual([]);
    expect((await new RdfEvidenceGraph(snapshot).validate()).conforms).toBe(true);
  });

  it('retrieves exact cited producer/consumer pages, implementation evidence and paths without same-name false joins', async () => {
    const snapshotId = snapshot.manifest.snapshotId, node = obligationContractNode(f.config.repositoryId, readingContract);
    const request = { snapshotId, nodeId: node.id, maxFacts: 1, predicates: ['emits', 'consumes'] };
    let page = await handleGraphNeighbors(f.app.explorationService, request);
    const facts = [...page.facts];
    for (let i = 0; page.selection.continuation; i++) {
      expect(i).toBeLessThan(5);
      page = await handleGraphNeighbors(f.app.explorationService, { ...request, continuation: page.selection.continuation }); facts.push(...page.facts);
    }
    expect(facts.map(fact => fact.provenance.path).sort()).toEqual(['docs/collection.md', 'docs/execution.md', 'docs/test-consumer.md']);
    for (const fact of facts) expect(fact).toEqual(snapshot.facts.find(item => item.id === fact.id));
    const paths = await f.app.pathService.paths({ snapshotId, fromNodeId: 'component:file:services/collector.ts',
      toNodeId: 'component:file:services/executor.ts', direction: 'both', predicates: ['emits', 'consumes'] });
    expect(paths.paths.map(path => path.nodeIds)).toContainEqual(['component:file:services/collector.ts', node.id, 'component:file:services/executor.ts']);
    const queue = await handleGraphNeighbors(f.app.explorationService, { snapshotId, nodeId: obligationContractNode(f.config.repositoryId, queueContract).id });
    expect(queue.facts.map(fact => fact.subject.id).sort()).toEqual(['component:file:services/scheduler.ts', 'component:file:services/worker.ts']);
    expect(queue.markdown).toContain('domain unknown');
    const pack = await f.app.queryService.scan({ snapshotId, changedFiles: ['services/collector.ts'], maxFacts: 200 });
    expect(pack.facts).toEqual(expect.arrayContaining(facts));
    expect(pack.facts.some(fact => fact.codeOccurrence && fact.provenance.path === 'services/executor.ts')).toBe(true);
    expect(pack.facts.some(fact => fact.subject.id === 'component:file:services/billing.ts')).toBe(false);
    const html = renderContextPackHtml(pack, 'https://example.test/{commit}/{path}#L{line}');
    expect(html).toContain('fulfillment, delivery and compatibility not evaluated');
    expect(html).toContain(`https://example.test/${snapshot.manifest.commitSha}/services/executor.ts#L1`);
  });

  it('preserves RDF projection equivalence, queryable values and named/union shape parity', async () => {
    const graph = new RdfEvidenceGraph(snapshot);
    expect(await graph.facts()).toEqual(snapshot.facts);
    const result = await graph.select(`SELECT ?role ?value ?unit WHERE { ?record <${CG}obligationScope> "sensor";
      <${CG}obligationContract> "readings"; <${CG}obligationContractVersion> "1";
      <${CG}obligationRole> ?role; <${CG}obligationValue> ?value; <${CG}obligationUnit> ?unit }`);
    expect(result.rows).toEqual(expect.arrayContaining([{ role: 'guarantee', value: '600', unit: 'seconds' }, { role: 'requirement', value: '60', unit: 'seconds' }]));
    const unknown = obligations(snapshot).find(fact => fact.provenance.path === 'docs/queue-consumer.md')!;
    expect((await graph.select(`SELECT ?value WHERE { <${factIri(unknown.id)}> <${CG}obligationStage> ?value }`)).rows).toEqual([]);
    const named = new Store(new Parser({ format: 'N-Quads' }).parse(await graph.serialize()));
    expect((await new SHACLValidator(new Store(evidenceShapes)).validate(named)).conforms).toBe(true);
  });

  it('rejects identity, role, schema, endpoint-revision and authority corruption without weakening shapes', async () => {
    const original = obligations(snapshot)[0]!;
    for (const mutate of [
      (fact: any) => { fact.object.id = 'wrong-contract'; }, (fact: any) => { fact.subject.kind = 'Project'; },
      (fact: any) => { fact.predicate = 'realizes'; }, (fact: any) => { fact.authority = 'declared'; },
      (fact: any) => { fact.extractionReview = 'approved'; }, (fact: any) => { fact.sourceRole = 'validation'; },
      (fact: any) => { fact.contractObligation.endpointSource.commitSha = 'stale'; },
      (fact: any) => { fact.contractObligation.declaration.constraint = { metric: 'age', value: '60', operator: 'at-most' }; },
      (fact: any) => { fact.contractObligation.repositoryId = 'another-repository'; },
      (fact: any) => { delete fact.contractObligation; },
    ]) {
      const fact = structuredClone(original); mutate(fact);
      const graph = new RdfEvidenceGraph({ ...snapshot, facts: [fact] });
      expect((await graph.validate()).conforms).toBe(false);
    }
    const bad = structuredClone(original) as any; bad.contractObligation.declaration.role = 'invented';
    const graph = new RdfEvidenceGraph({ ...snapshot, facts: [bad] });
    const named = new Store(new Parser({ format: 'N-Quads' }).parse(await graph.serialize()));
    expect((await new SHACLValidator(new Store(evidenceShapes)).validate(named)).conforms).toBe(false);
  });

  it('reuses semantic artifacts on unchanged repeat and clean comparison while queries remain available during edits', async () => {
    const repeat = await f.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeat.semanticExtracted).toBe(0); expect(repeat.semanticReused).toBe(9);
    expect(repeat.snapshot.manifest.snapshotId).toBe(snapshot.manifest.snapshotId);
    expect(repeat.snapshot.manifest.contentDigest).toBe(snapshot.manifest.contentDigest);
    const clean = await f.app.hydrator.compareClean({ ref: 'HEAD', headName: 'default' });
    expect(clean.snapshot.manifest.contentDigest).toBe(snapshot.manifest.contentDigest);
    await writeFile(join(f.root, producer.endpoint), obligationFiles[producer.endpoint]! + '// working change\n');
    try {
      const page = await f.app.explorationService.neighbors({ snapshotId: snapshot.manifest.snapshotId,
        nodeId: obligationContractNode(f.config.repositoryId, readingContract).id });
      expect(page.evidenceState?.excludedWorkingChanges).toContain(producer.endpoint);
      expect(page.facts).toEqual(expect.arrayContaining(obligations(snapshot).filter(fact => fact.object.id === page.focus.nodeId)));
    } finally { await writeFile(join(f.root, producer.endpoint), obligationFiles[producer.endpoint]!); }
    expect(await f.git('status', '--porcelain')).toBe('');
  }, 60_000);

  it('rebuilds draft declarations across edits, deletes and endpoint/document renames without retaining stale joins', async () => {
    const path = join(f.root, 'docs/execution.md'), moved = join(f.root, 'docs/moved-execution.md');
    const target = join(f.root, consumer.endpoint), renamedTarget = join(f.root, 'services/renamed.ts');
    try {
      await rename(path, moved); await rename(target, renamedTarget);
      await writeFile(moved, document({ ...consumer, endpoint: 'services/renamed.ts', constraint: { ...consumer.constraint!, value: 30 } }));
      await rm(join(f.root, 'docs/queue-producer.md'));
      const overlay = await buildWorkingOverlay(f.app.repository, f.app.config, f.app.snapshotStore, join(f.root, '.context-graph'), snapshot.manifest.snapshotId, 'obligation-test');
      const draft = obligations(overlay).find(fact => fact.provenance.path === 'docs/moved-execution.md')!;
      expect(draft).toMatchObject({ subject: { id: 'component:file:services/renamed.ts' }, authority: 'draft', sourceAuthority: 'draft',
        provenance: { commitSha: snapshot.manifest.commitSha }, contractObligation: { declaration: { constraint: { value: 30 } }, endpointSource: { commitSha: snapshot.manifest.commitSha } } });
      expect(obligations(overlay).some(fact => fact.provenance.path === 'docs/execution.md' || fact.provenance.path === 'docs/queue-producer.md')).toBe(false);
      expect(overlay.diagnostics?.some(item => item.reason.includes('only one side'))).toBe(true);
      expect((await new RdfEvidenceGraph(overlay).validate()).conforms).toBe(true);
      expect(await f.app.snapshotStore.read(snapshot.manifest.snapshotId)).toEqual(snapshot);
      expect((await f.app.snapshotStore.readHead('default'))!.manifest.snapshotId).toBe(snapshot.manifest.snapshotId);
    } finally {
      await rm(moved, { force: true }); await rm(renamedTarget, { force: true });
      for (const name of ['docs/execution.md', consumer.endpoint, 'docs/queue-producer.md']) await writeFile(join(f.root, name), obligationFiles[name]!);
    }
  }, 60_000);

  it('rejects duplicate JSON keys, stale source bytes, malformed metadata and over-budget declarations explicitly', async () => {
    const context: ExtractionContext = { repositoryRoot: f.root, repositoryId: f.config.repositoryId, commitSha: snapshot.manifest.commitSha,
      ref: 'HEAD', snapshotId: 'diagnostic', changedPaths: [], deletedPaths: [], renamedPaths: {} };
    // The repository seam supplies exact committed content; no hand-assembled graph assertions are used.
    const blob = (content: string) => createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
    const check = async (content: string, digest = sha256(content)) => extractDocumentObligations({
      listEntriesAt: async () => [{ path: 'docs/test.md', type: 'blob', mode: '100644', objectId: blob(content) },
        { path: producer.endpoint, type: 'blob', mode: '100644', objectId: blob(obligationFiles[producer.endpoint]!) }],
      readFileAt: async (_sha, path) => path === 'docs/test.md' ? content : obligationFiles[producer.endpoint]!,
    }, context, [{ path: 'docs/test.md', content, digest, stableSemanticId: 'test', metadata: { sourceAuthority: 'inferred' } }]);
    const duplicateKey = document(producer).replace('"schemaVersion": 1,', '"schemaVersion": 1, "schemaVersion": 1,');
    for (const content of [duplicateKey, document(producer).replace('"schemaVersion": 1', '"schemaVersion": 2')]) {
      const result = await check(content); expect(result.facts).toEqual([]); expect(result.diagnostics[0]!.reason).toContain('invalid declaration');
    }
    expect((await check(document(producer), 'wrong')).diagnostics[0]!.reason).toContain('committed bytes');
    const duplicate = await check(document(producer) + document(producer));
    expect(duplicate.facts).toHaveLength(2); expect(duplicate.diagnostics.some(item => item.reason.includes('duplicate declaration ID'))).toBe(true);
    expect((await check('```markdown\n' + document(producer).replaceAll('```', '~~~') + '\n```')).facts).toEqual([]);
    await expect(check(document(producer).repeat(501))).rejects.toThrow('500-declaration');
  });

  it('rejects lossy endpoint decoding using the real committed blob identity', async () => {
    const content = document({ ...producer, endpoint: 'payload.bin' });
    await writeFile(join(f.root, 'payload.bin'), Buffer.from([0xff, 0x80, 0x00]));
    await writeFile(join(f.root, 'docs/binary.md'), content);
    await f.git('add', 'payload.bin', 'docs/binary.md');
    await f.git('-c', 'user.name=Public fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public binary endpoint negative');
    const context: ExtractionContext = { repositoryRoot: f.root, repositoryId: f.config.repositoryId, commitSha: await f.git('rev-parse', 'HEAD'),
      ref: 'HEAD', snapshotId: 'binary-negative', changedPaths: [], deletedPaths: [], renamedPaths: {} };
    const result = await extractDocumentObligations(f.app.repository, context, [{ path: 'docs/binary.md', content,
      digest: sha256(content), stableSemanticId: 'binary-negative', metadata: { sourceAuthority: 'declared' } }]);
    expect(result.facts).toEqual([]);
    expect(result.diagnostics[0]!.reason).toContain('lossless committed UTF-8');
    expect(await f.app.snapshotStore.read(snapshot.manifest.snapshotId)).toEqual(snapshot);
  });
});
