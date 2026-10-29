import { Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import { evidenceShapes } from '../src/graph/shacl-shapes.js';
import { extractDocumentCodeBindings } from '../src/extraction/document-code-bindings.js';
import { createContextGraphApplication } from '../src/application/application.js';
import { sha256 } from '../src/infrastructure/util.js';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GraphFact, GraphSnapshot } from '@weftlet/core';
import { buildWorkingOverlay } from '../src/application/overlay.js';
import { CG, nodeIri, RdfEvidenceGraph } from '../src/graph/rdf.js';
import { handleGraphNeighbors } from '../src/interfaces/graph-exploration.js';
import { renderContextPackHtml } from '../src/visualization/visualization.js';
import { bindingFiles, symbolBindingFixture } from './fixtures/symbol-bindings.js';

const bindings = (s: GraphSnapshot) => s.facts.filter(f => f.codeBinding);
function checkProofs(snapshot: GraphSnapshot) {
  for (const binding of bindings(snapshot)) {
    for (const proof of [...binding.codeBinding!.selectedOccurrences, ...binding.codeBinding!.definitions, ...binding.codeBinding!.subjectEvidence]) {
      const fact = snapshot.facts.find(f => f.id === proof.factId);
      expect(fact).toBeDefined(); expect(fact!.provenance).toEqual(proof.provenance);
    }
  }
}

