// Dev-only fixture preparation: actual committed public traversal, offline Codex parsing and real SCIP.
import { rm, writeFile } from 'node:fs/promises';
import { traversalApplication, traversalFixture } from '../../tests/fixtures/traversal.js';

const fixture = await traversalFixture();
try {
  const app = traversalApplication(fixture, { ...fixture.config, storageScope: 'workspace' }, true);
  const first = await app.hydrate();
  const repeat = await app.hydrate();
  if (first.semanticExtracted !== 6 || repeat.semanticExtracted !== 0 || repeat.semanticReused !== 6 ||
      first.snapshot.manifest.contentDigest !== repeat.snapshot.manifest.contentDigest) {
    throw new Error('Public extraction/reuse did not produce the expected fixture');
  }
  await writeFile(process.argv[2]!, JSON.stringify(first.snapshot));
} finally {
  await rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
