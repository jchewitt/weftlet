import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExtractionContext, GraphNode, SemanticSource } from '@weftlet/core';
import { createContextGraphApplication } from '../src/application/application.js';
import { RdfEvidenceGraph } from '../src/graph/rdf.js';
import { linkSemanticDocuments } from '../src/extraction/document.js';
import { SemanticHydrator, assertSemanticOutput, type SemanticOutput } from '../src/extraction/semantic.js';
import { inspectSemanticCache } from '../src/extraction/semantic-cache.js';
import { semanticArtifactKey, semanticArtifactOutputDigest } from '../src/extraction/semantic-identity.js';
import { SemanticArtifactStore } from '../src/storage/storage.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const config = { provider: 'codex-cli' as const, model: 'fixture', reasoningEffort: 'low',
  promptVersion: 'public-v1', extractorVersion: '1', adapterVersion: '1', ontologyVersion: '1',
  minimumConfidence: 0.7, failOnUnresolved: false, concurrency: 1 };
const source: SemanticSource = { path: 'docs/owner.md', stableSemanticId: 'owner',
  content: 'The workflow is verified by [check](../src/check.ts).\n', digest: 'public-digest' };
const context: ExtractionContext = { repositoryRoot: '.', repositoryId: 'public/files', ref: 'HEAD',
  commitSha: 'a'.repeat(40), snapshotId: 'public-snapshot', changedPaths: [], deletedPaths: [], renamedPaths: {} };
function output(object: GraphNode): SemanticOutput {
  return { assertions: [{ subject: { id: 'workflow:checks', kind: 'Workflow', label: 'Checks' },
    predicate: 'verifiedBy', object, citation: { startLine: 1, endLine: 1 }, confidence: 0.93 }], oml: '', diagnostics: [] };
}
const file: GraphNode = { id: 'component:file:src/check.ts', kind: 'Component', label: 'Check' };
async function temporary() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-file-contract-')); roots.push(root); return root;
}

