import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stableJsonDigest } from '@weftlet/core';
import { indirectRetrievalFiles, indirectRetrievalProject } from '../../tests/fixtures/indirect-retrieval-project.js';
import { createContextGraphApplication } from '../../src/application/application.js';
import { evidenceBytes } from '../retrieval-study/preservation.js';
import { measureIndirectRetrieval } from './measure.js';

const [destination, option, savedRoot] = process.argv.slice(2);
if (!destination || (option && !['--retain', '--saved-public-root'].includes(option)) ||
    (option === '--saved-public-root' && !savedRoot)) {
  throw Error('Usage: tsx scripts/indirect-retrieval-study/run.ts <report.json> [--retain | --saved-public-root <root>]');
}
const fresh = option === '--saved-public-root' ? undefined : await indirectRetrievalProject();
const root = fresh?.root ?? savedRoot!;
try {
  const expected = await indirectRetrievalFiles();
  const actual: Record<string, string> = {};
  for (const path of Object.keys(expected)) actual[path] = await readFile(join(root, path), 'utf8');
  assert.deepEqual(actual, expected, 'Only the frozen public source corpus can be measured');
  const app = fresh?.app ?? await createContextGraphApplication(join(root, 'context-graph.config.json'));
  if (fresh) {
    const hydration = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    assert.equal(hydration.semanticExtracted, 0);
  }
  const before = await evidenceBytes(app.storageRoot);
  const snapshot = await app.snapshotStore.readHead('default');
  assert(snapshot);
  const measured = await measureIndirectRetrieval(snapshot, app.queryService);
  assert.deepEqual(await evidenceBytes(app.storageRoot), before);
  const report = { fixtureDigest: stableJsonDigest(actual), ...measured,
    preservation: { checkedFiles: Object.keys(before).length, byteInventoryDigest: stableJsonDigest(before), unchanged: true },
    hydrated: Boolean(fresh), modelCalls: 0 };
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, targets: report.targets.map(({ fact: _, ...target }) => target), returnedFactIds: '(recorded)' }));
} finally {
  if (fresh && option === '--retain') await writeFile(destination + '.fixture-root', root);
  else if (fresh) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
