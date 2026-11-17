import { expect, it } from 'vitest';
import { storageStudy } from '../scripts/storage-study/profile.js';

it('profiles real indexed and strictly validated public evidence without changing saved bytes', async () => {
  const study = await storageStudy(2, 20);
  expect(study.corpus.facts).toBeGreaterThan(500);
  expect(study.corpus.semanticExtracted).toBe(18);
  expect(study.measurements.sections.facts!.records).toBe(study.corpus.facts);
  expect(study.measurements.unprofiledRootFields).toEqual([]);
  expect(study.measurements.repetition.entities.repeatedOccurrences).toBeGreaterThan(0);
  expect(study.checks).toEqual({ realScip: true, strictHydrationPassed: true, savedSnapshotReadable: true,
    inventoryAndSnapshotPreserved: true, externalModelCalls: 0 });
}, 120_000);