describe('canonical semantic physical files', () => {
  it.each([
    { ...file, kind: 'Evidence' },
    { ...file, id: 'component:file:src/check.spec.ts', kind: 'Component' },
    { ...file, id: 'component:file:src/check.test.ts', kind: 'Component' },
    { ...file, id: 'component:file:' },
  ] satisfies GraphNode[])('rejects inconsistent fresh identity without changing the assertion: $id / $kind', async node => {
    const root = await temporary(); const store = new SemanticArtifactStore(root);
    const parsed = output(node); const before = stableJson(parsed);
    const hydrator = new SemanticHydrator(config, store, { identity: 'fixture', async extract() {
      return { parsed, rawModelOutput: before };
    } });
    await expect(hydrator.hydrate(source, context)).rejects.toMatchObject({ code: 'invalid-output' });
    expect(stableJson(parsed)).toBe(before);
    expect(await store.read(semanticArtifactKey(config, source, 'fixture'))).toBeUndefined();
    expect(await readdir(root)).toEqual([]);
    try { assertSemanticOutput(parsed, source); } catch (error) {
      expect(String(error)).toContain('assertion[0].object');
      expect(String(error)).not.toContain(node.id);
      expect(String(error)).not.toContain(source.content);
    }
  });

  it('validates subjects too, retains business evidence IDs and the established document migration', () => {
    const parsed = output(file);
    const wrong = { ...parsed, assertions: [{ ...parsed.assertions[0]!, subject: { ...file, kind: 'Evidence' as const } }] };
    expect(() => assertSemanticOutput(wrong, source)).toThrow('assertion[0].subject');
    for (const node of [file, { ...file, id: 'component:file:src/check.test.ts', kind: 'Evidence' },
      { id: 'evidence:workflow-check', kind: 'Evidence', label: 'Business evidence' },
      { id: 'document:classification', kind: 'Document', label: 'Logical document' },
      { id: 'component:file:docs/check.md', kind: 'Component', label: 'Legacy document' },
      { id: 'document:docs/check.md', kind: 'Document', label: 'Document' }] satisfies GraphNode[]) {
      expect(() => assertSemanticOutput(output(node), source)).not.toThrow();
    }
  });

  it('rejects a digest-valid conflicting artifact in cache and at linker ingress without rewriting it', async () => {
    const root = await temporary(); const goodStore = new SemanticArtifactStore(join(root, 'good'));
    const parsed = output(file);
    const good = (await new SemanticHydrator(config, goodStore, { identity: 'fixture', async extract() {
      return { parsed, rawModelOutput: JSON.stringify(parsed) };
    } }).hydrate(source, context)).artifact;
    const facts = good.facts.map(fact => ({ ...fact, object: { ...fact.object, kind: 'Evidence' as const } }));
    const bad = { ...good, facts, rawModelOutput: JSON.stringify(output({ ...file, kind: 'Evidence' })) };
    bad.outputDigest = semanticArtifactOutputDigest(bad);
    const badRoot = join(root, 'bad'); const badStore = new SemanticArtifactStore(badRoot);
    await badStore.write(bad);
    const path = join(badRoot, 'artifacts/semantic', `${bad.key}.json`);
    const bytes = await readFile(path);
    expect((await inspectSemanticCache(badStore, config, source, 'fixture')).status).toBe('corrupt');
    await expect(new SemanticHydrator(config, badStore, { identity: 'fixture', async extract() {
      throw new Error('must not automatically retry');
    } }).hydrate(source, context)).rejects.toThrow('canonical file kind');
    expect(() => linkSemanticDocuments(context, [{ source, artifact: bad }], ['src/check.ts']))
      .toThrow('Document linker rejected');
    expect(await readFile(path)).toEqual(bytes);
    expect(bad.facts[0]!.object.kind).toBe('Evidence');
  });

  it('composes two documents with actual file/SCIP extraction, strict validation, saved reload and repeat reuse', async () => {
    const root = await temporary();
    await mkdir(join(root, 'src')); await mkdir(join(root, 'docs'));
    await writeFile(join(root, '.gitignore'), '.context-graph/\n');
    await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'public-file-contract', version: '1.0.0', type: 'module' }));
    await writeFile(join(root, 'src/check.ts'), 'export function check(): boolean { return true; }\n');
    await writeFile(join(root, 'src/check.test.ts'), "import { check } from './check.js';\nexport const result = check();\n");
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext',
      moduleResolution: 'NodeNext', strict: true }, include: ['src/**/*.ts'] }));
    await writeFile(join(root, 'docs/owner.md'), source.content);
    await writeFile(join(root, 'docs/consumer.md'), source.content);
    await writeFile(join(root, 'provider.mjs'), `let kind = 'Component';
    export function setInvalid() { kind = 'Evidence'; }
    export function createSemanticExtractor() { return {
      identity: 'public-file-contract', async extract(source) {
        const target = /\\[check\\]\\(\\.\\.\\/(src\\/check.ts)\\)/.exec(source.content);
        if (!target) throw new Error('Missing fixture evidence');
        const parsed = ${JSON.stringify(output(file))};
        parsed.assertions[0].object.id = 'component:file:' + target[1];
        parsed.assertions[0].object.kind = kind;
        return { parsed, rawModelOutput: JSON.stringify(parsed) };
      }
    }; }`);
    const base = JSON.parse(await readFile(new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    Object.assign(base, { repositoryId: 'public/file-contract', semanticSources: ['docs'],
      approvedIntentSources: ['docs/owner.md'], evidenceRoots: [],
      semantic: { ...base.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity: 'public-file-contract',
        failOnUnresolved: false, concurrency: 1 },
      scip: { version: '0.4.0', command: 'bundled-scip-typescript', args: ['index', '--no-global-caches', 'tsconfig.json'] } });
    const configPath = join(root, 'context-graph.config.json');
    await writeFile(configPath, JSON.stringify(base));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    git('init', '--quiet'); git('add', '.');
    git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'public file contract');
    const app = await createContextGraphApplication(configPath);
    const first = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(first.semanticExtracted).toBe(2); expect(first.semanticReused).toBe(0);
    const semantic = first.snapshot.facts.filter(f => f.extractor.id.startsWith('public-file-contract:'));
    expect(semantic).toHaveLength(2);
    for (const fact of semantic) {
      expect(fact).toMatchObject({ subject: { id: 'workflow:checks', kind: 'Workflow' }, predicate: 'verifiedBy',
        object: file, confidence: 0.93, authority: 'inferred', extractionReview: 'unreviewed',
        sourceAuthority: fact.provenance.path === 'docs/owner.md' ? 'declared' : 'inferred',
        provenance: { startLine: 1, endLine: 1, digest: sha256(source.content), commitSha: git('rev-parse', 'HEAD').trim() } });
    }
    const linked = first.snapshot.facts.filter(f => f.extractor.id === 'document-linker' && f.object.id === file.id);
    expect(linked.filter(f => f.predicate === 'contains')).toHaveLength(2);
    expect(linked.filter(f => f.predicate === 'references')).toHaveLength(2);
    expect(first.snapshot.facts.flatMap(f => [f.subject, f.object]).filter(n => n.id === file.id).every(n => n.kind === 'Component')).toBe(true);
    expect(first.snapshot.facts.some(f => f.extractor.id === 'scip-symbol-extractor')).toBe(true);
    expect((await new RdfEvidenceGraph(first.snapshot).validate()).conforms).toBe(true);
    expect(await app.snapshotStore.read(first.snapshot.manifest.snapshotId)).toEqual(first.snapshot);
    const capture = async () => {
      const files: Record<string, string> = {};
      for (const directory of ['snapshots', 'artifacts/semantic', 'heads']) {
        for (const name of await readdir(join(app.storageRoot, directory))) {
          files[`${directory}/${name}`] = sha256(await readFile(join(app.storageRoot, directory, name)));
        }
      }
      return files;
    };
    const before = await capture();
    const repeat = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeat.semanticExtracted).toBe(0); expect(repeat.semanticReused).toBe(2);
    expect(repeat.snapshot.manifest.contentDigest).toBe(first.snapshot.manifest.contentDigest);
    expect(repeat.snapshot.manifest.snapshotId).toBe(first.snapshot.manifest.snapshotId);
    expect(await capture()).toEqual(before);
    const provider = await import(pathToFileURL(join(root, 'provider.mjs')).href);
    provider.setInvalid();
    await expect(app.hydrator.hydrate({ ref: 'HEAD', headName: 'default', forceSemantic: true }))
      .rejects.toThrow('Semantic hydration invalid-output:');
    expect(await capture()).toEqual(before);
    expect(await app.snapshotStore.read(first.snapshot.manifest.snapshotId)).toEqual(first.snapshot);
  }, 120_000);
});
