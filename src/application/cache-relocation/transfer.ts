import { lstat, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { persistedJsonDigest } from '@weftlet/core';
import { SnapshotGraphDiscoveryService } from '../../graph/discovery.js';
import { parseRetentionPolicy } from '../../storage/retention/policy.js';
import { FileSnapshotStore, snapshotPath } from '../../storage/storage.js';
import { enableCacheCoordination, managedRootForPath } from '../../storage/coordination/managed-root.js';
import { withRetentionMaintenance } from '../../storage/retention/prepared.js';
import {
  copyTransferFile,
  requireFreeSpace,
  safeTransferPath,
  transferDirectory,
} from '../../storage/transfer-files.js';
import { inspectFileDigest, inspectSmallJson } from '../../storage/inspection/read.js';
import { inventoryCache, inventoryLimits } from '../../storage/inspection/inventory.js';
import { cacheLayout } from '../../storage/inspection/layout.js';
import { archivePlanOwned, type ArchivePlan, type ArchiveOptions } from './plan.js';

function contained(parent: string, child: string) {
  const p = relative(parent, child);
  return !p || (!isAbsolute(p) && p !== '..' && !p.startsWith('..' + sep));
}
async function freshOutput(path: string, apart: string, run: (stage: string, output: string) => Promise<void>) {
  const output = resolve(path),
    parent = dirname(output);
  await safeTransferPath(parent, true);
  const target = join(await realpath(parent), basename(output)),
    other = await realpath(apart);
  if (contained(other, target) || contained(target, other) || (await managedRootForPath(target)))
    throw Error('Select a separate new directory outside all active caches and the archive');
  const lock = join(dirname(target), '.weftlet-transfer-' + persistedJsonDigest(target).slice(0, 20) + '.lock');
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw Error('Another transfer owns ' + lock + '; after quiescence retry with a new destination.');
    throw error;
  }
  try {
    const assertAbsent = async () => {
      try {
        await lstat(target);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw e;
      }
      throw Error('Archive and restore require a new destination');
    };
    await assertAbsent();
    const stage = join(lock, 'staging');
    await writeFile(join(lock, 'owner.json'), JSON.stringify({ target, pid: process.pid }), {
      flag: 'wx',
      mode: 0o600,
    });
    await mkdir(stage, { mode: 0o700 });
    try {
      await run(stage, target);
      await assertAbsent();
      await rename(stage, target);
    } finally {
      await rm(stage, { recursive: true, force: true, maxRetries: 5 });
    }
  } finally {
    await rm(lock, { recursive: true, force: true, maxRetries: 5 });
  }
}
function checkComponents(path: string) {
  const parts = path.split('/');
  if (
    parts.some(
      (s) =>
        !s ||
        s === '.' ||
        s === '..' ||
        /[<>:"\\|?*\x00-\x1f]/.test(s) ||
        /[. ]$/.test(s) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s) ||
        s.toLowerCase() === '.weftlet-coordination',
    )
  )
    throw Error('Unsafe archive path');
  if (parts.some((part) => ['work', 'scip-retirements-v1', 'scip-retirement-staging-v1'].includes(part.toLowerCase())))
    throw Error('Reserved archive path');
}
function portablePath(path: string) {
  checkComponents(path);
  if (
    !['snapshot', 'head', 'comparison-receipt', 'semantic-artifact', 'mapping-proposal', 'scip-index'].includes(
      cacheLayout(path).category,
    ) &&
    !/(^|\/)scip\/refs-v1\/[^/]+\.ref\/reference\.json$/.test(path) &&
    !/^scip-blobs-v1\/[a-f0-9]{64}\/index\.scip$/.test(path)
  )
    throw Error('Unknown archive payload');
}
function verifyPlan(plan: ArchivePlan, expected: string) {
  const { planId, ...body } = plan;
  if (
    body.format !== 'weftlet-cache-archive-v1' ||
    !/^[a-f0-9]{64}$/.test(expected) ||
    planId !== expected ||
    persistedJsonDigest(body) !== expected
  )
    throw Error('Archive plan changed or is unsupported');
  if (
    !plan.limits ||
    Object.keys(plan.limits).sort().join(',') !== 'maxBytes,maxEntries' ||
    !Array.isArray(plan.files) ||
    !Array.isArray(plan.generations) ||
    !plan.generations.length
  )
    throw Error('Invalid archive inventory limits or generation list');
  inventoryLimits(plan.limits);
  const policy = parseRetentionPolicy(plan.policy);
  const profiles = new Set(policy.profiles.map((p) => p.path));
  for (const profile of profiles) if (profile !== '.') checkComponents(profile);
  const names = new Set<string>();
  let total = 0;
  for (const file of plan.files) {
    portablePath(file.path);
    const key = file.path.toLowerCase();
    if (names.has(key) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256))
      throw Error('Ambiguous archive entry');
    names.add(key);
    total += file.bytes;
  }
  const payload = new Set(plan.files.map((f) => f.path));
  const generations = new Set<string>();
  for (const g of plan.generations) {
    if (!profiles.has(g.profile) || policy.profiles.find((p) => p.path === g.profile)?.repositoryId !== g.repositoryId)
      throw Error('Unrecognized archive generation owner');
    const matching = [false, true].some((legacy) => {
      const name = basename(snapshotPath('.', g.snapshotId, legacy));
      return payload.has([g.profile === '.' ? '' : g.profile, 'snapshots', name].filter(Boolean).join('/'));
    });
    const key = JSON.stringify([g.profile, g.snapshotId]);
    if (!matching || generations.has(key)) throw Error('Missing or ambiguous archive generation');
    generations.add(key);
  }
  if (!Number.isSafeInteger(total) || total !== plan.payloadBytes) throw Error('Invalid archive size');
}
async function copyFiles(plan: ArchivePlan, from: string, to: string, signal?: AbortSignal) {
  await transferDirectory(to);
  await requireFreeSpace(to, plan.payloadBytes);
  for (const f of plan.files) {
    signal?.throwIfAborted();
    const dest = join(to, f.path);
    await transferDirectory(dirname(dest));
    await requireFreeSpace(to, f.bytes);
    const copied = await copyTransferFile(join(from, f.path), dest, f.bytes, signal);
    const verified = await inspectFileDigest(dest, Math.max(f.bytes, 1), signal);
    if (copied.sha256 !== f.sha256 || copied.bytes !== f.bytes || verified.sha256 !== f.sha256)
      throw Error('Archive payload disagrees with reviewed inventory: ' + f.path);
  }
}
export function createArchive(options: ArchiveOptions, output: string, expected: string) {
  return withRetentionMaintenance(options, async (root, id, scope) => {
    const plan = await archivePlanOwned(root, id, options);
    verifyPlan(plan, expected);
    await freshOutput(output, root, async (stage) => {
      await copyFiles(plan, root, join(stage, 'data'), options.signal);
      await scope.verify();
      await writeFile(join(stage, 'manifest.json'), JSON.stringify(plan), { flag: 'wx', mode: 0o600 });
    });
    return { archive: resolve(output), planId: expected, payloadBytes: plan.payloadBytes, files: plan.files.length };
  });
}
export async function restoreArchive(archive: string, destination: string, expected: string, signal?: AbortSignal) {
  await safeTransferPath(archive, true);
  const plan = (await inspectSmallJson(join(archive, 'manifest.json'), 32 * 1024 ** 2, true)) as ArchivePlan;
  verifyPlan(plan, expected);
  await freshOutput(destination, archive, async (stage) => {
    await copyFiles(plan, join(archive, 'data'), stage, signal);
    for (const profile of plan.policy.profiles) await transferDirectory(join(stage, profile.path));
    const verified = await inventoryCache({
      roots: [stage],
      verify: true,
      maxEntries: plan.limits.maxEntries,
      maxBytes: plan.limits.maxBytes,
      signal,
    });
    if (!verified.complete || verified.danglingHeads.length || verified.objects.some((o) => o.inspection === 'invalid'))
      throw Error('Restored cache failed integrity verification');
    const entries = plan.generations;
    if (!entries.length) throw Error('Missing restored generation');
    // Exercise an ordinary saved query against the restored bytes before making the directory available.
    const sample = entries[0]!;
    const file = plan.files.find(
      (f) => cacheLayout(f.path).profile === sample.profile && cacheLayout(f.path).category === 'snapshot',
    );
    if (!file) throw Error('Unrecognized restored profile');
    const reader = new SnapshotGraphDiscoveryService(new FileSnapshotStore(join(stage, sample.profile)));
    const page = await reader.catalog({ snapshotId: sample.snapshotId, maxNodes: 1 });
    if (page.snapshot.contentDigest !== sample.contentDigest)
      throw Error('Restored historical query identity mismatch');
    signal?.throwIfAborted();
    await enableCacheCoordination(stage, { acknowledgeQuiescence: true });
  });
  return {
    root: resolve(destination),
    archivePlanId: expected,
    restoredFiles: plan.files.length,
    restoredSnapshots: plan.generations.length,
    sampleSnapshot: plan.generations[0]!.snapshotId,
    activation: 'explicit-user-cache-environment' as const,
  };
}

