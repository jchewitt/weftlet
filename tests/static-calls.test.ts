import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GraphFact, GraphSnapshot } from '@weftlet/core';
import { staticCallFixture, staticCallProject, callExpectations } from './fixtures/static-call-project.js';
import { buildWorkingOverlay } from '../src/application/overlay.js';
import { RdfEvidenceGraph, CG, nodeIri } from '../src/graph/rdf.js';
import { handleGraphNeighbors } from '../src/interfaces/graph-exploration.js';
import { renderContextPackHtml } from '../src/visualization/visualization.js';
import { sha256 } from '../src/infrastructure/util.js';
import { Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import { evidenceShapes } from '../src/graph/shacl-shapes.js';
import { extractStaticCalls } from '../src/extraction/static-calls.js';
import { assertSemanticOutput } from '../src/extraction/semantic.js';

const calls = (snapshot: GraphSnapshot) => snapshot.facts.filter(f => f.codeCall);
const definition = (snapshot: GraphSnapshot, name: string, path = 'src/large.ts') => snapshot.facts.find(f =>
  f.codeOccurrence?.role === 'definition' && f.subject.label === name && f.provenance.path === path)!.subject;

describe('static calls from committed source and exact SCIP evidence', () => {
  let fixture: Awaited<ReturnType<typeof staticCallFixture>>, snapshot: GraphSnapshot;
  beforeAll(async () => {
    fixture = await staticCallFixture(); const started = performance.now();
    snapshot = (await fixture.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).snapshot;
    expect(performance.now() - started).toBeLessThan(callExpectations.maxHydrationMs);
  }, 120_000);
  afterAll(async () => { if (fixture) await rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

  it('retains exact caller/callee/sites across repeated, private, local, recursive and cross-file calls', () => {
    expect(snapshot.facts.length).toBeLessThan(callExpectations.maxFacts);
    for (const [caller, callee] of callExpectations.direct) expect(calls(snapshot).some(f =>
      f.provenance.path === 'src/large.ts' && f.subject.label === caller && f.codeCall!.targetOccurrences.some(proof => {
        const span = proof.provenance, line = staticCallProject()['src/large.ts'].split('\n')[span.startLine - 1]!;
        return line.slice(span.startColumn! - 1, span.endColumn! - 1) === callee;
      })), `${caller} -> ${callee}`).toBe(true);
    const repeated = calls(snapshot).filter(f => f.subject.label === 'analyze');
    expect(repeated).toHaveLength(2);
    expect(new Set(repeated.map(f => f.provenance.startColumn)).size).toBe(2);
    expect(new Set(repeated.map(f => f.id)).size).toBe(2);
    expect(calls(snapshot).find(f => f.subject.label === 'consume')!.object).toEqual(definition(snapshot, 'run'));
    expect(calls(snapshot).find(f => f.subject.label === 'aliasStart')!.object).toEqual(definition(snapshot, 'run'));
    expect(calls(snapshot).find(f => f.subject.label === 'View')!.object).toEqual(definition(snapshot, 'leaf'));
    expect(calls(snapshot).find(f => f.subject.label === 'other')!.object.id).not.toBe(definition(snapshot, 'normalize').id);
    const shadow = calls(snapshot).find(f => f.subject.label === 'shadow')!;
    expect(shadow.object.id).not.toBe(repeated[0]!.object.id);
    expect(calls(snapshot).find(f => f.subject.label === 'optional')!.codeCall!.optional).toBe(true);
    expect(calls(snapshot).find(f => f.subject.label === 'declarationOnly')!.codeCall!.target).toBe('declaration-only');
    expect(calls(snapshot).find(f => f.subject.label === 'construct')!.codeCall).toMatchObject({ syntax: 'construct', target: 'indexed-class' });
    expect(calls(snapshot).find(f => f.subject.label === 'useConvert')!.codeCall!.targetDefinitions).toHaveLength(3);
    expect(calls(snapshot).some(f => f.codeCall!.caller === 'file-scope')).toBe(true);
  });

  it('distinguishes callback registration, values, types and unknown dispatch without inventing calls', () => {
    for (const name of callExpectations.noCallToLeaf) expect(calls(snapshot).filter(f => f.subject.label === name)
      .some(f => f.object.label === 'leaf'), name).toBe(false);
    for (const name of callExpectations.unresolvedCallers) expect(snapshot.diagnostics!.some(d =>
      d.reason.startsWith('Static call:') && d.relatedNodeIds.includes(definition(snapshot, name).id)), name).toBe(true);
    expect(snapshot.facts.some(f => f.codeOccurrence?.role === 'reference' && f.object.label === 'leaf' && f.provenance.startLine === 14)).toBe(true);
    expect(calls(snapshot).some(f => f.subject.label === 'LeafType' || f.object.label === 'LeafType')).toBe(false);
    expect(calls(snapshot).find(f => f.subject.label === 'external')!.codeCall!.target).toBe('external');
  });

  it('keeps decorators and initializers outside method callers while resolving defaults and private fields', () => {
    const scope = calls(snapshot).filter(f => f.provenance.path === 'src/scopes.ts');
    expect(scope.filter(f => f.provenance.startLine === 5).every(f => f.codeCall!.caller === 'file-scope')).toBe(true);
    expect(scope.filter(f => f.subject.label === 'method' && f.object.label === 'compute')).toHaveLength(2);
    expect(scope.some(f => f.subject.label === 'initialized' && f.object.label === 'compute')).toBe(true);
    expect(scope.some(f => f.subject.label === 'useSecret' && f.object.label === '#secret')).toBe(true);
    expect(scope.some(f => [7, 9].includes(f.provenance.startLine))).toBe(false);
    for (const line of [7, 9]) expect(snapshot.diagnostics!.some(d => d.reason.startsWith('Static call:') &&
      d.provenance.some(p => p.path === 'src/scopes.ts' && p.startLine === line))).toBe(true);
  });

  it('preserves exact source/proof bytes, UTF-16 spans and static authority through RDF/SPARQL', async () => {
    const byId = new Map(snapshot.facts.map(f => [f.id, f]));
    for (const fact of calls(snapshot)) {
      expect(fact).toMatchObject({ authority: 'implemented', extractionReview: 'deterministic', codeCall: { runtime: 'not-observed' } });
      const content = await readFile(join(fixture.root, fact.provenance.path), 'utf8');
      expect(fact.provenance.digest).toBe(sha256(content));
      for (const proof of [...fact.codeCall!.callerDefinitions, ...fact.codeCall!.targetDefinitions, ...fact.codeCall!.targetOccurrences]) {
        expect(byId.get(proof.factId)!.provenance).toEqual(proof.provenance);
      }
    }
    const bom = calls(snapshot).find(f => f.subject.label === 'bomUse')!;
    expect(bom.codeCall!.targetDefinitions[0]!.provenance.startColumn).toBe(18);
    const unicode = calls(snapshot).find(f => f.subject.label === 'unicode')!;
    const line = staticCallProject()['src/large.ts'].split('\n')[unicode.provenance.startLine - 1]!;
    expect(unicode.provenance.startColumn).toBe(line.indexOf('leaf(') + 1);
    const graph = new RdfEvidenceGraph(snapshot);
    expect(await graph.validate()).toEqual({ conforms: true, issues: [] });
    expect((await graph.select(`SELECT ?s ?o WHERE { GRAPH ?f { ?s <${CG}calls> ?o } }`)).rows).toHaveLength(calls(snapshot).length);
    expect(await graph.facts()).toEqual(snapshot.facts);
  });

  it('pages real caller/callee queries and follows the helper chain to a cited business rule', async () => {
    const analyze = definition(snapshot, 'analyze');
    let continuation: string | undefined; const returned: GraphFact[] = []; let bytes = 0, pages = 0;
    do {
      const page = await handleGraphNeighbors(fixture.app.explorationService, { snapshotId: snapshot.manifest.snapshotId,
        nodeId: analyze.id, direction: 'both', predicates: ['calls'], maxFacts: 2, ...(continuation ? { continuation } : {}) });
      returned.push(...page.facts); bytes += Buffer.byteLength(JSON.stringify(page)); continuation = page.selection.continuation;
      expect(++pages).toBeLessThanOrEqual(4);
    } while (continuation);
    expect(returned).toHaveLength(3); expect(pages).toBe(2); expect(bytes).toBeLessThan(callExpectations.maxResponseBytes);
    const paths = await fixture.app.pathService.paths({ snapshotId: snapshot.manifest.snapshotId,
      fromNodeId: definition(snapshot, 'run').id, toNodeId: 'invariant:policy', direction: 'both',
      predicates: ['calls', 'implementedBy'], maxDepth: 6, maxPaths: 3, maxSteps: 500 });
    expect(paths.paths.some(p => p.nodeIds.length === 6)).toBe(true);
    expect(paths.facts.some(f => f.object.label === 'unrelated')).toBe(false);
    const binding = paths.facts.find(f => f.codeBinding)!;
    expect(binding).toMatchObject({ authority: 'inferred', extractionReview: 'unreviewed' });
    const pack = await fixture.app.queryService.scan({ snapshotId: snapshot.manifest.snapshotId, symbols: [definition(snapshot, 'run').id] });
    expect(renderContextPackHtml(pack)).toContain('execution not observed');
    expect(renderContextPackHtml(pack)).toContain('callee reference:');
  });

  it('rejects forged calls, stale source bytes and promotion into observed/approved evidence', async () => {
    const original = calls(snapshot).find(f => f.subject.label === 'analyze')!;
    for (const mutate of [
      (fact: any) => { delete fact.codeCall; },
      (fact: any) => { fact.codeCall.targetOccurrences = []; },
      (fact: any) => { fact.codeCall.targetOccurrences[0].factId = 'missing'; },
      (fact: any) => { fact.codeCall.targetDefinitions[0].provenance.digest = 'wrong'; },
      (fact: any) => { fact.codeCall.targetDefinitions[0].provenance.commitSha = 'stale'; },
      (fact: any) => { fact.codeCall.callerDefinitions = []; },
      (fact: any) => { fact.codeCall.target = 'external'; },
      (fact: any) => { fact.provenance.startColumn = fact.provenance.endColumn; },
      (fact: any) => { fact.authority = 'observed'; },
      (fact: any) => { fact.extractionReview = 'approved'; },
      (fact: any) => { fact.codeCall.runtime = 'observed'; },
    ]) {
      const invalid = structuredClone(original); mutate(invalid);
      expect((await new RdfEvidenceGraph({ ...snapshot, facts: snapshot.facts.map(f => f.id === original.id ? invalid : f) }).validate()).conforms).toBe(false);
    }
    const malformed = structuredClone(original) as any; delete malformed.codeCall;
    for (const fact of [original, malformed]) {
      const graph = new RdfEvidenceGraph({ ...snapshot, facts: snapshot.facts.map(f => f.id === original.id ? fact : f) });
      const named = new Store(new Parser({ format: 'N-Quads' }).parse(await graph.serialize()));
      expect((await new SHACLValidator(new Store(evidenceShapes)).validate(named)).conforms).toBe(Boolean(fact.codeCall));
      expect((await graph.validate()).conforms).toBe(Boolean(fact.codeCall));
    }
    const context = { repositoryRoot: fixture.root, repositoryId: fixture.app.config.repositoryId,
      commitSha: snapshot.manifest.commitSha, snapshotId: snapshot.manifest.snapshotId, ref: 'HEAD', changedPaths: [], deletedPaths: [], renamedPaths: {} };
    expect(() => extractStaticCalls(new Map([['src/large.ts', 'changed']]), snapshot.facts, context)).toThrow('matching committed');
    const assertion = { subject: { id: 'component:a', kind: 'Component', label: 'A' },
      object: { id: 'component:b', kind: 'Component', label: 'B' }, citation: { startLine: 1, endLine: 1 }, confidence: 1 };
    const source = { path: 'docs/rules.md', content: 'A declaration.', digest: 'fixture', stableSemanticId: 'fixture' };
    expect(() => assertSemanticOutput({ assertions: [{ ...assertion, predicate: 'references' }], oml: '' }, source)).not.toThrow();
    expect(() => assertSemanticOutput({ assertions: [{ ...assertion, predicate: 'calls' }], oml: '' }, source)).toThrow();
  }, 60_000);

  it('reuses semantic artifacts and preserves saved calls while working changes are unindexed', async () => {
    const repeated = await fixture.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeated).toMatchObject({ semanticExtracted: 0, semanticReused: 1 });
    expect(repeated.snapshot.manifest.contentDigest).toBe(snapshot.manifest.contentDigest);
    expect(repeated.snapshot.manifest.snapshotId).toBe(snapshot.manifest.snapshotId);
    await writeFile(join(fixture.root, 'src/large.ts'), '// Working line shift\n' + staticCallProject()['src/large.ts'].replace('return plan(value);', 'return leaf(value);'));
    const saved = await fixture.app.explorationService.neighbors({ snapshotId: snapshot.manifest.snapshotId,
      nodeId: definition(snapshot, 'run').id, predicates: ['calls'], direction: 'outgoing' });
    expect(saved.facts[0]!.object.label).toBe('plan');
    const overlay = await buildWorkingOverlay(fixture.app.repository, fixture.app.config, fixture.app.snapshotStore,
      fixture.app.storageRoot, snapshot.manifest.snapshotId, 'call-test');
    expect(calls(overlay).find(f => f.subject.label === 'run')!.object.label).toBe('leaf');
    expect(calls(overlay).every(f => f.authority === 'draft' && f.provenance.commitSha === snapshot.manifest.commitSha)).toBe(true);
    expect(calls(overlay).find(f => f.subject.label === 'analyze')!.provenance.startLine).toBe(3);
    expect(await new RdfEvidenceGraph(overlay).validate()).toEqual({ conforms: true, issues: [] });
    expect((await fixture.app.snapshotStore.read(snapshot.manifest.snapshotId))!.facts).toEqual(snapshot.facts);
    await writeFile(join(fixture.root, 'src/large.ts'), staticCallProject()['src/large.ts']);
    await rename(join(fixture.root, 'src/copy.ts'), join(fixture.root, 'src/renamed.ts'));
    await rm(join(fixture.root, 'src/consumer.ts'));
    const renamed = await buildWorkingOverlay(fixture.app.repository, fixture.app.config, fixture.app.snapshotStore,
      fixture.app.storageRoot, snapshot.manifest.snapshotId, 'call-renames');
    expect(calls(renamed).some(f => ['src/copy.ts', 'src/consumer.ts'].includes(f.provenance.path))).toBe(false);
    expect(calls(renamed).some(f => f.provenance.path === 'src/renamed.ts')).toBe(true);
    expect(await new RdfEvidenceGraph(renamed).validate()).toEqual({ conforms: true, issues: [] });
  }, 90_000);
});
