import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GraphSnapshot } from '@weftlet/core';
import { createContextGraphApplication } from '../src/application/application.js';
import { requiredSnapshotExtractorVersions } from '../src/application/extraction-identity.js';
import { SnapshotChecks } from '../src/application/snapshot-checks.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';

const execute = promisify(execFile);
const temporary: string[] = [];
const current = requiredSnapshotExtractorVersions();
const currentRouting = requiredSnapshotExtractorVersions({ routingSources: ['routes.json'] });
const contract = 'repository-contract-extractor';
const symbols = 'scip-symbol-extractor';
const routing = 'routing-declaration-extractor';
const commitSha = 'a'.repeat(40);

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporary.splice(0).map((root) => rm(root,
    { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

function snapshot(id: string, versions: Readonly<Record<string, string>>): GraphSnapshot {
  return {
    manifest: { schemaVersion: 1, repositoryId: 'public/extractor-compatibility', ref: 'HEAD',
      commitSha, snapshotId: id, configurationDigest: 'same-config', scope: ['docs'],
      ontologyVersion: '1', extractorVersions: versions, semanticModel: 'fixture',
      semanticPromptVersion: '1', generatedAt: '2026-01-01T00:00:00Z', contentDigest: id,
      semanticArtifactKeys: [], scipIndexDigest: 'fixture', rdfDigest: 'fixture' },
    facts: [{ id: `${id}-fact`, subject: { id: 'capability:search', kind: 'Capability', label: 'Search' },
      predicate: 'implementedBy', object: { id: 'component:file:src/search.ts', kind: 'Component', label: 'src/search.ts' },
      provenance: { path: 'docs/owner.md', startLine: 1, endLine: 1, digest: 'fixture', commitSha },
      extractor: { id: 'public-fixture', version: '1' }, confidence: 0.9,
      authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed', snapshotId: id }],
    invariants: [], runtimeEvidence: [], unresolved: [],
  };
}

describe('current-validation extraction compatibility', () => {
  it.each([
    { name: 'old assembly', versions: { ...current, assembly: 'standalone-graph-v6' }, incompatible: 'assembly' },
    { name: 'old document bindings', versions: { ...current, 'document-code-binding-extractor': '0' }, incompatible: 'document-code-binding-extractor' },
    { name: 'old contract', versions: { ...current, [contract]: '1.1.0' }, incompatible: contract },
    { name: 'old SCIP fact extraction', versions: { ...current, [symbols]: '1.0.0' }, incompatible: symbols },
    { name: 'missing SCIP fact extraction', versions: { assembly: current.assembly!, [contract]: current[contract]! }, incompatible: symbols },
    { name: 'missing contract', versions: { assembly: current.assembly! }, incompatible: contract },
    { name: 'missing versions', versions: {}, incompatible: 'assembly' },
    { name: 'old configured routing', versions: { ...currentRouting, [routing]: '1.0.0' },
      expected: currentRouting, incompatible: routing },
    { name: 'missing configured routing', versions: current, expected: currentRouting, incompatible: routing },
  ])('rejects $name despite matching commit/configuration, without refreshing', async ({ versions, expected, incompatible }) => {
    const saved = snapshot('old', versions);
    const readHead = vi.fn(async () => saved);
    const compareClean = vi.fn(async () => ({ snapshot: saved, semanticExtracted: 0, semanticReused: 1 }));
    const checks = new SnapshotChecks({ readHead }, {
      resolveRef: async () => commitSha, workingChanges: async () => [],
    }, { compareClean }, undefined, 'same-config', expected);
    await expect(checks.read({})).rejects.toThrow(`refresh (`);
    await expect(checks.compare({})).rejects.toThrow(incompatible);
    expect(compareClean).not.toHaveBeenCalled();
    expect(readHead).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('accepts current required versions (routing configured: %s)', async (withRouting) => {
    // An unrelated old routing version is not a blocker when routing is not selected.
    const expected = withRouting ? currentRouting : current;
    const saved = snapshot('current', { [routing]: '1.0.0', ...expected });
    const compareClean = vi.fn(async () => ({ snapshot: saved, semanticExtracted: 0, semanticReused: 1 }));
    const checks = new SnapshotChecks({ readHead: async () => saved }, {
      resolveRef: async () => commitSha, workingChanges: async () => [],
    }, { compareClean }, undefined, 'same-config', expected);
    expect(await checks.read({})).toBe(saved);
    expect((await checks.compare({})).snapshot).toBe(saved);
    expect(compareClean).toHaveBeenCalledOnce();
  });
});

async function applicationFixture(withRouting: boolean) {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-extractor-compatibility-'));
  temporary.push(root);
  await Promise.all(['src', 'docs'].map((path) => mkdir(join(root, path))));
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(root, '.gitignore'), '.context-graph/\n');
  await writeFile(join(root, 'src/search.ts'), 'export const search = () => true;\n');
  await writeFile(join(root, 'docs/owner.md'), 'Search is implemented by src/search.ts.\n');
  await writeFile(join(root, 'routes.json'), '{"schemaVersion":1,"routes":[]}\n');
  const config = JSON.parse(await readFile(new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  Object.assign(config, { repositoryId: 'public/extractor-compatibility', semanticSources: ['docs'],
    codeRoots: ['src'], evidenceRoots: [], approvedIntentSources: ['docs/owner.md'],
    ...(withRouting ? { routingSources: ['routes.json'] } : {}),
    semantic: { ...config.semantic, provider: 'module', providerModule: './missing-provider.mjs',
      providerIdentity: 'public-missing-provider:1' },
    scip: { version: 'unavailable', command: 'weftlet-missing-indexer', args: [] } });
  const configPath = join(root, 'context-graph.config.json');
  await writeFile(configPath, JSON.stringify(config));
  const git = async (...args: string[]) => (await execute('git', args, { cwd: root })).stdout.trim();
  await git('init', '--quiet');
  await git('add', '.');
  await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public compatibility fixture');
  const application = await createContextGraphApplication(configPath);
  const actualSha = await git('rev-parse', 'HEAD');
  const seed = async (id: string, versions: Readonly<Record<string, string>>) => {
    const saved = snapshot(id, versions);
    const value: GraphSnapshot = { ...saved,
      manifest: { ...saved.manifest, commitSha: actualSha,
        configurationDigest: sha256(stableJson(application.config)) },
      facts: saved.facts.map((fact) => ({ ...fact,
        provenance: { ...fact.provenance, commitSha: actualSha } })) };
    await application.snapshotStore.write(value);
    await application.snapshotStore.updateHead('default', id);
    return value;
  };
  return { root, application, seed };
}

describe('production saved-evidence compatibility wiring', () => {
  it.each([false, true])('labels historical versions without hiding facts or refreshing (routing: %s)', async (withRouting) => {
    const { root, application, seed } = await applicationFixture(withRouting);
    const expected = requiredSnapshotExtractorVersions(application.config);
    const incompatible = withRouting ? routing : 'assembly';
    const old = await seed('historical', withRouting
      ? { ...expected, [routing]: '1.0.0' } : { ...expected, assembly: 'standalone-graph-v6' });
    const storage = join(root, '.context-graph');
    const oldPath = join(storage, 'snapshots/historical.json');
    const before = await readFile(oldPath);
    const compare = vi.spyOn(application.hydrator, 'compareClean').mockImplementation(async () => {
      throw new Error('Historical checks must not refresh');
    });
    const hydrate = vi.spyOn(application.hydrator, 'hydrate').mockImplementation(async () => {
      throw new Error('Saved queries must not hydrate');
    });

    await expect(application.snapshotChecks.read({})).rejects.toThrow(incompatible);
    await expect(application.snapshotChecks.compare({})).rejects.toThrow(incompatible);
    const pack = await application.queryService.scan({ snapshotId: 'historical', capabilities: ['search'] });
    expect(pack.facts).toEqual(old.facts);
    expect(pack.snapshot.extractorVersions).toEqual(old.manifest.extractorVersions);
    expect(pack.evidenceState).toMatchObject({ stale: false, configurationMatches: true,
      extractionCompatible: false, incompatibleExtractors: [incompatible], eligibleForCurrentDiffValidation: false });
    expect(pack.markdown).toContain(incompatible);
    expect(pack.markdown).toMatch(/extract.*(?:mismatch|false|incompatible|refresh)/i);
    expect(await readFile(oldPath)).toEqual(before);
    expect((await readdir(storage)).sort()).toEqual(['heads', 'snapshots']);

    const compatible = await seed('current', expected);
    expect(await application.snapshotChecks.read({})).toEqual(compatible);
    const currentPack = await application.queryService.scan({ capabilities: ['search'] });
    expect(currentPack.evidenceState).toMatchObject({ stale: false, configurationMatches: true,
      extractionCompatible: true, incompatibleExtractors: [], eligibleForCurrentDiffValidation: false });
    expect(currentPack.facts).toEqual(compatible.facts);
    // Advancing the head does not relabel an explicitly selected historical snapshot.
    const historical = await application.queryService.scan({ snapshotId: 'historical', capabilities: ['search'] });
    expect(historical.evidenceState?.extractionCompatible).toBe(false);
    expect(historical.facts).toEqual(old.facts);
    expect(await readFile(oldPath)).toEqual(before);
    expect(compare).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
  });
});
