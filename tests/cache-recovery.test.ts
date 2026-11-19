import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, realpath, unlink, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { sha256, type GraphSnapshot } from '@weftlet/core';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { withCacheAccess, withCacheMaintenance } from '../src/storage/coordination/access.js';
import { FileSnapshotStore } from '../src/storage/storage.js';
import { planRecovery } from '../src/storage/recovery/plan.js';
import { applyRecovery } from '../src/storage/recovery/apply.js';
import { barrierName, barrierBytes, controlName } from '../src/storage/recovery/state.js';
import { prepareRetention } from '../src/storage/retention/prepared.js';
import { emptyRetentionPolicy } from '../src/storage/retention/policy.js';
import { removalJournal } from '../src/storage/retention/journal.js';

const hooks = vi.hoisted(() => ({ unlink: undefined as undefined | ((path: string) => Promise<void>), sync: undefined as undefined | ((path: string) => Promise<void>) }));
vi.mock('node:fs/promises', async original => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, unlink: async (path: string) => { await hooks.unlink?.(path); return actual.unlink(path); },
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args), sync = handle.sync.bind(handle);
      handle.sync = async () => { await hooks.sync?.(String(args[0])); return sync(); }; return handle;
    } };
});
const roots: string[] = [], children: ChildProcess[] = [];
afterEach(async () => {
  hooks.unlink = undefined; hooks.sync = undefined;
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
function childRun(code: string) {
  const child = spawn(process.execPath, ['--import', tsx, '--input-type=module', '--eval', code], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  children.push(child); let stdout = '', stderr = '';
  child.stdout!.on('data', data => { stdout += String(data); }); child.stderr!.on('data', data => { stderr += String(data); });
  const closed = new Promise<number | null>((resolve, reject) => { child.once('close', resolve); child.once('error', reject); });
  return { child, closed, output: () => ({ stdout, stderr }) };
}
async function deadPid() {
  const process = childRun("process.send('ready'); setInterval(() => {}, 1000);");
  await new Promise(resolve => process.child.once('message', resolve));
  const pid = process.child.pid!; process.child.kill('SIGKILL'); await process.closed; return pid;
}
function snapshot(id: string): GraphSnapshot {
  return { manifest: { schemaVersion: 1, repositoryId: 'public/recovery', ref: 'HEAD', commitSha: 'a'.repeat(40), snapshotId: id,
    configurationDigest: 'b'.repeat(64), contentDigest: sha256(id), scope: ['src'], ontologyVersion: 'test', extractorVersions: {},
    semanticModel: 'none', semanticPromptVersion: 'test', generatedAt: '2026-11-19T00:00:00.000Z', semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
    facts: [], invariants: [], runtimeEvidence: [], unresolved: [] };
}
async function fixture() {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'weftlet-recovery-'))); roots.push(parent);
  const root = join(parent, 'cache'); await mkdir(root);
  const store = new FileSnapshotStore(root);
  for (const id of ['previous', 'current', 'old']) await store.write(snapshot(id));
  await store.updateHead('default', 'previous'); await store.updateHead('default', 'current');
  await mkdir(join(root, 'artifacts/semantic'), { recursive: true }); await writeFile(join(root, 'artifacts/semantic/reuse.json'), '{"public":"expensive"}');
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  const policy = emptyRetentionPolicy(); policy.profiles.push({ path: '.', repositoryId: 'public/recovery', owner: 'team', reason: 'Public fixture' });
  policy.activeScopes.push({ profile: '.', head: 'default', owner: 'team', reason: 'Current evidence' });
  return { parent, root, store, policy };
}
async function marker(root: string, name = 'gate.lock', pid?: number) {
  const path = `${controlName}/${name}`;
  await writeFile(join(root, path), JSON.stringify({ schemaVersion: 1, protocol: 'cache-coordination-v1', operationId: randomUUID(),
    mode: name === 'gate.lock' ? 'maintenance' : 'activity', pid: pid ?? await deadPid(), startedAt: '2000-01-01T00:00:00.000Z' }));
  return path;
}
async function bytes(root: string) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return Object.fromEntries(await Promise.all(entries.filter(e => e.isFile() && !join(e.parentPath, e.name).includes(controlName))
    .map(async e => { const path = join(e.parentPath, e.name); return [path, sha256(await readFile(path))]; })));
}
async function apply(f: { root: string }) { const plan = await planRecovery(f); return applyRecovery(plan, plan.planId, { ...f, acknowledgeQuiescence: true }); }

