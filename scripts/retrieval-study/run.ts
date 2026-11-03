import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GraphFact, GraphSnapshot, ImpactQueryService } from '@weftlet/core';
import { stableJsonDigest } from '@weftlet/core';
import { relationshipRetrievalProject, relationshipRetrievalFiles, relationshipExpectations, retrievalBudget } from '../../tests/fixtures/relationship-retrieval-project.js';
import { createContextGraphApplication } from '../../src/application/application.js';
import { evidenceBytes } from './preservation.js';

// The metric recognizes actual TypeScript lib declarations, not every missing
// definition, dependency or similarly named repository symbol.
export function referencesTypeScriptLibrary(fact: GraphFact): boolean {
  return [fact.subject, fact.object].some(node => {
    const descriptor = node.codeSymbol;
    if (descriptor?.provider !== 'scip-typescript') return false;
    const parts = descriptor.nativeSymbol.replaceAll('`', '').split(' ');
    return parts[0] === 'scip-typescript' && parts[1] === 'npm' && parts[2] === 'typescript' &&
      /^(?:lib\/)?lib\.[^/]+\.d\.ts\//.test(parts.slice(4).join(' '));
  });
}

export function matchesExpectedCall(fact: GraphFact, expected: { path: string; caller: string; callee: string }): boolean {
  return fact.predicate === 'calls' && fact.codeCall?.target === 'indexed-body' &&
    fact.provenance.path === expected.path && fact.subject.label === expected.caller && fact.object.label === expected.callee;
}

/** Distinguish exact callsite references and file-level legacy consumers. Neither
 * a queue-name reference nor an arbitrary assertion from this file is a witness. */
function expectedRelationships(snapshot: GraphSnapshot, expected: { path: string; caller: string; callee: string }) {
  const calls = snapshot.facts.filter(fact => matchesExpectedCall(fact, expected));
  const occurrences = new Set(calls.flatMap(fact => fact.codeCall!.targetOccurrences.map(proof => proof.factId)));
  const nativeSymbols = new Set(calls.map(fact => fact.object.codeSymbol!.nativeSymbol));
  return [
    { predicate: 'calls', witnesses: calls },
    { predicate: 'references', witnesses: snapshot.facts.filter(fact => fact.predicate === 'references' && occurrences.has(fact.id)) },
    { predicate: 'consumes', witnesses: snapshot.facts.filter(fact => fact.predicate === 'consumes' &&
      fact.provenance.path === expected.path && fact.object.id.startsWith('symbol:scip:') && nativeSymbols.has(fact.object.label)) },
  ];
}

export async function measureRetrieval(snapshot: GraphSnapshot, query: ImpactQueryService) {
  const cases = [];
  const savedFacts = new Map(snapshot.facts.map(fact => [fact.id, fact]));
  for (const item of relationshipExpectations) {
    const request = { snapshotId: snapshot.manifest.snapshotId, changedFiles: item.changedFiles,
      task: `Assess downstream ${item.domain} producer and worker behavior`,
      maxFacts: retrievalBudget.maxFacts, maxDepth: retrievalBudget.maxDepth };
    const returned: GraphFact[] = [];
    let continuation: string | undefined;
    const pages = [];
    for (let page = 0; page < retrievalBudget.maxPages; page++) {
      const result = await query.scan({ ...request, ...(continuation ? { continuation } : {}) });
      assert.equal(result.facts.length, retrievalBudget.maxFacts, 'Do not shrink the fixed returned-assertion denominator');
      returned.push(...result.facts);
      pages.push({ returned: result.facts.length, rankingVersion: result.exploration?.rankingVersion,
        reachableFacts: result.exploration?.reachableFacts, depthLimitReached: result.exploration?.depthLimitReached,
        truncated: result.exploration?.truncated });
      continuation = result.exploration?.continuation;
      assert(continuation, 'Public corpus must retain more evidence than the fixed three-page budget');
    }
    assert.equal(new Set(returned.map(fact => fact.id)).size, returned.length);
    for (const fact of returned) assert.deepEqual(fact, savedFacts.get(fact.id));
    cases.push({ domain: item.domain, pages, returnedAssertions: returned.length, returnedFactIds: returned.map(fact => fact.id),
      typeScriptLibraryAssertions: returned.filter(referencesTypeScriptLibrary).length,
      sourceFiles: item.files.map(path => ({ path, returned: returned.some(fact => fact.provenance.path === path) })),
      relationships: item.calls.flatMap(expected => expectedRelationships(snapshot, expected).map(({ predicate, witnesses: inSnapshot }) => {
        const ids = new Set(inSnapshot.map(fact => fact.id));
        const ordinal = returned.findIndex(fact => ids.has(fact.id));
        return { ...expected, predicate, inSnapshot: inSnapshot.length, returned: ordinal >= 0,
          firstPage: ordinal < 0 ? null : Math.floor(ordinal / retrievalBudget.maxFacts) + 1,
          witnesses: inSnapshot.map(fact => ({ id: fact.id, subject: fact.subject.id, predicate: fact.predicate,
            object: fact.object.id, provenance: fact.provenance, authority: fact.authority,
            extractionReview: fact.extractionReview, codeCall: fact.codeCall, codeOccurrence: fact.codeOccurrence })) };
      })),
    });
  }
  return { budget: retrievalBudget, cases,
    returnedAssertions: cases.reduce((sum, item) => sum + item.returnedAssertions, 0),
    typeScriptLibraryAssertions: cases.reduce((sum, item) => sum + item.typeScriptLibraryAssertions, 0),
    expectedRelationships: cases.reduce((sum, item) => sum + item.relationships.length, 0),
    retrievedRelationships: cases.reduce((sum, item) => sum + item.relationships.filter(r => r.returned).length, 0) };
}