/** Quiescent cutover qualification. Each client explicitly selects the returned location on restart. */
export async function checkCutover(options: ArchiveOptions, destination: string, expected: string, quiescent: boolean) {
  if (!quiescent) throw Error('Stop all clients before verifying user-cache cutover');
  await safeTransferPath(destination, true);
  const target = await realpath(destination);
  return withRetentionMaintenance(options, async (root, id, scope) => {
    if (contained(root, target) || contained(target, root))
      throw Error('Select independent source and destination roots');
    const original = await archivePlanOwned(root, id, options);
    verifyPlan(original, expected);
    if (
      !original.userProfiles.length ||
      !original.generations.some((g) => original.userProfiles.includes(g.profile)) ||
      original.policy.activeScopes.some((s) => !original.userProfiles.includes(s.profile))
    )
      throw Error(
        'Cutover requires a producing user-scoped --config for each active profile, including a restored generation',
      );
    if (original.excluded.some((f) => !['source-audit-history', 'temporary'].includes(f.category)))
      throw Error(
        'Whole-cache cutover requires every historical graph, bookmark and semantic artifact. Review undeclared profiles and --include-cold-semantic.',
      );
    return withRetentionMaintenance({ ...options, root: target }, async (to, toId, destinationScope) => {
      if (id === toId) throw Error('Restored cache must have an independent coordination identity');
      const restored = await archivePlanOwned(to, toId, options);
      if (
        persistedJsonDigest(original.policy) !== persistedJsonDigest(restored.policy) ||
        persistedJsonDigest(original.userProfiles) !== persistedJsonDigest(restored.userProfiles) ||
        persistedJsonDigest(original.policy) !==
          persistedJsonDigest(parseRetentionPolicy((await options.readPolicy?.()) ?? options.policy)) ||
        persistedJsonDigest(original.files) !== persistedJsonDigest(restored.files) ||
        persistedJsonDigest(original.generations) !== persistedJsonDigest(restored.generations) ||
        restored.excluded.some((e) => e.category !== 'source-audit-history')
      )
        throw Error('Restored cache diverges from the approved archive');
      await destinationScope.verify();
      await scope.verify();
      return {
        source: root,
        destination: target,
        rootId: toId,
        planId: expected,
        environment: { WEFTLET_USER_CACHE_ROOT: target },
        savedGenerations: original.generations.length,
        verifiedUserProfiles: original.userProfiles,
        sourceRetained: true,
        action: 'Restart every CLI, MCP and CI client with this environment before resuming writes.',
      };
    });
  });
}
