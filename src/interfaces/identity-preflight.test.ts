import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { GraphFact, GraphSnapshot } from '@weftlet/core';
import { sha256, stableJson } from '@weftlet/core';
import { loadConfig } from '../configuration/config.js';
import { FileSnapshotStore } from '../storage/storage.js';

const execute = promisify(execFile);
const cli = resolve('src/cli.ts');
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const roots: string[] = [];
const sourcePath = 'src/PRIVATE_FILE_SENTINEL.spec.ts';
const nodeId = `component:file:${sourcePath}`;
const factId = 'PRIVATE_FACT_SENTINEL';
const extractor = { id: 'PRIVATE_EXTRACTOR_SENTINEL', version: 'PRIVATE_VERSION_SENTINEL' };
const source = 'import { task } from "./worker.js";\nexport const worker = () => task("PRIVATE_SOURCE_SENTINEL");\n';
const label = 'PRIVATE_LABEL_SENTINEL';
const prompt = 'PRIVATE_PROMPT_SENTINEL';

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(kind: 'Component' | 'Evidence' = 'Component') {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-identity-cli-'));
  roots.push(root);
  await Promise.all(['src', 'docs'].map(path => mkdir(join(root, path))));
  const files = {
    '.gitattributes': '* text eol=lf\n',
    '.gitignore': '.context-graph/\nprovider-calls.txt\n',
    'package.json': JSON.stringify({ name: 'public-identity-fixture', version: '1.0.0', private: true, type: 'module' }),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext',
      moduleResolution: 'NodeNext', strict: true, noEmit: true }, include: ['src/**/*.ts'] }),
    'src/worker.ts': 'export function task(value: string): string { return value; }\n',
    'docs/intent.md': '# Public intent\nThe public worker demonstrates retained source evidence.\n',
    [sourcePath]: source,
    'provider.mjs': `
      import { appendFile } from 'node:fs/promises';
      export const createSemanticExtractor = () => ({ identity: 'public-identity-provider:1',
        async extract() {
          await appendFile(new URL('./provider-calls.txt', import.meta.url), 'call\\n');
          return { parsed: { assertions: [], diagnostics: [], oml: '' }, rawModelOutput: ${JSON.stringify(prompt)} };
        }
      });
    `,
    'adapter.mjs': `
      import { createHash } from 'node:crypto';
      export const createContextGraphAdapter = repository => ({ invariantEvaluators: [], factExtractors: [{
        identity: ${JSON.stringify(extractor)},
        async extract(context) {
          const source = await repository.readFileAt(context.commitSha, ${JSON.stringify(sourcePath)});
          return [{ id: ${JSON.stringify(factId)},
            subject: { id: ${JSON.stringify(nodeId)}, kind: ${JSON.stringify(kind)}, label: ${JSON.stringify(label)} },
            predicate: 'consumes', object: { id: 'contract:public-worker', kind: 'Contract', label: ${JSON.stringify(label)} },
            provenance: { path: ${JSON.stringify(sourcePath)}, startLine: 1, endLine: 1,
              digest: createHash('sha256').update(source).digest('hex'), commitSha: context.commitSha },
            extractor: this.identity, snapshotId: context.snapshotId, confidence: 0.91,
            authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed' }];
        }
      }] });
    `,
  };
  await Promise.all(Object.entries(files).map(([path, text]) => writeFile(join(root, path), text)));
  const config = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  Object.assign(config, { repositoryId: 'public/identity-preflight-cli', approvedIntentSources: ['docs/intent.md'],
    adapter: './adapter.mjs', evidenceRoots: [],
    semantic: { ...config.semantic, provider: 'module', providerModule: './provider.mjs',
      providerIdentity: 'public-identity-provider:1' },
    scip: { version: '0.4.0', command: 'bundled-scip-typescript', args: ['index', '--no-global-caches', 'tsconfig.json'] },
  });
  const configPath = join(root, 'context-graph.config.json');
  await writeFile(configPath, JSON.stringify(config));
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  await git('init', '--quiet'); await git('add', '.');
  await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public identity fixture');
  const commitSha = (await git('rev-parse', 'HEAD')).stdout.trim();
  const configurationDigest = sha256(stableJson((await loadConfig(configPath)).config));
  const priorFact: GraphFact = { id: factId, subject: { id: nodeId, kind, label }, predicate: 'consumes',
    object: { id: 'contract:public-worker', kind: 'Contract', label },
    provenance: { path: sourcePath, startLine: 1, endLine: 1, digest: sha256(source), commitSha },
    extractor, confidence: 0.91, snapshotId: 'prior', authority: 'inferred',
    sourceAuthority: 'declared', extractionReview: 'unreviewed' };
  const prior: GraphSnapshot = {
    manifest: { schemaVersion: 1, repositoryId: config.repositoryId, ref: 'HEAD', commitSha,
      snapshotId: 'prior', configurationDigest, scope: ['docs'], ontologyVersion: '1',
      extractorVersions: {}, semanticModel: 'public-fixture', semanticPromptVersion: '1',
      generatedAt: '2026-01-01T00:00:00Z', contentDigest: sha256(stableJson([priorFact])),
      semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
    facts: [priorFact], invariants: [], runtimeEvidence: [], unresolved: [],
  };
  const storage = join(root, '.context-graph');
  const store = new FileSnapshotStore(storage);
  await store.write(prior); await store.updateHead('default', 'prior');
  const headPath = join(storage, 'heads/default.json');
  const snapshotPath = join(storage, 'snapshots/prior.json');
  const priorHead = await readFile(headPath); const priorSnapshot = await readFile(snapshotPath);
  const run = (...args: string[]) => execute(process.execPath, ['--import', tsx, cli, ...args], {
    cwd: root, timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
  });
  const assertPreserved = async () => {
    expect(await readFile(headPath)).toEqual(priorHead);
    expect(await readFile(snapshotPath)).toEqual(priorSnapshot);
    expect(await readdir(join(storage, 'snapshots'))).toEqual(['prior.json']);
    expect(await readdir(join(storage, 'heads'))).toEqual(['default.json']);
    const work = await readdir(join(storage, 'work')).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    expect(work.filter(name => name.startsWith('rdf-'))).toEqual([]);
  };
  return { root, storage, commitSha, run, assertPreserved, priorFact, store };
}

