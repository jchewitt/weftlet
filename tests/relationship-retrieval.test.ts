import { rm } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { relationshipRetrievalProject } from './fixtures/relationship-retrieval-project.js';
import { measureRetrieval, referencesTypeScriptLibrary } from '../scripts/retrieval-study/run.js';
import { evidenceBytes } from '../scripts/retrieval-study/preservation.js';

it('retrieves specific caller/worker relationships from real extraction at the unchanged three-page budget', async () => {
  const fixture = await relationshipRetrievalProject();
  try {
    // Publication requires full strict SHACL. This uses actual SCIP/call extraction
    // and deterministic cited public prose, with no paid/model dependency.
    const hydrated = await fixture.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(hydrated.semanticExtracted).toBe(3);
    const snapshot = await fixture.app.snapshotStore.read(hydrated.snapshot.manifest.snapshotId);
    expect(snapshot).toBeDefined();
    expect(snapshot!.facts.some(referencesTypeScriptLibrary)).toBe(true);
    const before = await evidenceBytes(fixture.app.storageRoot);
    expect(Object.keys(before).filter(path => path.startsWith('artifacts/semantic/'))).toHaveLength(3);
    const measured = await measureRetrieval(snapshot!, fixture.app.queryService);
    expect(measured.returnedAssertions).toBe(540);
    expect(measured.expectedRelationships).toBe(36);
    expect(measured.retrievedRelationships).toBe(36);
    expect(measured.cases.flatMap(item => item.sourceFiles).every(file => file.returned)).toBe(true);
    for (const item of measured.cases) {
      expect(item.relationships.every(relation => relation.inSnapshot > 0)).toBe(true);
      expect(item.pages.every(page => page.reachableFacts! > 180 && page.truncated)).toBe(true);
    }
    expect(measured.typeScriptLibraryAssertions).toBeLessThan(450);
    // Query repetition is byte-preserving and has deterministic page boundaries.
    expect(await measureRetrieval(snapshot!, fixture.app.queryService)).toEqual(measured);
    const libraryFact = snapshot!.facts.find(referencesTypeScriptLibrary)!;
    const library = [libraryFact.subject, libraryFact.object].find(node =>
      node.codeSymbol?.resolution === 'no-indexed-definition');
    expect(library).toBeDefined();
    const explicit = await fixture.app.queryService.scan({ snapshotId: snapshot!.manifest.snapshotId,
      symbols: [library!.id], maxDepth: 3, maxFacts: 60 });
    expect(explicit.facts.some(referencesTypeScriptLibrary)).toBe(true);
    expect(await evidenceBytes(fixture.app.storageRoot)).toEqual(before);
    expect((await fixture.app.snapshotStore.readHead('default'))!.manifest).toEqual(snapshot!.manifest);
  } finally { await rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}, 240_000);