it('archives dead gate/participant bytes before clearing blockers, preserving every evidence byte and usable current/previous snapshots', async () => {
  const f = await fixture(), before = await bytes(f.root), gate = await marker(f.root), participant = await marker(f.root, `participants/${randomUUID()}.json`);
  const originals = await Promise.all([gate, participant].map(path => readFile(join(f.root, path))));
  const controlsBefore = await readdir(join(f.root, controlName), { recursive: true });
  const plan = await planRecovery(f); expect(plan.canApply).toBe(true);
  expect(await readdir(join(f.root, controlName), { recursive: true })).toEqual(controlsBefore);
  await expect(applyRecovery(plan, plan.planId, { ...f, acknowledgeQuiescence: false })).rejects.toThrow('quiescence');
  const order: string[] = [];
  hooks.unlink = async path => {
    order.push(path);
    const receipt = JSON.parse(await readFile(join(f.root, controlName, 'recovery', `${plan.planId}.start.json`), 'utf8'));
    expect(receipt.originals.map((o: { base64: string }) => Buffer.from(o.base64, 'base64'))).toEqual(originals);
    await expect(withCacheAccess(f.root, async () => undefined, { timeoutMs: 5 })).rejects.toMatchObject({ phase: 'admission' });
  };
  const result = await applyRecovery(plan, plan.planId, { ...f, acknowledgeQuiescence: true }); hooks.unlink = undefined;
  expect(result).toMatchObject({ status: 'complete', evidenceFilesRemoved: 0, replayedDeletions: 0 });
  expect(order.at(-1)).toBe(join(f.root, barrierName)); expect(order.at(-2)).toBe(join(f.root, gate));
  expect(await bytes(f.root)).toEqual(before);
  await withCacheAccess(f.root, async () => expect(await f.store.readHead('default')).toEqual(snapshot('current')));
  await withCacheMaintenance(f.root, async () => undefined);
  expect((await prepareRetention(f)).canApply).toBe(true);
  await expect(applyRecovery(plan, plan.planId, { ...f, acknowledgeQuiescence: true })).rejects.toThrow('stale');
}, 30000);