async function failure(run: Promise<{ stdout: string; stderr: string }>) {
  return run.then(() => { throw new Error('Expected preflight to reject the fixture'); },
    (error: { code: number; stdout: string; stderr: string }) => error);
}

function assertPrivate(output: string, root: string) {
  for (const secret of [root, sourcePath, nodeId, factId, extractor.id, extractor.version,
    'PRIVATE_SOURCE_SENTINEL', label, prompt]) expect(output).not.toContain(secret);
  expect(output).not.toContain('at ContextGraphHydrator');
}

describe('identity preflight CLI', () => {
  it('fails before RDF with private defaults and preserves snapshots and completed artifacts on retry', async () => {
    const { root, storage, run, assertPreserved } = await fixture();
    const human = await failure(run('hydrate'));
    expect(human.code).toBe(1); expect(human.stdout).toBe('');
    expect(human.stderr).toContain('validate-identities');
    expect(human.stderr).toContain('--validation-details');
    expect(human.stderr).not.toContain('compile-semantic-rdf');
    expect(human.stderr).not.toContain('validate-shacl');
    assertPrivate(human.stderr, root);
    await assertPreserved();
    const artifacts = await readdir(join(storage, 'artifacts/semantic'));
    expect(artifacts).toHaveLength(1);
    const artifactBytes = await readFile(join(storage, 'artifacts/semantic', artifacts[0]!));
    const response = await failure(run('hydrate', '--json', '--quiet'));
    expect(response.code).toBe(1); expect(response.stdout).toBe('');
    const report = JSON.parse(response.stderr);
    expect(report).toMatchObject({ schemaVersion: 1, kind: 'graph-identity-preflight',
      category: 'extraction-gap', phase: 'validate-identities', passed: false, shaclValidated: false, conflictCount: 1 });
    expect(report.conflicts[0].kinds).toEqual(expect.arrayContaining(['Component', 'Evidence']));
    expect(report.conflicts[0].occurrences.length).toBeGreaterThanOrEqual(3);
    assertPrivate(response.stderr, root);
    expect(await readFile(join(storage, 'artifacts/semantic', artifacts[0]!))).toEqual(artifactBytes);
    expect(await readFile(join(root, 'provider-calls.txt'), 'utf8')).toBe('call\n');
    await assertPreserved();
  }, 30_000);

  it('includes exact local attribution only with explicit detail, including without the JSON flag', async () => {
    const { root, commitSha, priorFact, run, assertPreserved } = await fixture();
    const response = await failure(run('hydrate', '--quiet', '--validation-details'));
    expect(response.code).toBe(1); expect(response.stdout).toBe('');
    const report = JSON.parse(response.stderr);
    const conflict = report.conflicts.find((item: { details?: { nodeId: string } }) => item.details?.nodeId === nodeId);
    expect(conflict).toBeDefined();
    const occurrence = conflict.occurrences.find((item: { details?: { factId: string } }) => item.details?.factId === factId);
    expect(occurrence).toMatchObject({ side: 'subject', kind: 'Component', details: {
      nodeId, nodeKind: 'Component', factId, extractor, provenance: {
        path: sourcePath, startLine: 1, endLine: 1, digest: sha256(source), commitSha },
      confidence: 0.91, authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed',
    } });
    expect(occurrence.details.provenance).toEqual(priorFact.provenance);
    for (const excluded of [root, 'PRIVATE_SOURCE_SENTINEL', label, prompt]) expect(response.stderr).not.toContain(excluded);
    expect(response.stderr).not.toContain('at ContextGraphHydrator');
    await assertPreserved();
  }, 30_000);

  it('uses the same private/explicit-detail error contract for a retained conflicting overlay fact', async () => {
    const { root, run, assertPreserved } = await fixture();
    const safe = await failure(run('overlay', '--base-snapshot', 'prior', '--json', '--quiet'));
    expect(safe.code).toBe(1); expect(safe.stdout).toBe('');
    expect(JSON.parse(safe.stderr)).toMatchObject({ kind: 'graph-identity-preflight', passed: false,
      conflictCount: 1, shaclValidated: false });
    assertPrivate(safe.stderr, root);
    const detailed = await failure(run('overlay', '--base-snapshot', 'prior', '--json', '--quiet', '--validation-details'));
    expect(detailed.code).toBe(1); expect(detailed.stdout).toBe('');
    expect(JSON.parse(detailed.stderr).conflicts[0].details).toEqual({ nodeId });
    await assertPreserved();
  }, 30_000);

  it('reports phase timings for a valid graph, still runs full SHACL, and documents detail privacy', async () => {
    const { run, store } = await fixture('Evidence');
    const response = await run('hydrate');
    const result = JSON.parse(response.stdout);
    expect(response.stderr).toContain('validate-identities');
    expect(response.stderr).toContain('validate-shacl');
    expect(response.stderr).toMatch(/validate-shacl[^\n]*\d+ ms/);
    const snapshot = await store.read(result.snapshotId);
    expect(snapshot?.facts.some(fact => fact.extractor.id === 'scip-symbol-extractor')).toBe(true);
    expect(snapshot?.facts.find(fact => fact.id === factId)?.subject.kind).toBe('Evidence');
    const validated = await run('validate', '--snapshot', result.snapshotId);
    expect(JSON.parse(validated.stdout)).toEqual({ conforms: true, issues: [] });
    const help = await run('--help');
    expect(help.stderr).toBe('');
    expect(help.stdout).toContain('--validation-details explicitly includes local node/fact identities');
    expect(help.stdout).toContain('default reports use opaque references');
  }, 30_000);
});
