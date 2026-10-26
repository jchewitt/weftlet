import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { ExtractionContext, GraphSnapshot, SemanticArtifact } from '@weftlet/core';
import { GitRepository } from '../repository/git.js';
import { sha256, stableJson } from '../infrastructure/util.js';
import { extractRoutingDeclarations, routingExtractorIdentity } from './routing.js';
import { RepositoryFileExtractor } from './static.js';
import { linkSemanticDocuments } from './document.js';
import { CG, nodeIri, RdfEvidenceGraph } from '../graph/rdf.js';

const route = { id: 'archive', scope: 'parcel/dev', channel: 'dispatch.completed.v1',
  producer: 'src/executor.ts', consumer: 'services/archive.ts' };
const manifest = (routes: readonly unknown[]) => JSON.stringify({ schemaVersion: 1, routes }, null, 2) + '\n';
const sources = { 'src/executor.ts': "publish('dispatch.completed.v1');\n",
  'services/archive.ts': "subscribe('dispatch.completed.v1');\n" };

async function withRepository(
  files: Readonly<Record<string, string>>,
  run: (repository: GitRepository, context: ExtractionContext, commit: () => Promise<string>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'routing-declarations-'));
  try {
    for (const [path, content] of Object.entries({ ...sources, ...files })) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }
    const execute = promisify(execFile);
    const git = (...args: string[]) => execute('git', args, { cwd: root });
    await git('init', '--quiet'); await git('config', 'core.autocrlf', 'false');
    const repository = new GitRepository(root);
    const commit = async () => {
      await git('add', '-A');
      await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public routing declarations');
      return repository.resolveRef('HEAD');
    };
    const commitSha = await commit();
    await run(repository, { repositoryRoot: root, repositoryId: 'example/parcel', ref: commitSha,
      commitSha, snapshotId: commitSha, changedPaths: [], deletedPaths: [], renamedPaths: {} }, commit);
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe('committed routing declarations', () => {
  it('joins document, test and production endpoints with actual neutral file and document facts', async () => {
    const documentPath = 'docs/dispatch.md';
    const documentContent = '# Dispatch\n[Spec](../tests/archive.spec.ts)\n[Worker](../src/executor.ts)\n';
    const routes = [
      { ...route, id: 'handbook', producer: documentPath, consumer: 'src/executor.ts' },
      { ...route, id: 'spec', consumer: 'tests/archive.spec.ts' },
      { ...route, id: 'test', producer: 'tests/archive.test.ts', consumer: documentPath },
    ];
    const content = manifest(routes);
    await withRepository({ 'routing.json': content, [documentPath]: documentContent,
      'tests/archive.spec.ts': 'export const specification = true;\n',
      'tests/archive.test.ts': 'export const test = true;\n',
    }, async (repository, context) => {
      const routing = await extractRoutingDeclarations(repository, context, ['routing.json']);
      const files = await new RepositoryFileExtractor(repository, ['src', 'services', 'tests'], 'fixture-index').extract(context);
      const source = { path: documentPath, content: documentContent, digest: sha256(documentContent), stableSemanticId: documentPath };
      const sourceSpan = { path: documentPath, startLine: 1, endLine: 4, digest: source.digest, commitSha: context.commitSha };
      const artifact: SemanticArtifact = { key: 'empty-public-artifact', stableSemanticId: source.stableSemanticId,
        source: sourceSpan, sourceDigest: source.digest, promptVersion: 'none', extractorVersion: 'none',
        modelIdentity: 'none', adapterVersion: 'none', ontologyVersion: 'none', facts: [], oml: '',
        unresolvedMappings: [], rawModelOutput: '{}', outputDigest: sha256('{}') };
      const documents = linkSemanticDocuments(context, [{ source, artifact }], await repository.listAllFilesAt(context.commitSha));
      const facts = [...routing.facts, ...files, ...documents.facts];
      expect(routing.diagnostics).toEqual([]);
      expect(routing.facts).toHaveLength(6);
      expect(documents.facts).toHaveLength(2);
      for (const [id, kind] of [['document:docs/dispatch.md', 'Document'],
        ['component:file:tests/archive.spec.ts', 'Evidence'], ['component:file:tests/archive.test.ts', 'Evidence'],
        ['component:file:src/executor.ts', 'Component']] as const) {
        const matching = facts.flatMap((fact) => [fact.subject, fact.object]).filter((node) => node.id === id);
        expect(matching.length).toBeGreaterThan(1);
        expect(new Set(matching.map((node) => node.kind))).toEqual(new Set([kind]));
      }
      expect(facts.flatMap((fact) => [fact.subject.id, fact.object.id])).not.toContain('component:file:docs/dispatch.md');
      const bindingIds = routing.facts.filter((fact) => fact.predicate === 'emits').map((fact) => fact.object.id).sort();
      expect(bindingIds).toEqual(routes.map((item) => `workflow:routing:${sha256(stableJson({
        repositoryId: context.repositoryId, scope: item.scope, id: item.id,
      }))}`).sort());
      for (const fact of routing.facts) expect(fact).toMatchObject({
        extractor: { id: 'routing-declaration-extractor', version: '1.1.0' }, confidence: 1,
        authority: 'inferred', sourceAuthority: 'inferred', extractionReview: 'deterministic',
        provenance: { path: 'routing.json', startLine: 1, endLine: content.split('\n').length,
          digest: sha256(content), commitSha: context.commitSha },
      });
      const snapshot: GraphSnapshot = { manifest: { schemaVersion: 1, repositoryId: context.repositoryId,
        commitSha: context.commitSha, ref: context.ref, snapshotId: context.snapshotId,
        contentDigest: sha256(stableJson(facts)), ontologyVersion: 'rdf-v1', extractorVersions: {},
        semanticModel: 'none', semanticPromptVersion: 'none', generatedAt: '2026-01-01T00:00:00Z',
        semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' }, facts,
        invariants: [], runtimeEvidence: [], unresolved: [] };
      const graph = new RdfEvidenceGraph(snapshot);
      expect(await graph.validate()).toMatchObject({ conforms: true, issues: [] });
      expect(await graph.facts()).toEqual(facts);
      const joined = await graph.select(`SELECT ?endpoint WHERE {
        <${nodeIri('document:docs/dispatch.md')}> <${CG}references> <${nodeIri('component:file:tests/archive.spec.ts')}>;
          <${CG}emits>/<${CG}routesThrough> ?endpoint
      }`);
      expect(joined.rows).toEqual([{ endpoint: nodeIri('component:file:src/executor.ts') }]);
    });
  });

  it('extracts exact cited bindings with inferred authority while ignoring dirty declarations', async () => {
    const content = manifest([route]);
    await withRepository({ 'routing.json': content }, async (repository, context) => {
      await writeFile(join(repository.root, 'routing.json'), manifest([{ ...route, consumer: 'private/dirty.ts' }]));
      const result = await extractRoutingDeclarations(repository, context, ['routing.json']);
      expect(result.diagnostics).toEqual([]);
      expect(result.referencedPaths).toEqual(['services/archive.ts', 'src/executor.ts']);
      expect(result.facts).toHaveLength(2);
      const producer = result.facts.find((fact) => fact.predicate === 'emits')!;
      const consumer = result.facts.find((fact) => fact.predicate === 'routesThrough')!;
      expect(producer.subject.id).toBe('component:file:src/executor.ts');
      expect(consumer.object.id).toBe('component:file:services/archive.ts');
      expect(producer.object).toEqual(consumer.subject);
      expect(producer.object).toMatchObject({ kind: 'Workflow', attributes: {
        evidenceLayer: 'routing-declaration', routeId: 'archive', scope: 'parcel/dev', channel: 'dispatch.completed.v1',
      } });
      for (const fact of result.facts) expect(fact).toMatchObject({
        authority: 'inferred', sourceAuthority: 'inferred', extractionReview: 'deterministic',
        extractor: routingExtractorIdentity, confidence: 1, snapshotId: context.snapshotId,
        provenance: { path: 'routing.json', startLine: 1, endLine: content.split('\n').length,
          digest: sha256(content), commitSha: context.commitSha },
      });
      expect(await extractRoutingDeclarations(repository, context, ['routing.json'])).toEqual(result);
    });
  });

  it('keeps binding, scope, case and repository identities separate despite equal channel labels', async () => {
    const routes = [route, { ...route, id: 'other' }, { ...route, scope: 'parcel/prod' },
      { ...route, scope: 'Parcel/dev' }, { ...route, scope: 'a', id: 'b/c' }, { ...route, scope: 'a/b', id: 'c' }];
    await withRepository({ 'routing.json': manifest(routes) }, async (repository, context) => {
      const result = await extractRoutingDeclarations(repository, context, ['routing.json']);
      const bindings = result.facts.filter((fact) => fact.predicate === 'emits').map((fact) => fact.object);
      expect(new Set(bindings.map((node) => node.id)).size).toBe(routes.length);
      expect(bindings.every((node) => node.attributes?.channel === route.channel)).toBe(true);
      const other = await extractRoutingDeclarations(repository,
        { ...context, repositoryId: 'example/other' }, ['routing.json']);
      expect(other.facts.filter((fact) => fact.predicate === 'emits')
        .every((fact) => !bindings.some((node) => node.id === fact.object.id))).toBe(true);
    });
  });

  it('suppresses every duplicate scoped binding across files, including identical duplicates', async () => {
    await withRepository({
      'one.json': manifest([route, route, { ...route, id: 'unambiguous' }]),
      'two.json': manifest([{ ...route, channel: 'other-topic', consumer: 'missing.ts' }]),
    }, async (repository, context) => {
      const result = await extractRoutingDeclarations(repository, context, ['two.json', 'one.json']);
      expect(result.facts).toHaveLength(2);
      expect(result.facts.flatMap((fact) => [fact.subject, fact.object])
        .filter((node) => node.kind === 'Workflow').every((node) => node.attributes?.routeId === 'unambiguous')).toBe(true);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({ kind: 'implementationGaps', evidenceScope: 'source',
        reason: expect.stringContaining('3 records share this scoped identity') });
      expect(result.diagnostics[0]!.provenance.map((span) => span.path)).toEqual(['one.json', 'two.json']);
      expect(result.referencedPaths).toContain('missing.ts');
      expect(await extractRoutingDeclarations(repository, context, ['one.json', 'two.json'])).toEqual(result);
    });
  });

  it('does not guess case, extensions or directories, and suppresses the complete missing-endpoint pair', async () => {
    const routes = [
      { ...route, id: 'case', consumer: 'services/Archive.ts' },
      { ...route, id: 'extension', consumer: 'services/archive.js' },
      { ...route, id: 'directory', consumer: 'services' },
      { ...route, id: 'producer', producer: 'src/missing.ts' },
    ];
    await withRepository({ 'routing.json': manifest(routes) }, async (repository, context) => {
      const result = await extractRoutingDeclarations(repository, context, ['routing.json']);
      expect(result.facts).toEqual([]);
      expect(result.diagnostics).toHaveLength(4);
      expect(result.diagnostics.every((item) => item.reason.includes('Both binding relationships were suppressed'))).toBe(true);
      expect(result.referencedPaths).toContain('services/Archive.ts');
    });
  });

  it('reads Unicode and spaced paths exactly from a nested repository root despite Git quoting', async () => {
    const nestedRoute = { ...route, producer: 'src/emitter two.ts', consumer: 'services/caf\u00e9 archive.ts' };
    await withRepository({
      'nested/d\u00e9ploiement/routes one.json': manifest([nestedRoute]),
      'nested/src/emitter two.ts': 'export const emitted = true;\n',
      'nested/services/caf\u00e9 archive.ts': 'export const archived = true;\n',
    }, async (repository, context) => {
      await repository.run(['config', 'core.quotePath', 'true']);
      const nested = new GitRepository(join(repository.root, 'nested'));
      const result = await extractRoutingDeclarations(nested,
        { ...context, repositoryRoot: nested.root }, ['d\u00e9ploiement/routes one.json']);
      expect(result.diagnostics).toEqual([]);
      expect(result.facts).toHaveLength(2);
      expect(result.referencedPaths).toEqual(['services/caf\u00e9 archive.ts', 'src/emitter two.ts']);
      expect(result.facts.every((fact) => fact.provenance.path === 'd\u00e9ploiement/routes one.json')).toBe(true);
    });
  });

  it('accepts executable blobs but rejects committed symlink modes without creating host symlinks', async () => {
    await withRepository({
      'routing.json': manifest([{ ...route, producer: 'src/runner.ts' },
        { ...route, id: 'linked-endpoint', consumer: 'services/linked.ts' }]),
    }, async (repository, context) => {
      const sourceBlob = await repository.run(['rev-parse', `${context.commitSha}:src/executor.ts`]);
      const manifestBlob = await repository.run(['rev-parse', `${context.commitSha}:routing.json`]);
      await repository.run(['update-index', '--add', '--cacheinfo', `100755,${sourceBlob},src/runner.ts`]);
      await repository.run(['update-index', '--add', '--cacheinfo', `120000,${sourceBlob},services/linked.ts`]);
      await repository.run(['update-index', '--add', '--cacheinfo', `120000,${manifestBlob},linked-source.json`]);
      await repository.run(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Git object mode fixtures']);
      const commitSha = await repository.resolveRef('HEAD');
      const current = { ...context, commitSha, snapshotId: commitSha };
      const result = await extractRoutingDeclarations(repository, current, ['routing.json']);
      expect(result.facts).toHaveLength(2);
      expect(result.facts.find((fact) => fact.predicate === 'emits')!.subject.id).toBe('component:file:src/runner.ts');
      expect(result.diagnostics).toEqual([expect.objectContaining({
        reason: expect.stringContaining('non-regular committed endpoint(s): services/linked.ts'),
      })]);
      for (const allowMissingSources of [false, true]) {
        await expect(extractRoutingDeclarations(repository, current, ['linked-source.json'], { allowMissingSources }))
          .rejects.toThrow('not a regular committed file');
      }
    });
  });

  it('invalidates deleted or renamed endpoints until the mapping is updated, leaving historical results intact', async () => {
    await withRepository({ 'routing.json': manifest([route]) }, async (repository, context, commit) => {
      const first = await extractRoutingDeclarations(repository, context, ['routing.json']);
      await rename(join(repository.root, 'services/archive.ts'), join(repository.root, 'services/history.ts'));
      const renamedSha = await commit();
      const renamed = await extractRoutingDeclarations(repository,
        { ...context, commitSha: renamedSha, snapshotId: renamedSha }, ['routing.json']);
      expect(renamed.facts).toEqual([]);
      expect(renamed.diagnostics[0]!.reason).toContain('services/archive.ts');
      await writeFile(join(repository.root, 'routing.json'), manifest([{ ...route, consumer: 'services/history.ts' }]));
      const updatedSha = await commit();
      const updated = await extractRoutingDeclarations(repository,
        { ...context, commitSha: updatedSha, snapshotId: updatedSha }, ['routing.json']);
      expect(updated.facts).toHaveLength(2);
      expect(updated.facts.find((fact) => fact.predicate === 'routesThrough')!.object.id)
        .toBe('component:file:services/history.ts');
      expect(updated.facts.find((fact) => fact.predicate === 'emits')!.object.id)
        .toBe(first.facts.find((fact) => fact.predicate === 'emits')!.object.id);
      expect(updated.facts.every((fact) => !first.facts.some((prior) => prior.id === fact.id))).toBe(true);
      await rm(join(repository.root, 'services/history.ts'));
      const deletedSha = await commit();
      expect((await extractRoutingDeclarations(repository,
        { ...context, commitSha: deletedSha, snapshotId: deletedSha }, ['routing.json'])).facts).toEqual([]);
      expect(await extractRoutingDeclarations(repository, context, ['routing.json'])).toEqual(first);
    });
  });

  it('fails closed on missing source files except explicit draft deletion diagnostics', async () => {
    await withRepository({}, async (repository, context) => {
      await expect(extractRoutingDeclarations(repository, context, ['missing.json'])).rejects.toThrow('not a committed file');
      const draft = await extractRoutingDeclarations(repository, context, ['missing.json'], { allowMissingSources: true });
      expect(draft.facts).toEqual([]);
      expect(draft.referencedPaths).toEqual([]);
      expect(draft.diagnostics).toEqual([expect.objectContaining({ kind: 'implementationGaps', provenance: [],
        relatedNodeIds: ['component:file:missing.json'], reason: expect.stringContaining('absent from this draft') })]);
      expect(await extractRoutingDeclarations(new GitRepository('/not-a-repository'), context, [])).toEqual({
        facts: [], diagnostics: [], referencedPaths: [],
      });
    });
  });

  it('rejects malformed, ambiguous and unsupported schemas or path forms', async () => {
    const invalid = [
      '{', '{}', JSON.stringify({ schemaVersion: 2, routes: [] }),
      JSON.stringify({ schemaVersion: 1, routes: [], filters: {} }),
      manifest([{ ...route, consumerGroup: 'workers' }]),
      manifest([{ ...route, scope: ' parcel/dev' }]),
      manifest([{ ...route, channel: 'topic\u0085name' }]),
      '{"schemaVersion":1,"routes":[],"rout\\u0065s":[]}',
      '{"schemaVersion":1,"routes":[{"id":"a","id":"b"}]}',
      ...['../outside.ts', './src/executor.ts', '/src/executor.ts', 'src//executor.ts',
        'src/../executor.ts', 'C:/src.ts', 'https://example.test/src.ts', 'src\\executor.ts',
        'src/*.ts', 'src/%2e%2e/executor.ts', 'src/executor.ts#L1', 'src/\u0000.ts']
        .map((producer) => manifest([{ ...route, producer }])),
    ];
    await withRepository(Object.fromEntries(invalid.map((content, index) => [`invalid-${index}.json`, content])),
      async (repository, context) => {
        for (let index = 0; index < invalid.length; index++) {
          await expect(extractRoutingDeclarations(repository, context, [`invalid-${index}.json`]))
            .rejects.toThrow('Invalid routing source');
        }
        for (const paths of [['./routes.json'], ['../routes.json'], ['routes/*.json'], ['routes.txt'],
          ['routes.json', 'routes.json']]) {
          await expect(extractRoutingDeclarations(repository, context, paths)).rejects.toThrow('exact repository-relative .json');
        }
      });
  });

  it('enforces file-count, combined declaration-count and source-byte bounds', async () => {
    const routes = (count: number, prefix: string) => Array.from({ length: count }, (_, index) =>
      ({ ...route, id: prefix + index }));
    const compact = (value: readonly unknown[]) => JSON.stringify({ schemaVersion: 1, routes: value });
    await withRepository({ 'one.json': compact(routes(300, 'a')), 'two.json': compact(routes(201, 'b')),
      'large.json': manifest([route]) + ' '.repeat(65_536) }, async (repository, context) => {
      await expect(extractRoutingDeclarations(repository, context, ['one.json', 'two.json']))
        .rejects.toThrow('500 declaration');
      await expect(extractRoutingDeclarations(repository, context, ['large.json'])).rejects.toThrow('64 KiB');
      await expect(extractRoutingDeclarations(repository, context,
        Array.from({ length: 17 }, (_, index) => `${index}.json`))).rejects.toThrow('at most 16');
    });
  });
});
