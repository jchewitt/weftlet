import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GraphSnapshot, MappingProposalArtifact, MappingProposalProvider } from '@weftlet/core';
import { mappingProject } from './fixtures/mapping-project.js';
import { prepareMappingProposal } from '../src/extraction/mapping-plan.js';
import { validateMappingOutput } from '../src/extraction/mapping-output.js';
import { MappingProposalService } from '../src/application/mapping-proposals.js';
import { mappingProviderIdentity } from '../src/extraction/mapping-provider.js';
import { requiredSnapshotExtractorVersions } from '../src/application/extraction-identity.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';
import { FileMappingProposalStore } from '../src/storage/mapping-proposals.js';
import { runMappingsCommand, handleMappingTool } from '../src/interfaces/mapping-proposals.js';

describe('opt-in mapping proposals using actual committed extraction and SCIP', () => {
  let f: Awaited<ReturnType<typeof mappingProject>>;
  beforeAll(async () => { f = await mappingProject(); }, 90_000);
  afterAll(async () => { if (f) await rm(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });
  const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
  const settings = (provider: () => MappingProposalProvider, timeoutMs = 1000) => ({ provider, timeoutMs,
    repositoryId: f.config.repositoryId, configurationDigest: sha256(stableJson(f.app.config)),
    providerIdentity: mappingProviderIdentity(f.app.config.semantic), expectedExtractors: requiredSnapshotExtractorVersions(f.app.config) });
  const output = (plan: Awaited<ReturnType<typeof prepareMappingProposal>>['plan']) => {
    const candidate = plan.candidates.find(c => c.node.label === 'acceptObservation')!;
    return { decision: 'proposed', reason: 'Deterministic transport control', proposals: [{ symbolId: candidate.node.id,
      rationale: 'Rejects ages above sixty seconds.', confidence: 0.8, documentCitation: { startLine: 1, endLine: 1 },
      codeCitation: { startLine: candidate.body.startLine, endLine: candidate.body.endLine } }] };
  };
  it('previews complete candidates with both revisions and preserves source/assertion authority', async () => {
    const plan = await f.app.mappingProposalService.plan(f.request);
    expect(plan.issues).toEqual([]); expect(plan.ready).toBe(true); expect(plan.expectedModelRequests).toBe(1);
    expect(plan.candidates.map(c => c.node.label).sort()).toEqual(['acceptObservation', 'checkFreshness', 'retention']);
    expect(plan.subjectEvidence.every(fact => fact.sourceAuthority === 'declared' && fact.extractionReview === 'unreviewed' && fact.authority === 'inferred')).toBe(true);
    expect(plan.candidates.every(c => c.body.commitSha === f.snapshot.manifest.commitSha && c.definitions.every(d => d.provenance.digest === c.body.digest))).toBe(true);
    expect(plan.evidenceState?.eligibleForCurrentDiffValidation).toBe(false);
    expect(plan).toEqual(await handleMappingTool(f.app.mappingProposalService, 'mapping.plan', f.request));
  });
  it('blocks budgets, unlinked/cross-domain files, missing intent, declaration-only and omitted sources without model calls', async () => {
    const cases = [
      [{ maxCandidates: 1 }, 'candidate-budget-exceeded'], [{ maxInputBytes: 1 }, 'input-budget-exceeded'],
      [{ files: ['src/foreign.ts'] }, 'file-not-linked-from-selected-rule-or-document'],
      [{ ruleId: 'invariant:missing' }, 'approved-intent-source-required'],
      [{ ruleId: 'invariant:ambient', documentPath: 'docs/ambient.md', files: ['src/ambient.d.ts'] }, 'no-indexed-implementation-candidates'],
      [{ ruleId: 'invariant:omitted', documentPath: 'docs/omitted.md', files: ['src/omitted.ts'] }, 'file-not-observed-in-index'],
      [{ ruleId: 'invariant:test', documentPath: 'docs/test.md', files: ['src/mock.spec.ts'] }, 'validation-code-is-not-implementation'],
    ] as const;
    for (const [change, code] of cases) {
      const plan = await f.app.mappingProposalService.plan({ ...f.request, ...change });
      expect(plan.ready).toBe(false); expect(plan.issues.map(i => i.code)).toContain(code); expect(plan.expectedModelRequests).toBe(0);
    }
    await expect(f.app.mappingProposalService.propose(f.request)).rejects.toThrow('allowModel');
    const bounded = await f.app.mappingProposalService.plan({ ...f.request, maxCandidates: 1 });
    expect(bounded.candidateEnumeration).toEqual({ complete: false, observed: 3, returned: 1 });
  });
  it('rejects invalid identities, citations, duplicate targets and authority injection; permits explicit abstention', async () => {
    const { plan } = await prepareMappingProposal(f.app.repository, f.snapshot, f.request), valid = output(plan);
    expect(validateMappingOutput(valid, plan)).toEqual(valid);
    for (const bad of [ { ...valid, authority: 'declared' }, { ...valid, proposals: [valid.proposals[0], valid.proposals[0]] },
      { ...valid, proposals: [{ ...valid.proposals[0], symbolId: 'code:invented' }] },
      { ...valid, proposals: [{ ...valid.proposals[0], documentCitation: { startLine: 3, endLine: 3 } }] },
      { ...valid, proposals: [{ ...valid.proposals[0], codeCitation: { startLine: 99, endLine: 99 } }] },
      { ...valid, decision: 'abstained' }, { ...valid, proposals: [] },
    ]) expect(() => validateMappingOutput(bad, plan)).toThrow('Invalid mapping');
    expect(validateMappingOutput({ decision: 'abstained', reason: 'Insufficient evidence', proposals: [] }, plan).decision).toBe('abstained');
  });
  it('saves and reuses isolated proposals without adding graph facts or touching heads, even when provider is unavailable', async () => {
    const original = plain(await f.app.snapshotStore.readHead('default'));
    const first = await f.app.mappingProposalService.propose(f.request, { allowModel: true });
    expect(first.artifact.output.proposals).toHaveLength(1); expect(first.reused).toBe(false);
    expect(first.artifact).toMatchObject({ authority: 'inferred', extractionReview: 'unreviewed', establishesCompliance: false });
    const factory = vi.fn(() => { throw Error('PRIVATE provider unavailable'); });
    const service = new MappingProposalService(f.app.repository, f.app.snapshotStore, new FileMappingProposalStore(f.app.storageRoot), settings(factory, 600_000));
    await writeFile(join(f.root, 'src/observations.ts'), '// dirty checkout; must not enter proposal input\n');
    try {
      const repeat = await service.propose(f.request);
      expect(repeat.reused).toBe(true); expect(repeat.artifact).toEqual(first.artifact);
      expect(repeat.evidenceState?.excludedWorkingChanges).toContain('src/observations.ts'); expect(factory).not.toHaveBeenCalled();
      expect(plain(await f.app.snapshotStore.readHead('default'))).toEqual(original);
      const read = await service.read(f.request.snapshotId, first.artifact.key);
      expect(read).toEqual(await handleMappingTool(service, 'mapping.proposals', { snapshotId: f.request.snapshotId, key: first.artifact.key }));
      await writeFile(join(f.root, 'request.json'), JSON.stringify(f.request));
      const cli = await runMappingsCommand(service, ['propose', '--request', join(f.root, 'request.json'), '--quiet']);
      expect(cli).toEqual(read);
    } finally { await writeFile(join(f.root, 'src/observations.ts'), await f.app.repository.readFileAt(f.snapshot.manifest.commitSha, 'src/observations.ts')); }
  });
  it('sanitizes failures, cancels or times out ignoring providers, and never publishes invalid or late results', async () => {
    const saved: MappingProposalArtifact[] = [], store = { read: async () => undefined, write: async (a: MappingProposalArtifact) => { saved.push(a); } };
    for (const mode of ['failure', 'invalid', 'timeout', 'cancel'] as const) {
      const controller = new AbortController();
      const provider: MappingProposalProvider = { identity: settings(() => provider).providerIdentity, async propose() {
        if (mode === 'failure') throw Error('PRIVATE prompt, credentials');
        if (mode === 'invalid') return { authority: 'approved' };
        if (mode === 'cancel') controller.abort();
        return new Promise(() => {});
      } };
      const service = new MappingProposalService(f.app.repository, f.app.snapshotStore, store, settings(() => provider, 20));
      try { await service.propose(f.request, { allowModel: true, signal: controller.signal }); throw Error('Expected failure'); }
      catch (e) { expect(String(e)).not.toContain('PRIVATE'); expect(String(e)).toContain(mode === 'failure' ? 'failed' : mode === 'invalid' ? 'invalid-output' : mode === 'cancel' ? 'cancelled' : 'timeout'); }
    }
    expect(saved).toEqual([]);
  });
  it('keeps missing authority, recorded ownership gaps, contradictions and stale source proofs out of inference', async () => {
    const altered = (transform: (snapshot: GraphSnapshot) => GraphSnapshot) => prepareMappingProposal(f.app.repository, transform(f.snapshot), f.request);
    for (const field of [{ sourceAuthority: 'inferred' as const }, { sourceRole: 'validation' as const },
      { sourceOwnership: { status: 'missing' as const, ownerDocuments: [], mappingIds: [] } }]) {
      const result = await altered(s => ({ ...s, facts: s.facts.map(fact => fact.provenance.path === f.request.documentPath ? { ...fact, ...field } : fact) }));
      expect(result.plan.issues.map(i => i.code)).toContain('approved-intent-source-required');
    }
    const contradiction = await altered(s => ({ ...s, diagnostics: [{ id: 'public-conflict', kind: 'ambiguousIntent', reason: 'Public negative control',
      provenance: [], relatedNodeIds: [f.request.ruleId], evidenceScope: 'source' }] }));
    expect(contradiction.plan.issues.map(i => i.code)).toContain('intent-gap-requires-review');
    const staleProof = await altered(s => ({ ...s, facts: s.facts.map(fact => fact.codeOccurrence ? { ...fact, provenance: { ...fact.provenance, digest: 'stale-proof' } } : fact) }));
    expect(staleProof.plan.issues.map(i => i.code)).toContain('source-proof-mismatch');
    const legacy = await altered(s => ({ ...s, manifest: { ...s.manifest, codeInventory: undefined } }));
    expect(legacy.plan.issues.map(i => i.code)).toContain('recorded-code-coverage-required');
  });
  it('binds cached proposals to exact snapshot, model and artifact contents while allowing historical read under a different provider', async () => {
    const plan = await f.app.mappingProposalService.plan(f.request), saved = await f.app.mappingProposalService.read(f.request.snapshotId, plan.key);
    const factory = vi.fn(() => { throw Error('Provider must remain unused'); });
    const changed = new MappingProposalService(f.app.repository, f.app.snapshotStore, new FileMappingProposalStore(f.app.storageRoot),
      { ...settings(factory), providerIdentity: 'different-model-or-version' });
    const changedPlan = await changed.plan(f.request);
    expect(changedPlan.cached).toBe(false); expect(changedPlan.key).not.toBe(plan.key);
    expect((await changed.read(f.request.snapshotId, plan.key)).artifact).toEqual(saved.artifact);
    for (const artifact of [ { ...saved.artifact, outputDigest: 'corrupt' },
      { ...saved.artifact, authority: 'declared' }, { ...saved.artifact, key: 'b'.repeat(64) }]) {
      const service = new MappingProposalService(f.app.repository, f.app.snapshotStore,
        { read: async () => artifact as MappingProposalArtifact, write: async () => { throw Error('Unexpected write'); } }, settings(factory));
      await expect(service.read(f.request.snapshotId, plan.key)).rejects.toThrow('integrity');
    }
    expect(factory).not.toHaveBeenCalled();
  });
  it('previews every frozen live case without a model and verifies the predeclared inputs', async () => {
    const protocol = JSON.parse(await readFile(new URL('../evaluations/mapping-proposals/protocol.json', import.meta.url), 'utf8'));
    const lock = JSON.parse(await readFile(new URL('../evaluations/mapping-proposals/inputs.lock.json', import.meta.url), 'utf8'));
    // Git-aware normalization is tested separately; this fixture is stored as LF for hashing.
    for (const entry of lock.inputs) {
      const content = await readFile(new URL('../' + entry.path, import.meta.url), 'utf8');
      expect(sha256(content.replace(/\r\n/g, '\n'))).toBe(entry.sha256);
    }
    expect(protocol.cases).toHaveLength(3);
    for (const c of protocol.cases) {
      const plan = await f.app.mappingProposalService.plan({ snapshotId: f.request.snapshotId,
        ruleId: c.ruleId, documentPath: c.documentPath, files: c.files });
      expect(plan.issues).toEqual([]); expect(plan.ready).toBe(true);
      expect(plan.inputBytes).toBeLessThanOrEqual(protocol.limits.maxInputBytes);
      expect(plan.candidates.length).toBeLessThanOrEqual(protocol.limits.maxCandidates);
    }
  });
  it('invalidates edited/deleted evidence and preserves immutable historical proposals', async () => {
    const original = await f.app.mappingProposalService.plan(f.request);
    await rename(join(f.root, 'src/observations.ts'), join(f.root, 'src/renamed.ts'));
    await f.commit();
    const next = await f.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    const changed = await f.app.mappingProposalService.plan({ ...f.request, snapshotId: next.snapshot.manifest.snapshotId });
    expect(changed.ready).toBe(false); expect(changed.key).not.toBe(original.key);
    const old = await f.app.mappingProposalService.read(f.request.snapshotId, original.key);
    expect(old.evidenceState?.stale).toBe(true); expect(old.evidenceState?.eligibleForCurrentDiffValidation).toBe(false);
    const forged = { ...f.snapshot, manifest: { ...f.snapshot.manifest, overlayDigest: 'draft' } } as GraphSnapshot;
    expect((await prepareMappingProposal(f.app.repository, forged, f.request)).plan.issues.map(i => i.code)).toContain('committed-snapshot-required');
  }, 60_000);
});
