import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GraphFact, GraphSnapshot } from '@weftlet/core';
import { createContextGraphApplication } from '../src/application/application.js';
import { buildWorkingOverlay } from '../src/application/overlay.js';
import { handleGraphNeighbors } from '../src/interfaces/graph-exploration.js';
import { CG, nodeIri, RdfEvidenceGraph } from '../src/graph/rdf.js';
import { sha256 } from '../src/infrastructure/util.js';
import { codeEvidenceExpectations as expected, codeEvidenceProject } from './fixtures/code-evidence-project.js';

const execute = promisify(execFile);
const files = codeEvidenceProject();
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-code-evidence-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }
    const template = JSON.parse(await readFile(new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    const configPath = join(root, 'context-graph.config.json');
    await writeFile(configPath, JSON.stringify({ ...template, repositoryId: 'public/code-evidence',
      semanticSources: [], approvedIntentSources: [], evidenceRoots: ['test'],
      scip: { command: 'bundled-scip-typescript', version: '0.4.0', args: ['index', '--no-global-caches'],
        sourceProject: { include: ['src/**/*.ts', 'test/**/*.ts'], aliases: {} } } }));
    const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false',
      '-c', 'gc.auto=0', ...args], { cwd: root })).stdout.trim();
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public large-file evidence');
    const application = await createContextGraphApplication(configPath);
    const start = performance.now();
    const hydrated = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    return { root, application, hydrated, elapsedMs: performance.now() - start, git };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
function definitions(snapshot: GraphSnapshot) {
  return snapshot.facts.filter(f => f.codeOccurrence?.role === 'definition');
}
function symbol(snapshot: GraphSnapshot, label: string, path = 'src/large.ts') {
  const matches = definitions(snapshot).filter(f => f.provenance.path === path && f.subject.label === label);
  expect(matches).toHaveLength(1);
  return matches[0]!.subject;
}
function reference(snapshot: GraphSnapshot, from: string, to: string) {
  return snapshot.facts.filter(f => f.codeOccurrence?.role === 'reference' && f.subject.id === from && f.object.id === to);
}

