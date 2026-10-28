import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ContextGraphConfig } from '../../src/configuration/config.js';
import { resolveStorageRoot } from '../../src/configuration/cache.js';
import { ContextGraphHydrator } from '../../src/application/hydrator.js';
import { createSemanticArtifactStore } from '../../src/application/semantic-artifact-store.js';
import { CodexCliSemanticExtractor, SemanticHydrator, type SemanticOutput } from '../../src/extraction/semantic.js';
import { DirectRdfOntologyCompiler } from '../../src/extraction/ontology.js';
import { RepositoryFileExtractor, RepositoryContractExtractor, ScipSymbolExtractor, ScipTypeScriptIndexer } from '../../src/extraction/static.js';
import { GitRepository } from '../../src/repository/git.js';
import { FileSnapshotStore } from '../../src/storage/storage.js';

const execute = promisify(execFile);
const stages = ['discovery', 'analysis', 'admission', 'planning', 'execution', 'outcomes'];

export async function traversalFixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-traversal-hydration-'));
  await cp(new URL('../../examples/pipeline', import.meta.url), root, { recursive: true });
  for (const [index, stage] of stages.entries()) {
    const path = join(root, `docs/${stage}.md`);
    await writeFile(path, await readFile(path, 'utf8') + `\n[Next](${stages[(index + 1) % stages.length]}.md)\n` +
      (index === 0 ? '[Review](review.md) [Empty](empty.md) [Tests](../test/pipeline.test.ts)\n' : ''));
  }
  await writeFile(join(root, 'docs/review.md'), 'PASS is a written report, not proof of test execution.\n');
  await writeFile(join(root, 'docs/empty.md'), '');
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(root, '.gitignore'), '.context-graph/\nuser-cache/\n*.config.json\n');
  const template: ContextGraphConfig = JSON.parse(await readFile(join(root, 'context-graph.config.json'), 'utf8'));
  const direct: ContextGraphConfig = { ...template, storageScope: 'user',
    approvedIntentSources: ['docs/discovery.md', 'docs/review.md'],
    semantic: { ...template.semantic, model: 'offline-public-fixture', maxDocuments: 8 } };
  const config: ContextGraphConfig = { ...direct, semantic: { ...direct.semantic, maxDocuments: 6 },
    documentTraversal: { entryPoints: ['docs/discovery.md'], roots: ['docs'], policy: {
      schemaVersion: 1,
      roles: [...stages.map(stage => ({ id: stage, pattern: `docs/${stage}.md`,
        role: stage === 'planning' ? 'plan' as const : 'intent' as const })),
      ...['review', 'empty'].map(name => ({ id: name, pattern: `docs/${name}.md`, role: 'validation' as const }))],
      owners: [{ id: 'pipeline-owner', pattern: 'docs/**', ownerDocument: 'docs/discovery.md' }],
    } } };
  const configPath = join(root, 'context-graph.config.json');
  const save = (value: ContextGraphConfig) => writeFile(configPath, JSON.stringify(value));
  await save(config);
  const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0', '--no-optional-locks', ...args], { cwd: root })).stdout.trim();
  const commit = async () => {
    await git('add', '.');
    await git('-c', 'user.name=Public Traversal Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'public traversal fixture');
    return git('rev-parse', 'HEAD');
  };
  await git('init', '--quiet');
  const head = await commit();
  return { root, config, direct, configPath, save, git, commit, head, repository: new GitRepository(root) };
}

// Exercise the unchanged Codex adapter's prompt, JSON parsing and citation validation without a model.
function parsePublicProse(source: string): SemanticOutput {
  const assertions: SemanticOutput['assertions'][number][] = [];
  for (const [index, line] of source.split('\n').entries()) {
    const implementation = line.match(/The (\w+) stage is implemented by ([^\s]+)\./);
    const route = line.match(/The (\w+) stage routes through the (\w+) stage/);
    const from = implementation?.[1] ?? route?.[1];
    if (!from) continue;
    assertions.push({ subject: { id: `workflow:${from}`, kind: 'Workflow', label: from },
      predicate: implementation ? 'implementedBy' : 'routesThrough',
      object: implementation ? { id: `component:file:${implementation[2]}`, kind: 'Component', label: implementation[2]! }
        : { id: `workflow:${route![2]}`, kind: 'Workflow', label: route![2]! },
      citation: { startLine: index + 1, endLine: index + 1 }, confidence: 1 });
  }
  return { assertions, diagnostics: [], oml: '' };
}

export function traversalApplication(fixture: Awaited<ReturnType<typeof traversalFixture>>,
  config = fixture.config, realScip = false) {
  const storage = resolveStorageRoot(fixture.root, config);
  const store = new FileSnapshotStore(storage);
  const calls: string[] = [];
  let indexes = 0;
  const provider = new CodexCliSemanticExtractor(config.semantic, { async run(_command, args, _cwd, prompt) {
    const path = /^Source path: (.+)$/m.exec(prompt)![1]!;
    const commit = /^Commit: (.+)$/m.exec(prompt)![1]!;
    calls.push(path);
    await writeFile(args[args.indexOf('--output-last-message') + 1]!,
      JSON.stringify(parsePublicProse(await fixture.repository.readFileAt(commit, path))));
    return { stdout: '', stderr: '' };
  } }, async () => 'chatgpt');
  const hydrator = new ContextGraphHydrator({ config, repository: fixture.repository, snapshotStore: store,
    semanticHydrator: new SemanticHydrator(config.semantic, createSemanticArtifactStore(fixture.root, config), provider),
    staticIndexer: { async index(context) {
      indexes++;
      return realScip ? new ScipTypeScriptIndexer(config.scip, storage).index(context)
        : { path: 'offline.scip', digest: 'fixture-index', version: config.scip.version, mode: 'full' as const };
    } },
    ontologyCompiler: new DirectRdfOntologyCompiler(storage), runtimeEvidenceProvider: { collect: async () => [] },
    extractorFactory: scip => [new RepositoryFileExtractor(fixture.repository, ['src', 'test'], scip.digest),
      ...(realScip ? [new RepositoryContractExtractor(fixture.repository, config.contractPatterns, ['src', 'test']),
        new ScipSymbolExtractor(fixture.repository, scip)] : [])], invariantEvaluators: [],
  });
  return { store, storage, hydrator, calls, indexes: () => indexes,
    hydrate: () => hydrator.hydrate({ ref: 'HEAD', headName: 'default' }) };
}