async function rescorePublicFixture(baselinePath: string, destination: string) {
  const previous = JSON.parse(await readFile(baselinePath, 'utf8'));
  const root = (await readFile(baselinePath + '.fixture-root', 'utf8')).trim();
  const files: Record<string, string> = {};
  for (const path of [...Object.keys(relationshipRetrievalFiles()), 'context-graph.config.json']) {
    files[path] = await readFile(join(root, path), 'utf8');
  }
  assert.equal(stableJsonDigest(files), previous.fixtureDigest, 'Public fixture source changed');
  const app = await createContextGraphApplication(join(root, 'context-graph.config.json'));
  assert.equal(app.config.repositoryId, 'public/relationship-retrieval');
  const before = await evidenceBytes(app.storageRoot);
  const snapshot = await app.snapshotStore.readHead('default');
  assert(snapshot);
  assert.equal(snapshot.manifest.contentDigest, previous.snapshotDigest);
  assert.equal(snapshot.facts.length, previous.factCount);
  const measured = await measureRetrieval(snapshot, app.queryService);
  assert.deepEqual(measured.budget, previous.budget);
  assert.deepEqual(measured.cases.map(item => item.pages.map(page => page.reachableFacts)),
    previous.cases.map((item: { pages: { reachableFacts: number }[] }) => item.pages.map(page => page.reachableFacts)));
  assert.deepEqual(await evidenceBytes(app.storageRoot), before);
  const report = { ...previous, ...measured, preservation: {
    checkedFiles: Object.keys(before).length, byteInventoryDigest: stableJsonDigest(before),
    unchanged: true, hydrationDuringComparison: false, modelCallsDuringComparison: 0 } };
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ returned: report.returnedAssertions, retrieved: report.retrievedRelationships,
    expected: report.expectedRelationships, library: report.typeScriptLibraryAssertions, preservation: report.preservation }));
}

async function main() {
  const destination = process.argv[2];
  if (!destination) throw Error('Usage: tsx scripts/retrieval-study/run.ts <public-result.json> [--retain-public-fixture | --rescore <baseline.json>]');
  if (process.argv[3] === '--rescore') {
    if (!process.argv[4]) throw Error('--rescore requires the baseline JSON with its .fixture-root sidecar');
    await rescorePublicFixture(process.argv[4], destination);
    return;
  }
  if (process.argv[3] && process.argv[3] !== '--retain-public-fixture') throw Error('Unknown retrieval-study option');
  const fixture = await relationshipRetrievalProject();
  try {
    const hydrated = await fixture.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    const snapshot = await fixture.app.snapshotStore.read(hydrated.snapshot.manifest.snapshotId);
    assert(snapshot);
    const report = { schemaVersion: 1, status: 'public-fixed-budget-relationship-retrieval',
      fixtureDigest: stableJsonDigest(fixture.files), snapshotDigest: snapshot.manifest.contentDigest,
      factCount: snapshot.facts.length, extractorVersions: snapshot.manifest.extractorVersions,
      semanticExtracted: hydrated.semanticExtracted, liveModelCalls: 0,
      unindexedSymbolExamples: [...new Set(snapshot.facts.flatMap(f => [f.subject, f.object])
        .filter(n => n.codeSymbol?.resolution === 'no-indexed-definition').map(n => n.codeSymbol!.nativeSymbol))].slice(0, 8),
      ...await measureRetrieval(snapshot, fixture.app.queryService) };
    await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ ...report, cases: report.cases.map(({ relationships, ...item }) => ({ ...item,
      relationships: relationships.map(({ witnesses: _, ...relationship }) => relationship) })) }));
  } finally {
    if (process.argv[3] === '--retain-public-fixture') await writeFile(destination + '.fixture-root', fixture.root);
    else await rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