it('vetoes live owners even with old timestamps and never treats unknown markers as abandoned', async () => {
  const f = await fixture(); await marker(f.root, 'gate.lock', process.pid);
  expect((await planRecovery(f)).issues).toContainEqual({ path: `${controlName}/gate.lock`, code: 'owner-may-still-be-live' });
  await expect(apply(f)).rejects.toThrow('stale or blocked');
  await writeFile(join(f.root, controlName, 'gate.lock'), '{}');
  expect((await planRecovery(f)).issues.some(i => i.code === 'unknown-owner-marker')).toBe(true);
  await writeFile(join(f.root, controlName, 'participants/unknown'), 'unknown');
  expect((await planRecovery(f)).canApply).toBe(false);
  await expect(readFile(join(f.root, barrierName))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('refuses stale/edited plans, new head state, root changes and incomplete scans before creating a claim or barrier', async () => {
  const f = await fixture(); const path = await marker(f.root); const plan = await planRecovery(f);
  await expect(applyRecovery({ ...plan, actions: [] }, plan.planId, { ...f, acknowledgeQuiescence: true })).rejects.toThrow('edited');
  await expect(applyRecovery(plan, 'wrong', { ...f, acknowledgeQuiescence: true })).rejects.toThrow('expect-plan');
  await writeFile(join(f.root, path), (await readFile(join(f.root, path), 'utf8')) + ' ');
  await expect(applyRecovery(plan, plan.planId, { ...f, acknowledgeQuiescence: true })).rejects.toThrow('stale');
  const next = await planRecovery(f); await writeFile(join(f.root, 'heads/another.json'), JSON.stringify({ schemaVersion: 1, snapshotId: 'old' }));
  await expect(applyRecovery(next, next.planId, { ...f, acknowledgeQuiescence: true })).rejects.toThrow('stale');
  expect((await planRecovery({ ...f, maxEntries: 2 })).canApply).toBe(false);
  await expect(readFile(join(f.root, barrierName))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('reconciles actual interrupted removal logs without replaying an unlink or altering the original journal', async () => {
  const f = await fixture(), plan = await prepareRetention(f), journal = await removalJournal(plan, async () => undefined);
  const old = plan.objects.find(o => o.path === 'snapshots/old.json')!;
  await journal.append({ event: 'unlink-intent', path: old.path, sha256: old.sha256 }); await unlink(join(f.root, old.path)); await journal.close();
  const originalJournal = await readFile(journal.path), before = await bytes(f.root);
  const recovery = await planRecovery(f); expect(recovery.canApply).toBe(true);
  expect(recovery.journals[0]!.candidates).toEqual([{ path: old.path, state: 'absent', recordedUnlink: false }]);
  await applyRecovery(recovery, recovery.planId, { ...f, acknowledgeQuiescence: true });
  expect(await bytes(f.root)).toEqual(before); expect(await readFile(journal.path)).toEqual(originalJournal);
  expect((await prepareRetention(f)).canApply).toBe(true);
});

it('keeps changed, dangling, missing and truncated removal journal cases blocked', async () => {
  const f = await fixture(), plan = await prepareRetention(f), journal = await removalJournal(plan, async () => undefined);
  const old = plan.objects.find(o => o.path === 'snapshots/old.json')!;
  await journal.append({ event: 'unlink-intent', path: old.path, sha256: old.sha256 }); await journal.close();
  const original = await readFile(journal.path);
  await writeFile(join(f.root, old.path), 'changed'); expect((await planRecovery(f)).canApply).toBe(false);
  await unlink(join(f.root, old.path)); await writeFile(join(f.root, 'heads/dangling.json'), JSON.stringify({ schemaVersion: 1, snapshotId: 'old' }));
  expect((await planRecovery(f)).issues.some(i => i.code === 'dangling-head')).toBe(true);
  await unlink(join(f.root, 'heads/dangling.json'));
  await writeFile(journal.path, original.subarray(0, original.length - 1));
  expect((await planRecovery(f)).issues.some(i => i.code === 'journal-reconciliation-required')).toBe(true);
  await unlink(journal.path); expect((await planRecovery(f)).canApply).toBe(false);
});

it('preserves blockers on receipt sync failure and blocks new admissions', async () => {
  const f = await fixture(), gate = await marker(f.root), before = await readFile(join(f.root, gate)), plan = await planRecovery(f);
  hooks.sync = async path => { if (path.endsWith('.start.json')) throw Error('simulated sync failure'); };
  await expect(applyRecovery(plan, plan.planId, { ...f, acknowledgeQuiescence: true })).rejects.toThrow('sync failure'); hooks.sync = undefined;
  expect(await readFile(join(f.root, gate))).toEqual(before);
  expect(await readFile(join(f.root, barrierName), 'utf8')).toBe(barrierBytes);
  await expect(withCacheAccess(f.root, async () => undefined, { timeoutMs: 10 })).rejects.toMatchObject({ phase: 'admission' });
  expect((await planRecovery(f)).issues.some(i => i.code === 'recovery-owner-may-still-be-live')).toBe(true);
});

it('refuses aliases and shared control files without touching their targets', async () => {
  const f = await fixture(), gate = await marker(f.root), alias = join(f.parent, 'alias');
  await symlink(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(planRecovery({ root: alias })).rejects.toThrow('symbolic links or junctions');
  await link(join(f.root, gate), join(f.parent, 'linked'));
  await expect(planRecovery(f)).rejects.toThrow('unshared');
});

it('offers installed CLI-shaped plan/apply with external inputs and rejects scan overrides on apply', async () => {
  const f = await fixture(); await marker(f.root);
  const cli = join(process.cwd(), 'src/cli.ts'), run = promisify(execFile);
  const planned = await run(process.execPath, ['--import', tsx, cli, 'cache', 'recovery', 'plan', '--root', f.root, '--json']);
  const plan = JSON.parse(planned.stdout), path = join(f.parent, 'plan.json'); await writeFile(path, planned.stdout);
  const args = ['--import', tsx, cli, 'cache', 'recovery', 'apply', '--root', f.root, '--plan', path, '--expect-plan', plan.planId, '--acknowledge-quiescence'];
  await expect(run(process.execPath, [...args, '--max-bytes', '100'])).rejects.toThrow();
  const result = JSON.parse((await run(process.execPath, args)).stdout); expect(result.evidenceFilesRemoved).toBe(0);
}, 30000);

it('recovers an actual killed shared owner and an actual killed recovery, retaining evidence and prior control archives', async () => {
  const f = await fixture(), before = await bytes(f.root);
  const accessModule = new URL('../src/storage/coordination/access.ts', import.meta.url).href;
  const owner = childRun(`import { withCacheAccess } from ${JSON.stringify(accessModule)};
    await withCacheAccess(${JSON.stringify(f.root)}, async () => { setInterval(() => {}, 1000); process.send('entered'); await new Promise(() => {}); });`);
  await new Promise(resolve => owner.child.once('message', resolve)); owner.child.kill('SIGKILL'); await owner.closed;
  const plan = await planRecovery(f), planFile = join(f.parent, 'crash-plan.json'); await writeFile(planFile, JSON.stringify(plan));
  expect(plan.canApply).toBe(true);
  const module = new URL('../src/storage/recovery/apply.ts', import.meta.url).href;
  const crashing = childRun(`import fs from 'node:fs/promises'; import { syncBuiltinESMExports } from 'node:module';
    const unlink = fs.unlink; fs.unlink = async path => { if (String(path).endsWith('gate.lock')) {
      setInterval(() => {}, 1000); process.send('before-gate'); await new Promise(() => {}); } return unlink(path); }; syncBuiltinESMExports();
    const { applyRecovery } = await import(${JSON.stringify(module)});
    const plan = JSON.parse(await fs.readFile(${JSON.stringify(planFile)}, 'utf8'));
    await applyRecovery(plan, plan.planId, { root: ${JSON.stringify(f.root)}, acknowledgeQuiescence: true });`);
  await new Promise<void>((resolve, reject) => {
    crashing.child.once('message', () => resolve()); crashing.closed.then(code => reject(Error(`Recovery exited ${code}: ${crashing.output().stderr}`)));
  });
  const blocked = await planRecovery(f); expect(blocked.issues.some(i => i.code === 'recovery-owner-may-still-be-live')).toBe(true);
  crashing.child.kill('SIGKILL'); await crashing.closed;
  const next = await planRecovery(f); expect(next.canApply).toBe(true); expect(next.interruptedClaims).toContain(plan.planId);
  const receipt = join(f.root, controlName, 'recovery', `${plan.planId}.start.json`), receiptBefore = await readFile(receipt);
  await applyRecovery(next, next.planId, { ...f, acknowledgeQuiescence: true });
  expect(await readFile(receipt)).toEqual(receiptBefore); expect(await bytes(f.root)).toEqual(before);
  expect((await planRecovery(f)).interruptedClaims).toEqual([]);
  await withCacheMaintenance(f.root, async () => undefined);
}, 30000);

it('admits only one simultaneous process applying the same exact recovery plan', async () => {
  const f = await fixture(); await marker(f.root);
  const plan = await planRecovery(f), planFile = join(f.parent, 'concurrent.json'); await writeFile(planFile, JSON.stringify(plan));
  const module = new URL('../src/storage/recovery/apply.ts', import.meta.url).href;
  const code = `import { readFile } from 'node:fs/promises'; import { applyRecovery } from ${JSON.stringify(module)};
    const plan = JSON.parse(await readFile(${JSON.stringify(planFile)}, 'utf8'));
    try { await applyRecovery(plan, plan.planId, { root: ${JSON.stringify(f.root)}, acknowledgeQuiescence: true }); }
    catch (error) { process.stderr.write(String(error)); process.exitCode = 1; }`;
  const runs = [childRun(code), childRun(code)], exits = await Promise.all(runs.map(r => r.closed));
  expect(exits.sort()).toEqual([0, 1]);
  expect((await readdir(join(f.root, controlName, 'recovery'))).filter(p => p.endsWith('.claim.json'))).toHaveLength(1);
  await withCacheAccess(f.root, async () => expect(await f.store.readHead('default')).toEqual(snapshot('current')), { timeoutMs: 200 });
}, 30000);

it('stops if control membership changes after the archived receipt and preserves evidence on cancellation', async () => {
  const f = await fixture(); await marker(f.root); const before = await bytes(f.root), plan = await planRecovery(f);
  hooks.sync = async path => { if (path.endsWith('.start.json')) await writeFile(join(f.root, controlName, 'unexpected'), 'preserve'); };
  await expect(applyRecovery(plan, plan.planId, { ...f, acknowledgeQuiescence: true })).rejects.toThrow('membership'); hooks.sync = undefined;
  expect(await bytes(f.root)).toEqual(before); expect(await readFile(join(f.root, controlName, 'unexpected'), 'utf8')).toBe('preserve');
  const other = await fixture(); const gate = await marker(other.root), original = await readFile(join(other.root, gate));
  const prepared = await planRecovery(other), controller = new AbortController();
  hooks.sync = async path => { if (path.endsWith('.start.json')) controller.abort(); };
  await expect(applyRecovery(prepared, prepared.planId, { ...other, acknowledgeQuiescence: true, signal: controller.signal })).rejects.toThrow();
  expect(await readFile(join(other.root, gate))).toEqual(original);
});

it('rejects incomplete or mismatched completion receipts instead of suppressing live recovery-owner checks', async () => {
  const f = await fixture(); await marker(f.root); const plan = await planRecovery(f);
  hooks.sync = async path => { if (path.endsWith('.start.json')) throw Error('stop'); };
  await expect(applyRecovery(plan, plan.planId, { ...f, acknowledgeQuiescence: true })).rejects.toThrow('stop'); hooks.sync = undefined;
  const prefix = join(f.root, controlName, 'recovery', plan.planId);
  await writeFile(`${prefix}.done.json`, JSON.stringify({ kind: 'cache-recovery-result', rootId: plan.rootId, planId: plan.planId, resolvedClaims: [plan.planId] }));
  const blocked = await planRecovery(f);
  expect(blocked.issues.some(i => i.code === 'invalid-recovery-result')).toBe(true);
  expect(blocked.issues.some(i => i.code === 'recovery-owner-may-still-be-live')).toBe(true);
  await writeFile(`${prefix}.start.json`, '{}');
  expect((await planRecovery(f)).issues.some(i => i.code === 'invalid-recovery-receipt')).toBe(true);
});

it('checks terminal journal results and rejects reserved control paths and oversized control inventories', async () => {
  const f = await fixture(), plan = await prepareRetention(f), journal = await removalJournal(plan, async () => undefined);
  const old = plan.objects.find(o => o.path === 'snapshots/old.json')!;
  await journal.append({ event: 'unlink-intent', path: old.path, sha256: old.sha256 });
  await journal.append({ event: 'finished', result: { schemaVersion: 1, kind: 'retention-removal-result', planId: plan.planId,
    operationId: journal.operationId, status: 'partial', failure: 'append-failed', deleted: [old.path], deletedLogicalBytes: old.logicalBytes,
    candidateFiles: 1, remainingCandidates: 0, journalPath: journal.path }, completedAt: new Date().toISOString() }); await journal.close();
  expect((await planRecovery(f)).issues.some(i => i.code === 'journal-reconciliation-required')).toBe(true);
  const lines = (await readFile(journal.path, 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  lines[0].candidates[0].path = '.weftlet-coordination/snapshots/fake.json'; await writeFile(journal.path, JSON.stringify(lines[0]) + '\n');
  expect((await planRecovery(f)).canApply).toBe(false);
  // A sparse control object exercises the aggregate limit without allocating a huge payload.
  const fs = await import('node:fs/promises'), handle = await fs.open(join(f.root, controlName, 'too-large'), 'wx');
  try { await handle.truncate(65 * 1024 ** 2); } finally { await handle.close(); }
  await expect(planRecovery(f)).rejects.toThrow('64 MiB');
  await expect(readFile(join(f.root, barrierName))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('fails closed for different-plan concurrent recovery without deleting evidence', async () => {
  const f = await fixture(), before = await bytes(f.root); await marker(f.root);
  const plans = await Promise.all([planRecovery(f), planRecovery({ ...f, maxEntries: 99999 })]);
  expect(plans[0]!.planId).not.toBe(plans[1]!.planId);
  const module = new URL('../src/storage/recovery/apply.ts', import.meta.url).href;
  const runs = [];
  for (const [index, plan] of plans.entries()) {
    const path = join(f.parent, `different-${index}.json`); await writeFile(path, JSON.stringify(plan));
    runs.push(childRun(`import { readFile } from 'node:fs/promises'; import { applyRecovery } from ${JSON.stringify(module)};
      const plan = JSON.parse(await readFile(${JSON.stringify(path)}, 'utf8')); try {
        await applyRecovery(plan, plan.planId, { root: ${JSON.stringify(f.root)}, acknowledgeQuiescence: true });
      } catch (error) { process.stderr.write(String(error)); process.exitCode = 1; }`));
  }
  const exits = await Promise.all(runs.map(r => r.closed)); expect(exits.filter(code => code === 0).length).toBeLessThanOrEqual(1);
  expect(await bytes(f.root)).toEqual(before);
  const next = await planRecovery(f);
  if (next.canApply) await applyRecovery(next, next.planId, { ...f, acknowledgeQuiescence: true });
  await withCacheAccess(f.root, async () => undefined, { timeoutMs: 200 });
}, 30000);

it('refuses unknown owner fields/modes and distinguishes final receipt failure after admission reopens', async () => {
  const f = await fixture(), path = await marker(f.root), original = JSON.parse(await readFile(join(f.root, path), 'utf8'));
  for (const invalid of [{ ...original, mode: 'activity' }, { ...original, extra: true }, { ...original, startedAt: undefined }]) {
    await writeFile(join(f.root, path), JSON.stringify(invalid));
    expect((await planRecovery(f)).issues.some(i => i.code === 'unknown-owner-marker')).toBe(true);
  }
  await writeFile(join(f.root, path), JSON.stringify(original)); const plan = await planRecovery(f), before = await bytes(f.root);
  hooks.sync = async path => { if (path.endsWith('.done.json')) throw Error('completion sync failed'); };
  await expect(applyRecovery(plan, plan.planId, { ...f, acknowledgeQuiescence: true })).rejects.toThrow('completion sync failed'); hooks.sync = undefined;
  await expect(readFile(join(f.root, barrierName))).rejects.toMatchObject({ code: 'ENOENT' });
  await withCacheAccess(f.root, async () => undefined); expect(await bytes(f.root)).toEqual(before);
  expect(await readdir(join(f.root, controlName, 'recovery'))).toHaveLength(3);
});

it('reserves aggregate control bytes and entries for peak recovery bookkeeping before mutation', async () => {
  const { requireRecoveryCapacity } = await import('../src/storage/recovery/archive.js');
  const f = await fixture(); await marker(f.root); const plan = await planRecovery(f), before = await readdir(join(f.root, controlName));
  const overBytes = { ...plan, controls: [{ ...plan.controls[0]!, bytes: 64 * 1024 ** 2 - 10 }] };
  expect(() => requireRecoveryCapacity(overBytes, { paths: ['new'], directories: [], bytes: 11 })).toThrow('capacity');
  const overEntries = { ...plan, controls: Array.from({ length: 9998 }, () => plan.controls[0]!) };
  expect(() => requireRecoveryCapacity(overEntries, { paths: ['claim', 'start', 'done'], directories: ['recovery'], bytes: 10 })).toThrow('capacity');
  expect(await readdir(join(f.root, controlName))).toEqual(before);
});

it('refuses actual near-limit control storage before writing any recovery artifact', async () => {
  const f = await fixture(); await marker(f.root); await mkdir(join(f.root, controlName, 'removals'));
  const fs = await import('node:fs/promises');
  for (let i = 0; i < 2; i++) {
    const handle = await fs.open(join(f.root, controlName, 'removals', `${randomUUID()}.jsonl`), 'wx');
    try { await handle.truncate(32 * 1024 ** 2 - 1024); } finally { await handle.close(); }
  }
  const plan = await planRecovery(f); expect(plan.canApply).toBe(true);
  const before = await readdir(join(f.root, controlName), { recursive: true });
  await expect(applyRecovery(plan, plan.planId, { ...f, acknowledgeQuiescence: true })).rejects.toThrow('bookkeeping would exceed');
  expect(await readdir(join(f.root, controlName), { recursive: true })).toEqual(before);
}, 30000);