describe('real SCIP symbol and occurrence evidence', () => {
  let state: Awaited<ReturnType<typeof fixture>>;
  beforeAll(async () => { state = await fixture(); }, 90_000);
  afterAll(async () => { if (state) await rm(state.root, { recursive: true, force: true }); });

  it('preserves exact same-file references, recursion, private methods and independent mock identities', async () => {
    const { snapshot } = state.hydrated;
    expect(files['src/large.ts']!.split('\n')).toHaveLength(expected.lines);
    expect(state.elapsedMs).toBeLessThan(expected.maxHydrationMs);
    expect(snapshot.facts.length).toBeLessThan(expected.maxFacts);
    expect(state.hydrated.semanticExtracted).toBe(0);
    const normalize = symbol(snapshot, 'normalize'), analyze = symbol(snapshot, 'analyze');
    const repeated = reference(snapshot, analyze.id, normalize.id);
    expect(repeated).toHaveLength(2);
    expect(repeated.map(f => f.provenance.startLine)).toEqual([expected.repeatedReferenceLine, expected.repeatedReferenceLine]);
    expect(new Set(repeated.map(f => f.provenance.startColumn)).size).toBe(2);
    for (const fact of snapshot.facts.filter(f => f.codeOccurrence)) {
      const span = fact.provenance;
      expect(span).toMatchObject({ digest: sha256(files[span.path]!), commitSha: snapshot.manifest.commitSha,
        columnEncoding: 'utf-16' });
      expect(fact).toMatchObject({ authority: 'implemented', extractionReview: 'deterministic', confidence: 1 });
      expect(fact.predicate).toBe(fact.codeOccurrence!.role === 'definition' ? 'definedBy' : 'references');
    }
    const unicode = reference(snapshot, symbol(snapshot, 'unicode').id, normalize.id)[0]!;
    expect(unicode).toBeDefined();
    expect(files['src/large.ts']!.split('\n')[6]!.slice(unicode.provenance.startColumn! - 1, unicode.provenance.endColumn! - 1)).toBe('normalize');
    const recursive = symbol(snapshot, 'recursive');
    expect(reference(snapshot, recursive.id, recursive.id)).toHaveLength(1);
    expect(reference(snapshot, symbol(snapshot, 'execute').id, symbol(snapshot, 'helper').id)).toHaveLength(1);
    // SCIP 0.4.0 gives this arrow's variable a definition, but no declaration extent.
    // Retain the containing function reference without inventing a call from the arrow.
    expect(reference(snapshot, symbol(snapshot, 'same').id, normalize.id)).toHaveLength(0);
    expect(reference(snapshot, symbol(snapshot, 'nested').id, normalize.id)).toHaveLength(1);
    expect(symbol(snapshot, 'same').codeSymbol?.identityScope).toBe('index-document');
    expect(symbol(snapshot, 'normalize', 'test/mock.spec.ts').id).not.toBe(normalize.id);
    const overloads = definitions(snapshot).filter(f => f.subject.label === 'overloaded');
    expect(overloads).toHaveLength(3);
    expect(new Set(overloads.map(f => f.subject.id)).size).toBe(1);
    expect(new Set(overloads.map(f => f.provenance.startLine)).size).toBe(3);
    expect(reference(snapshot, symbol(snapshot, 'useOverload').id, overloads[0]!.subject.id)).toHaveLength(1);
    const graph = new RdfEvidenceGraph(snapshot);
    expect(await graph.validate()).toEqual({ conforms: true, issues: [] });
    expect(await graph.facts()).toEqual(snapshot.facts);
    const rows = await graph.select(`SELECT ?line ?column WHERE {
      ?fact <http://www.w3.org/1999/02/22-rdf-syntax-ns#subject> <${nodeIri(analyze.id)}>;
        <http://www.w3.org/1999/02/22-rdf-syntax-ns#object> <${nodeIri(normalize.id)}>;
        <${CG}codeRole> "reference"; <${CG}startLine> ?line; <${CG}startColumn> ?column
    }`);
    expect(rows.truncated).toBe(false);
    expect(rows.rows).toHaveLength(2);
  });

  it('exposes exact paginated incoming/outgoing references and paths through the agent facade', async () => {
    const { application, hydrated: { snapshot } } = state;
    const snapshotId = snapshot.manifest.snapshotId;
    const normalize = symbol(snapshot, 'normalize'), analyze = symbol(snapshot, 'analyze');
    const request = { snapshotId, nodeId: normalize.id, direction: 'incoming' as const,
      predicates: ['references'] as const, maxFacts: 2 };
    let page = await handleGraphNeighbors(application.explorationService, request);
    expect(page.selection.truncated).toBe(true);
    const facts: GraphFact[] = [...page.facts];
    for (let i = 0; page.selection.continuation; i++) {
      if (i > 50) throw new Error('Unbounded pagination');
      page = await handleGraphNeighbors(application.explorationService, { ...request, continuation: page.selection.continuation });
      facts.push(...page.facts);
    }
    expect(new Set(facts.map(f => f.id)).size).toBe(facts.length);
    expect(facts.map(f => f.id).sort()).toEqual(snapshot.facts.filter(f => f.predicate === 'references' &&
      f.object.id === normalize.id).map(f => f.id).sort());
    expect(facts.map(f => f.subject.id)).not.toContain(symbol(snapshot, 'distantUnrelated').id);
    expect(facts.map(f => f.subject.id)).not.toContain(symbol(snapshot, 'check', 'test/mock.spec.ts').id);
    const outgoing = await handleGraphNeighbors(application.explorationService, { snapshotId, nodeId: analyze.id,
      direction: 'outgoing', predicates: ['references'], maxFacts: 200 });
    expect(outgoing.facts.filter(f => f.object.id === normalize.id)).toHaveLength(2);
    expect(outgoing.markdown).toContain('src/large.ts:2:');
    const paths = await application.pathService.paths({ snapshotId, fromNodeId: symbol(snapshot, 'run').id,
      toNodeId: normalize.id, direction: 'outgoing', predicates: ['references'], maxDepth: 4 });
    expect(paths.paths.length).toBeGreaterThan(0);
    const chain = expected.chain.map(name => symbol(snapshot, name).id);
    expect(paths.paths.some(path => JSON.stringify(path.nodeIds) === JSON.stringify(chain))).toBe(true);
  });

  it('retains unresolved evidence without spreading automatic impact through shared external symbols', async () => {
    const { application, hydrated: { snapshot } } = state;
    const unresolved = snapshot.facts.filter(f => f.codeOccurrence?.role === 'reference' &&
      f.object.codeSymbol?.resolution === 'no-indexed-definition');
    expect(unresolved.length).toBeGreaterThan(0);
    const pack = await application.queryService.scan({ snapshotId: snapshot.manifest.snapshotId,
      changedFiles: ['src/large.ts'], maxFacts: 200 });
    expect(pack.facts.some(f => f.provenance.path === 'src/unrelated.ts')).toBe(false);
    expect(pack.exploration!.unexpandedCodeTargets!.length).toBeGreaterThan(0);
    expect(pack.markdown).toContain('Unresolved code targets left unexpanded');
    const shared = unresolved.find(f => f.provenance.path === 'src/unrelated.ts' &&
      unresolved.some(other => other.provenance.path === 'src/large.ts' && other.object.id === f.object.id))!;
    expect(shared).toBeDefined();
    const exact = await application.explorationService.neighbors({ snapshotId: snapshot.manifest.snapshotId,
      nodeId: shared.object.id, direction: 'incoming', maxFacts: 200 });
    expect(exact.facts.some(f => f.provenance.path === 'src/unrelated.ts')).toBe(true);
  });

  it('repeats identically and replaces edited, renamed and deleted code evidence only in a draft overlay', async () => {
    const { application, root, hydrated: { snapshot } } = state;
    const repeated = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeated.snapshot.manifest.snapshotId).toBe(snapshot.manifest.snapshotId);
    expect(repeated.snapshot.manifest.contentDigest).toBe(snapshot.manifest.contentDigest);
    expect(repeated.snapshot.facts).toEqual(snapshot.facts);
    const changed = '// draft line shift\n' + files['src/large.ts']!.replace('value < 0 ? 0 : value', 'value < 1 ? 1 : value');
    await writeFile(join(root, 'src/large.ts'), changed);
    await rename(join(root, 'src/consumer.ts'), join(root, 'src/renamed.ts'));
    await rm(join(root, 'src/unrelated.ts'));
    const saved = await application.explorationService.neighbors({ snapshotId: snapshot.manifest.snapshotId,
      nodeId: symbol(snapshot, 'normalize').id, maxFacts: 200 });
    expect(saved.evidenceState?.excludedWorkingChanges).toContain('src/large.ts');
    const overlay = await buildWorkingOverlay(application.repository, application.config, application.snapshotStore,
      join(root, '.context-graph'), snapshot.manifest.snapshotId, 'code-evidence-test');
    const code = overlay.facts.filter(f => f.codeOccurrence);
    expect(code.length).toBeGreaterThan(0);
    expect(code.every(f => f.authority === 'draft')).toBe(true);
    expect(code.some(f => ['src/consumer.ts', 'src/unrelated.ts'].includes(f.provenance.path))).toBe(false);
    expect(code.some(f => f.provenance.path === 'src/renamed.ts')).toBe(true);
    expect(symbol(overlay, 'normalize').id).toBe(symbol(snapshot, 'normalize').id);
    expect(symbol(overlay, 'same').id).not.toBe(symbol(snapshot, 'same').id);
    expect(code.find(f => f.codeOccurrence?.role === 'definition' && f.subject.id === symbol(overlay, 'normalize').id)!.provenance)
      .toMatchObject({ startLine: 2, digest: sha256(changed), commitSha: snapshot.manifest.commitSha });
    expect(await new RdfEvidenceGraph(overlay).validate()).toEqual({ conforms: true, issues: [] });
    expect(await application.snapshotStore.read(snapshot.manifest.snapshotId)).toEqual(snapshot);
  }, 60_000);
});