describe('explicit document bindings with real SCIP and offline prose extraction', () => {
  let f: Awaited<ReturnType<typeof symbolBindingFixture>>, snapshot: GraphSnapshot;
  beforeAll(async () => { f = await symbolBindingFixture(); snapshot = (await f.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).snapshot; }, 90_000);
  afterAll(async () => { if (f) await rm(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });

  it('resolves explicit mappings, private/qualified symbols, overloads, aliases and exact BOM positions', async () => {
    const facts = bindings(snapshot);
    expect(facts.map(f => f.codeBinding!.selector.symbol).sort()).toEqual([
      'normalize', 'check', 'Engine.helper', 'overloaded', 'First.run', 'publicAlias', 'declared', 'bom', 'normalize', 'consume', 'other', 'check',
    ].sort());
    const implementation = facts.find(f => f.predicate === 'implementedBy')!;
    expect(implementation).toMatchObject({ subject: { id: 'invariant:max-age' }, object: { label: 'normalize', kind: 'CodeSymbol' },
      authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed', confidence: 0.9 });
    expect(implementation.codeBinding!.subjectEvidence).toHaveLength(1);
    expect(implementation.codeBinding!.subjectEvidence[0]).toMatchObject({ authority: 'inferred', extractionReview: 'unreviewed',
      sourceAuthority: 'declared', provenance: { path: 'docs/rules.md', startLine: 2 } });
    expect(facts.find(f => f.predicate === 'verifiedBy')!.object.label).toBe('check');
    expect(facts.find(f => f.codeBinding!.selector.symbol === 'overloaded')!.codeBinding!.definitions).toHaveLength(3);
    const alias = facts.find(f => f.codeBinding!.selector.symbol === 'publicAlias')!;
    expect(alias.object.id).toBe(implementation.object.id);
    expect(alias.codeBinding!.selectedOccurrences[0]!.provenance.path).toBe('src/barrel.ts');
    expect(alias.codeBinding!.definitions[0]!.provenance.path).toBe('src/large.ts');
    expect(facts.find(f => f.codeBinding!.selector.symbol === 'declared')!.object.codeSymbol!.resolution).toBe('declaration-only');
    expect(facts.find(f => f.codeBinding!.documentCitations.length === 2)!.codeBinding!.documentCitations.map(c => c.startLine)).toEqual([15, 13]);
    expect(snapshot.diagnostics?.filter(d => d.kind === 'implementationGaps').map(d => d.reason)).toEqual(expect.arrayContaining([
      expect.stringContaining('Ambiguous indexed symbol'), expect.stringContaining('No indexed symbol'), expect.stringContaining('existing business node'),
    ]));
    checkProofs(snapshot);
    const graph = new RdfEvidenceGraph(snapshot);
    expect(await graph.validate()).toEqual({ conforms: true, issues: [] });
    expect(await graph.facts()).toEqual(snapshot.facts);
    const rows = await graph.select(`SELECT ?citation WHERE { ?binding <${CG}bindingDefinition> ?citation;
      <http://www.w3.org/1999/02/22-rdf-syntax-ns#object> <${nodeIri(implementation.object.id)}> }`);
    expect(rows.rows).toHaveLength(3);
  });

  it('exposes the same citations and authority through agent neighborhoods, paths, impact and viewer', async () => {
    const mapping = bindings(snapshot).find(f => f.predicate === 'implementedBy')!;
    const snapshotId = snapshot.manifest.snapshotId;
    const page = await handleGraphNeighbors(f.app.explorationService, { snapshotId, nodeId: mapping.subject.id, maxFacts: 200 });
    expect(page.facts).toContainEqual(mapping);
    expect(page.markdown).toContain('explicit mapping declaration');
    expect(page.markdown).toContain('src/large.ts:1:');
    expect(page.markdown).toContain('not proof of fulfillment or test execution');
    const paths = await f.app.pathService.paths({ snapshotId, fromNodeId: mapping.subject.id,
      toNodeId: mapping.object.id, direction: 'outgoing', predicates: ['implementedBy'] });
    expect(paths.facts).toContainEqual(mapping);
    const pack = await f.app.queryService.scan({ snapshotId, changedFiles: ['src/large.ts'], maxFacts: 200 });
    expect(pack.facts).toContainEqual(mapping);
    const html = renderContextPackHtml(pack, 'https://example.test/{commit}/{path}#L{line}');
    expect(html).toContain('explicit mapping declaration');
    expect(html).toContain('src/large.ts:1:');
    expect(html).toContain(`https://example.test/${snapshot.manifest.commitSha}/src/large.ts#L1`);
  });

  it('rejects forged proof provenance, missing definitions and promotion of unreviewed evidence', async () => {
    const mapping = bindings(snapshot).find(f => f.predicate === 'implementedBy')!;
    for (const mutate of [
      (fact: any) => { fact.codeBinding.definitions[0].provenance.digest = 'changed'; },
      (fact: any) => { fact.codeBinding.definitions = []; },
      (fact: any) => { fact.codeBinding.selectedOccurrences[0].factId = 'missing'; },
      (fact: any) => { fact.codeBinding.subjectEvidence[0].extractionReview = 'approved'; },
      (fact: any) => { fact.extractionReview = 'deterministic'; },
      (fact: any) => { fact.authority = 'declared'; },
      (fact: any) => { fact.codeBinding.selector.line = -1; },
    ]) {
      const bad = structuredClone(mapping); mutate(bad);
      const graph = new RdfEvidenceGraph({ ...snapshot, facts: snapshot.facts.map(f => f.id === mapping.id ? bad : f) });
      expect((await graph.validate()).conforms).toBe(false);
    }
  });

  it('matches named-dataset SHACL verdicts and rejects stale source/index provenance', async () => {
    for (const valid of [true, false]) {
      const facts = structuredClone(snapshot.facts) as GraphFact[];
      if (!valid) (facts.find(f => f.codeBinding)!.codeBinding as any).definitions = [];
      const graph = new RdfEvidenceGraph({ ...snapshot, facts });
      const named = new Store(new Parser({ format: 'N-Quads' }).parse(await graph.serialize()));
      expect((await new SHACLValidator(new Store(evidenceShapes)).validate(named)).conforms).toBe(valid);
      expect((await graph.validate()).conforms).toBe(valid);
    }
    const context = { repositoryRoot: f.root, repositoryId: f.app.config.repositoryId, ref: 'HEAD',
      commitSha: snapshot.manifest.commitSha, snapshotId: snapshot.manifest.snapshotId,
      changedPaths: [], deletedPaths: [], renamedPaths: {} };
    const content = bindingFiles['docs/links.md'];
    const source = { path: 'docs/links.md', content, digest: sha256(content), stableSemanticId: 'document:docs/links.md', metadata: {} };
    const badSource = await extractDocumentCodeBindings(f.app.repository, context, [{ ...source, content: content + 'changed' }], snapshot.facts, snapshot.facts);
    expect(badSource.facts).toHaveLength(0);
    expect(badSource.diagnostics.every(d => d.reason.includes('committed source bytes'))).toBe(true);
    const stale = snapshot.facts.map(fact => fact.provenance.path === 'src/large.ts'
      ? { ...fact, provenance: { ...fact.provenance, digest: 'old-digest' } } : fact);
    const staleTargets = await extractDocumentCodeBindings(f.app.repository, context, [source], stale, snapshot.facts);
    expect(staleTargets.facts.some(f => ['normalize', 'publicAlias'].includes(f.codeBinding!.selector.symbol))).toBe(false);
    expect(staleTargets.diagnostics.some(d => d.reason.includes('Indexed definition'))).toBe(true);
    const target = bindings(snapshot).find(f => f.codeBinding!.selector.symbol === 'publicAlias')!.object.id;
    const withoutDefinitions = snapshot.facts.filter(f => !(f.codeOccurrence?.role === 'definition' && f.subject.id === target));
    const missing = await extractDocumentCodeBindings(f.app.repository, context, [source], withoutDefinitions, snapshot.facts);
    expect(missing.facts.some(f => f.codeBinding!.selector.symbol === 'publicAlias')).toBe(false);
    expect(missing.diagnostics.some(d => d.reason.includes('no indexed definition'))).toBe(true);
    const subjectFact = snapshot.facts.find(f => !f.codeBinding && f.object.id === 'invariant:max-age')!;
    const excessive = await extractDocumentCodeBindings(f.app.repository, context, [source], snapshot.facts,
      Array.from({ length: 101 }, (_, i) => ({ ...subjectFact, id: `proof-${i}` })));
    expect(excessive.facts.some(f => f.subject.id === 'invariant:max-age')).toBe(false);
    expect(excessive.diagnostics.some(d => d.reason.includes('at most 100'))).toBe(true);
  });

  it('reuses semantic artifacts and bindings on unchanged hydration and clean comparison', async () => {
    const calls = await readFile(join(f.root, 'provider-calls.log'), 'utf8');
    const repeat = await f.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeat).toMatchObject({ semanticExtracted: 0, semanticReused: 2 });
    expect(repeat.snapshot.manifest.contentDigest).toBe(snapshot.manifest.contentDigest);
    expect(repeat.snapshot.manifest.snapshotId).toBe(snapshot.manifest.snapshotId);
    const clean = await f.app.hydrator.compareClean({ ref: 'HEAD', headName: 'default' });
    const omit = (s: GraphSnapshot) => bindings(s).map(({ snapshotId: _id, ...fact }) => fact);
    expect(omit(clean.snapshot)).toEqual(omit(snapshot));
    expect(await readFile(join(f.root, 'provider-calls.log'), 'utf8')).toBe(calls);
  }, 60_000);

  it('regenerates draft bindings and invalidates edits/deletions/renames without model calls or altering saved evidence', async () => {
    const calls = await readFile(join(f.root, 'provider-calls.log'), 'utf8');
    await writeFile(join(f.root, 'src/large.ts'), '// new draft line\n' + bindingFiles['src/large.ts']);
    await rename(join(f.root, 'src/consumer.ts'), join(f.root, 'src/renamed.ts'));
    await rm(join(f.root, 'src/unrelated.ts'));
    await writeFile(join(f.root, 'docs/links.md'), bindingFiles['docs/links.md'].replace('../src/consumer.ts', '../src/renamed.ts'));
    const mapping = bindings(snapshot).find(f => f.predicate === 'implementedBy')!;
    const saved = await f.app.explorationService.neighbors({ snapshotId: snapshot.manifest.snapshotId, nodeId: mapping.object.id });
    expect(saved.evidenceState?.excludedWorkingChanges).toContain('src/large.ts');
    const overlay = await buildWorkingOverlay(f.app.repository, f.app.config, f.app.snapshotStore, f.app.storageRoot, snapshot.manifest.snapshotId);
    checkProofs(overlay);
    expect(bindings(overlay).find(f => f.subject.id === 'contract:file:src/declarations.d.ts')!.codeBinding!.subjectEvidence)
      .toEqual([expect.objectContaining({ authority: 'draft' })]);
    expect(bindings(overlay).every(f => f.authority === 'draft' && f.sourceAuthority === 'draft')).toBe(true);
    expect(bindings(overlay).find(f => f.predicate === 'implementedBy')!.codeBinding!.definitions[0]!.provenance)
      .toMatchObject({ startLine: 2, commitSha: snapshot.manifest.commitSha });
    expect(bindings(overlay).some(f => f.codeBinding!.selector.path === 'src/renamed.ts')).toBe(true);
    expect(bindings(overlay).some(f => f.codeBinding!.selector.path === 'src/unrelated.ts')).toBe(false);
    expect(overlay.diagnostics?.some(d => d.reason.includes('not a regular committed file'))).toBe(true);
    expect(await new RdfEvidenceGraph(overlay).validate()).toEqual({ conforms: true, issues: [] });
    await writeFile(join(f.root, 'docs/rules.md'), '# Rule withdrawn pending review\n');
    const invalidated = await buildWorkingOverlay(f.app.repository, f.app.config, f.app.snapshotStore, f.app.storageRoot, snapshot.manifest.snapshotId);
    expect(bindings(invalidated).some(f => f.subject.id === 'invariant:max-age')).toBe(false);
    expect(bindings(invalidated).some(f => f.subject.id === 'contract:file:src/declarations.d.ts')).toBe(true);
    expect(await f.app.snapshotStore.read(snapshot.manifest.snapshotId)).toEqual(snapshot);
    expect(await readFile(join(f.root, 'provider-calls.log'), 'utf8')).toBe(calls);
    await f.commit();
    const committed = (await f.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).snapshot;
    checkProofs(committed);
    expect(committed.manifest.commitSha).not.toBe(snapshot.manifest.commitSha);
    expect(bindings(committed).some(f => f.codeBinding!.selector.path === 'src/renamed.ts')).toBe(true);
    expect(bindings(committed).some(f => f.codeBinding!.selector.path === 'src/unrelated.ts' || f.subject.id === 'invariant:max-age')).toBe(false);
    expect(await f.app.snapshotStore.read(snapshot.manifest.snapshotId)).toEqual(snapshot);
  }, 60_000);
});


it('keeps traversal-selected validation sources outside semantic intent extraction while resolving explicit test links', async () => {
  const f = await symbolBindingFixture();
  try {
    await writeFile(join(f.root, 'docs/rules.md'), bindingFiles['docs/rules.md'] + '[Links](links.md) [Validation](validation.md)\n');
    await writeFile(join(f.root, 'docs/validation.md'), '[Test](../test/mock.spec.ts#weftlet-symbol=check "weftlet:verifiedBy invariant:max-age")\n' +
      '[Invalid intent](../src/large.ts#weftlet-symbol=normalize "weftlet:implementedBy invariant:max-age")\n');
    await f.commit();
    await writeFile(f.configPath, JSON.stringify({ ...f.app.config, documentTraversal: {
      entryPoints: ['docs/rules.md'], roots: ['docs'], policy: { schemaVersion: 1,
        roles: [{ id: 'validation', pattern: 'docs/validation.md', role: 'validation' }],
        owners: [{ id: 'rule-owner', pattern: 'docs/**', ownerDocument: 'docs/rules.md' }],
      },
    } }));
    const app = await createContextGraphApplication(f.configPath);
    const { snapshot } = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    const validation = bindings(snapshot).filter(f => f.provenance.path === 'docs/validation.md');
    expect(validation).toHaveLength(1);
    expect(validation[0]).toMatchObject({ predicate: 'verifiedBy', sourceRole: 'validation', authority: 'inferred', extractionReview: 'unreviewed' });
    expect(snapshot.diagnostics?.some(d => d.reason.includes('validation document cannot'))).toBe(true);
    expect(await readFile(join(f.root, 'provider-calls.log'), 'utf8')).not.toContain('validation.md');
    expect(await new RdfEvidenceGraph(snapshot).validate()).toEqual({ conforms: true, issues: [] });
  } finally { await rm(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
}, 60_000);
