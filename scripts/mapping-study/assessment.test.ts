import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, expect, it } from 'vitest';
import { assessMappings } from './assessment.js';
import { readMappingInputs } from './protocol.js';

const inputs = fileURLToPath(new URL('../../evaluations/mapping-gaps', import.meta.url));
let report: Awaited<ReturnType<typeof assessMappings>>;
beforeAll(async () => { report = await assessMappings(inputs); }, 90_000);

it('classifies independently frozen cases from actual extraction and agent queries', () => {
  expect(report.passed).toBe(true);
  expect(report.summary).toEqual({ cases: 10, matchingStates: 10, forbiddenMappings: 0,
    missedDirectMappings: 0, exhaustedNeighborhoodBudgets: 0 });
  expect(report.cold.semanticExtracted).toBe(8);
  expect(report.repeat).toMatchObject({ semanticExtracted: 0, semanticReused: 8, stableIdentityAndContent: true });
  expect(report.provider.modelCalls).toBe(0);
  const byId = (id: string) => report.cases.find(c => c.id === id)!;
  expect(byId('ambiguous-selector').targetIds).toHaveLength(2);
  expect(byId('excluded-from-index').targetIds).toHaveLength(0);
  expect(byId('undocumented-code')).toMatchObject({ rulePresent: false, observed: 'intent-absent' });
  expect(byId('file-only-with-misleading-name').fileClaims).toHaveLength(1);
  expect(byId('co-located-document-reference').documentReferences).toHaveLength(1);
  expect(byId('file-only-with-misleading-name').mappings).toEqual([]);
  expect(byId('co-located-document-reference').mappings).toEqual([]);
});

it('retains declaration, test and approval limits with exact document/code provenance', () => {
  const bindings = report.cases.flatMap(c => c.mappings);
  expect(bindings).toHaveLength(3);
  for (const binding of bindings) {
    expect(binding).toMatchObject({ authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed' });
    expect(binding.codeBinding!.documentCitations.length).toBeGreaterThan(0);
    expect(binding.codeBinding!.definitions.length).toBeGreaterThan(0);
    for (const proof of binding.codeBinding!.definitions) {
      expect(proof.provenance).toMatchObject({ commitSha: report.manifest.commitSha });
      expect(proof.provenance.digest).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(binding.codeBinding!.subjectEvidence.every(p => p.extractionReview === 'unreviewed')).toBe(true);
  }
  expect(report.cases.find(c => c.id === 'declaration-only')!.mappings[0]!.object.codeSymbol!.resolution).toBe('declaration-only');
  expect(report.cases.find(c => c.id === 'explicit-test-declaration')!.mappings[0]!.predicate).toBe('verifiedBy');
});

it('rejects modified and escaping inputs before any copied provider can execute', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mapping-input-negative-'));
  try {
    await cp(inputs, root, { recursive: true });
    await writeFile(join(root, 'project/provider.mjs'), 'throw new Error("must not execute");\n');
    await expect(readMappingInputs(root)).rejects.toThrow('input changed');
    const lockPath = join(root, 'inputs.lock.json');
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    lock.inputs[0].path = '../outside';
    await writeFile(lockPath, JSON.stringify(lock));
    await expect(readMappingInputs(root)).rejects.toThrow('Unsafe');
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
