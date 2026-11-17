import { appendFileSync, truncateSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, readdir, rm, link, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { inventoryCache } from '../src/storage/inspection/inventory.js';
import { profileSnapshot } from '../src/storage/inspection/profile.js';
import { inspectJson } from '../src/storage/inspection/read.js';
import { physicalArtifactKey } from '../src/infrastructure/artifact-paths.js';

const roots: string[] = [];
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'weftlet-inspection-')); roots.push(root); return root; }
async function put(root: string, path: string, value: string) { const file = join(root, path); await mkdir(dirname(file), { recursive: true }); await writeFile(file, value); return file; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const manifest = (id = 'saved', repositoryId = 'public/repository') => ({ schemaVersion: 1, snapshotId: id, repositoryId,
  commitSha: 'a'.repeat(40), contentDigest: 'b'.repeat(64), configurationDigest: 'c'.repeat(64), semanticArtifactKeys: ['one'] });
const fact = { id: 'fact', subject: { id: 'intent:x', kind: 'Capability', label: '公开 😀 " \\ rule' },
  object: { id: 'component:file:src/x.ts', kind: 'Component', label: 'X' }, predicate: 'implementedBy',
  provenance: { path: 'docs/x.md', startLine: 1, endLine: 1, commitSha: 'a'.repeat(40) }, authority: 'inferred' };
const snapshot = { manifest: manifest(), facts: [fact, { ...fact, id: 'second' }], invariants: [], diagnostics: [], runtimeEvidence: [], unresolved: [] };

it('accounts across profiles, hard links, shared artifacts, leased work and unknown data without changing bytes', async () => {
  const root = await fixture(), external = await fixture();
  const saved = await put(root, 'p1/snapshots/saved.json', JSON.stringify(snapshot));
  await put(root, 'p1/heads/default.json', '{"snapshotId":"saved"}');
  await put(root, 'p2/snapshots/other.json', JSON.stringify({ ...snapshot, manifest: manifest('other', 'public/other') }));
  await put(root, 'p2/heads/broken.json', '{"snapshotId":"missing"}');
  await put(root, 'semantic-artifacts-v1/shared/artifacts/semantic/key.json', '{"source":"private-text-not-output"}');
  await put(root, 'p1/work/compare-live/lease.json', '{"pid":123,"startedAt":"2000-01-01"}');
  await put(root, 'p1/work/compare-live/index.scip', 'SCIP');
  await put(root, 'p1/scip/a.scip', 'same index bytes');
  await put(root, 'p1/scip/b.scip', 'same index bytes');
  await link(saved, join(root, 'p1/snapshots/linked.json'));
  await put(root, 'pins/private-notes.json', 'private raw notes are not read');
  await put(external, 'must-not-read.json', 'outside');
  await symlink(external, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  const before = await readFile(saved), names = (await readdir(root, { recursive: true })).sort();
  const result = await inventoryCache({ roots: [root, join(root, 'p1'), root], verify: true });
  expect(result.roots).toEqual([root]);
  expect(result.totals.logicalBytes - result.totals.uniqueLogicalBytes).toBe(before.length);
  expect(result.byRepository['public/repository']!.logicalBytes).toBeGreaterThan(before.length);
  expect(result.byRepository['public/other']).toBeDefined();
  expect(result.byClass['semantic-artifact']!.entries).toBe(1);
  expect(result.objects.find(e => e.path === 'p1/snapshots/saved.json')).toMatchObject({ inspection: 'json-complete', headReferences: [join(root, 'p1/heads/default.json')] });
  expect(result.objects.find(e => e.path === 'p1/snapshots/linked.json')!.inspection).toBe('invalid'); // copied filename is not its logical ID
  expect(result.objects.find(e => e.path === 'p1/work/compare-live/index.scip')!.activity).toBe('lease-marker-present-unverified');
  expect(result.objects.find(e => e.path === 'escape')!.kind).toBe('link');
  expect(result.objects.some(e => e.path.includes('must-not-read'))).toBe(false);
  expect(result.danglingHeads).toEqual([join(root, 'p2/heads/broken.json')]);
  expect(result.byteIdenticalGroups).toContainEqual([join(root, 'p1/scip/a.scip'), join(root, 'p1/scip/b.scip')]);
  expect(JSON.stringify(result)).not.toContain('private-text-not-output');
  expect(JSON.stringify(result)).not.toContain('private raw notes');
  expect(await readFile(saved)).toEqual(before);
  expect((await readdir(root, { recursive: true })).sort()).toEqual(names);
});

it('distinguishes prefix metadata from a full malformed-tail check and discloses bounds/missing roots', async () => {
  const root = await fixture();
  const path = await put(root, 'snapshots/saved.json', JSON.stringify(snapshot).slice(0, -1));
  const quick = await inventoryCache({ roots: [root] });
  expect(quick.objects.find(e => e.path === 'snapshots/saved.json')!.inspection).toBe('metadata-only');
  const verified = await inventoryCache({ roots: [root], verify: true });
  expect(verified.objects.find(e => e.path === 'snapshots/saved.json')!.inspection).toBe('invalid');
  expect((await inventoryCache({ roots: [root], maxEntries: 1 })).complete).toBe(false);
  expect((await inventoryCache({ roots: [root], verify: true, maxBytes: 10 })).objects.find(e => e.path === 'snapshots/saved.json')!.inspection).toBe('limited');
  const absent = await inventoryCache({ roots: [join(root, 'absent')] });
  expect(absent.missingRoots).toEqual([join(root, 'absent')]);
  expect(absent.totals.logicalBytes).toBe(0);
  await expect(readFile(join(root, 'absent'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(path, 'utf8')).toBe(JSON.stringify(snapshot).slice(0, -1));
});

it('profiles every field/record with exact compact UTF-8 totals and bounded full-payload repetition', async () => {
  const root = await fixture();
  const variant = { ...fact, id: 'variant', subject: { ...fact.subject, label: 'different meaning' } };
  const value = { ...snapshot, facts: [...snapshot.facts, variant], diagnostics: [{ reason: 'gap' }, { reason: 'gap' }] };
  const text = JSON.stringify(value, null, 2), path = await put(root, 'saved.json', text);
  const result = await profileSnapshot(path);
  expect(result.physicalBytes).toBe(Buffer.byteLength(text));
  expect(result.sha256).toBe(createHash('sha256').update(text).digest('hex'));
  expect(result.compactKnownSectionBytes).toBe(Buffer.byteLength(JSON.stringify(value)));
  for (const [key, section] of Object.entries(result.sections)) {
    expect(section.compactValueBytes).toBe(Buffer.byteLength(JSON.stringify(value[key as keyof typeof value])));
  }
  expect(result.factFields.subject!.compactValueBytes).toBe(value.facts.reduce((sum, f) => sum + Buffer.byteLength(JSON.stringify(f.subject)), 0));
  expect(result.repetition.entities).toMatchObject({ occurrences: 6, trackedDistinctValues: 3, repeatedOccurrences: 3, complete: true });
  expect(result.repetition.provenance.repeatedOccurrences).toBe(2);
  expect(result.repetition.diagnostics.repeatedOccurrences).toBe(1);
  expect(JSON.stringify(result)).not.toContain('different meaning');
  const bounded = await profileSnapshot(path, { maxDistinct: 1 });
  expect(bounded.repetition.entities.complete).toBe(false);
  expect(bounded.sections).toEqual(result.sections);
  expect(await readFile(path, 'utf8')).toBe(text);
});

it('rejects malformed, oversized and duplicate-root data and unsafe paths without following links', async () => {
  const root = await fixture(), external = await fixture();
  const path = await put(root, 'snapshot.json', JSON.stringify(snapshot));
  await expect(profileSnapshot(path, { maxBytes: 10 })).rejects.toThrow('byte limit');
  await expect(profileSnapshot(path, { maxRecordBytes: 10 })).rejects.toThrow('limit');
  const controller = new AbortController(); controller.abort();
  await expect(profileSnapshot(path, { signal: controller.signal })).rejects.toThrow();
  await put(root, 'snapshot.json', '{"manifest":{},"manifest":{},"facts":[]}');
  await expect(profileSnapshot(path)).rejects.toThrow('Duplicate');
  await put(root, 'snapshot.json', '{"facts":[' + '['.repeat(140));
  await expect(inspectJson(path)).rejects.toThrow('nesting');
  const id = 'x'.repeat(230);
  await put(root, `snapshots/${physicalArtifactKey(id)}.json`, JSON.stringify({ ...snapshot, manifest: manifest(id) }));
  expect((await inventoryCache({ roots: [root], verify: true })).objects.find(e => e.path.includes('~'))!.metadata!.snapshotId).toBe(id);
  await symlink(external, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await put(external, 'secret.json', JSON.stringify(snapshot));
  await expect(profileSnapshot(join(root, 'linked/secret.json'))).rejects.toThrow('symbolic');
});


it('streams UTF-8 across chunks and rejects mutation without returning a trusted digest', async () => {
  const root = await fixture();
  const facts = Array.from({ length: 1200 }, (_, i) => ({ ...fact, id: `fact-${i}` }));
  const value = { ...snapshot, facts }, text = JSON.stringify(value);
  const path = await put(root, 'snapshot.json', text);
  let chunks = 0;
  const result = await profileSnapshot(path, { onProgress() { chunks++; } });
  expect(chunks).toBeGreaterThan(3);
  expect(result.sections.facts!.records).toBe(1200);
  expect(result.compactKnownSectionBytes).toBe(Buffer.byteLength(text));
  expect(result.sha256).toBe(createHash('sha256').update(text).digest('hex'));
  let changed = false;
  await expect(profileSnapshot(path, { onProgress() {
    if (!changed) { changed = true; appendFileSync(path, ' '); }
  } })).rejects.toMatchObject({ code: 'changed' });
});


it('reports files changed after enumeration and bounds array-shaped evidence records', async () => {
  const root = await fixture(), path = await put(root, 'snapshots/saved.json', JSON.stringify(snapshot));
  let changed = false;
  const result = await inventoryCache({ roots: [root], verify: true, onProgress() {
    if (!changed) { changed = true; appendFileSync(path, ' '); }
  } });
  expect(result.complete).toBe(false);
  expect(result.objects.find(e => e.path === 'snapshots/saved.json')).toMatchObject({ inspection: 'changed' });
  await put(root, 'array.json', JSON.stringify({ manifest: manifest(), facts: [Array.from({ length: 5000 }, () => 123)] }));
  await expect(inspectJson(join(root, 'array.json'), { maxRecordBytes: 4096 })).rejects.toMatchObject({ code: 'limit' });
});


it('honors cancellation across unknown entries and distinguishes a truncated read from stable corruption', async () => {
  const root = await fixture();
  await put(root, 'unknown/a', 'a'); await put(root, 'unknown/b', 'b');
  const controller = new AbortController();
  await expect(inventoryCache({ roots: [root], signal: controller.signal,
    onProgress() { controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
  const path = await put(root, 'saved.json', JSON.stringify({ ...snapshot,
    facts: Array.from({ length: 1200 }, (_, i) => ({ ...fact, id: String(i) })) }));
  let changed = false;
  await expect(profileSnapshot(path, { onProgress() {
    if (!changed) { changed = true; truncateSync(path, 100_000); }
  } })).rejects.toMatchObject({ code: 'changed' });
  await expect(profileSnapshot(path)).rejects.toMatchObject({ code: 'invalid-json' });
});
