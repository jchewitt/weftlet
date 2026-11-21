import { isCoordinationObject, isTransientControl, sumBytes } from './history-accounting.js';
import { realpath, readdir } from 'node:fs/promises';
import { join, resolve, parse } from 'node:path';
import { persistedJsonDigest } from '@weftlet/core';
import { withCacheMaintenance, type CacheAccessOptions, type CacheMaintenanceScope } from '../coordination/access.js';
import { managedRootForPath, type ManagedCacheRoot } from '../coordination/managed-root.js';
import { safeTransferPath } from '../transfer-files.js';
import { inventoryCache } from '../inspection/inventory.js';
import { inspectSmallJson } from '../inspection/read.js';
import { parseRetentionPolicy, type RetentionPolicy } from './policy.js';
import { probeGradleScratch } from './gradle-scratch.js';
import { evaluateRetention } from './evaluate.js';

export interface PreparedRetentionOptions extends CacheAccessOptions {
  root: string; policy: RetentionPolicy; maxEntries?: number; maxBytes?: number;
  readPolicy?: () => Promise<RetentionPolicy>;
  onProgress?: (done: number, total: number) => void;
}
export async function withRetentionMaintenance<T>(options: PreparedRetentionOptions,
  run: (root: string, rootId: string, scope: CacheMaintenanceScope) => Promise<T>) {
  await safeTransferPath(resolve(options.root), true);
  const root = await realpath(options.root);
  if (root === parse(root).root) throw Error('Select a dedicated managed cache, not a filesystem root');
  if (await managedRootForPath(root) !== root) throw Error('Retention removal requires the exact explicitly activated managed root');
  const readOwner = async () => (await inspectSmallJson(join(root, '.weftlet-coordination/root.json'), 4096, true) as ManagedCacheRoot).rootId;
  const rootId = await readOwner();
  return withCacheMaintenance(root, async scope => {
    const verify = async () => {
      await scope.verify();
      if (await managedRootForPath(root) !== root || await readOwner() !== rootId) throw Error('Managed cache ownership changed');
    };
    await verify();
    return run(root, rootId, { verify });
  }, options);
}

/** Called only while owning exclusive maintenance. Pending journal state is never guessed away. */
export async function prepareRetentionOwned(options: PreparedRetentionOptions, root: string, rootId: string) {
  const policy = parseRetentionPolicy(structuredClone(await options.readPolicy?.() ?? options.policy));
  const journalRoot = join(root, '.weftlet-coordination/removals');
  await safeTransferPath(journalRoot, true, true);
  try {
    if ((await readdir(journalRoot)).some(name => name.endsWith('.pending'))) throw Error('An incomplete removal journal requires explicit recovery; no operation was resumed');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const inventory = await inventoryCache({ ...options, roots: [root], verify: true });
  const reservedControlBytes = sumBytes(inventory.objects.filter(o => isCoordinationObject(o.path) && !isTransientControl(o.path)).map(o => o.logicalBytes));
  const nestedOwners = inventory.objects.filter(o => o.path !== '.weftlet-coordination/root.json' && o.path.endsWith('/.weftlet-coordination/root.json'));
  // Activity/journal churn belongs to this exclusive operation, never the evidence file set.
  // Directory identity stays bound; entry enumeration catches additions/removals independently.
  inventory.objects = inventory.objects.filter(o => o.path !== '.weftlet-coordination' && !o.path.startsWith('.weftlet-coordination/'))
    .map(o => o.kind === 'directory' ? { ...o, revision: o.physicalIdentity ?? 'unknown', modifiedAt: '', allocatedBytes: null, linkCount: 0 } : o);
  const idleScratch = await probeGradleScratch(inventory.objects, policy, options.signal);
  const review = evaluateRetention(inventory, policy, Date.now(), reservedControlBytes, idleScratch);
  for (const owner of nestedOwners) review.issues.push({ code: 'nested-managed-owner', path: owner.path });
  for (const dir of inventory.objects.filter(o => o.kind === 'directory' && !o.physicalIdentity)) review.issues.push({ code: 'unknown-directory-identity', path: dir.path });
  const candidates = review.objects.filter(o => o.disposition === 'candidate');
  if (candidates.length > 10_000) review.issues.push({ code: 'removal-batch-exceeds-10000-files', path: '.' });
  const body = { schemaVersion: 1, kind: 'coordinated-retention-plan', plannerVersion: 'coordinated-removal-v4', root, rootId,
    policy, policyDigest: persistedJsonDigest(policy), limits: { maxEntries: inventory.maxEntries, maxBytes: inventory.maxInspectionBytesPerFile },
    stateDigest: persistedJsonDigest(inventory.objects), canApply: review.issues.length === 0,
    issues: review.issues.sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en')),
    verifiedIdleGradleLocks: idleScratch.size, ...(review.completions.length ? { completions: review.completions } : {}), pins: review.pins, objects: review.objects, history: review.history,
    totals: { candidateFiles: candidates.length, candidateLogicalBytes: candidates.reduce((n, c) => n + c.logicalBytes, 0) },
    limitations: ['Apply rechecks this exact plan, policy and evidence under exclusive coordination; this is not automatic retention.',
      'Eligible files are reviewed unshared snapshots, explicitly retired heads and opted-in verified companion indexes. Unattributed indexes, semantic artifacts and receipts remain.',
      'The root coordination subtree is reserved and excluded from evidence state; its journals and interrupted owners are not removal candidates.',
      'Full hashes/JSON do not rerun SHACL or establish exact historical rebuild availability. Declared pins must cover externally required evidence.',
      'Removal is permanent, may complete partially, and does not promise freed allocated bytes. No archive or provider call is performed.'] };
  return { ...body, preparedAt: new Date().toISOString(), planId: persistedJsonDigest(body) };
}
export type PreparedRetentionPlan = Awaited<ReturnType<typeof prepareRetentionOwned>>;
export function prepareRetention(options: PreparedRetentionOptions) {
  return withRetentionMaintenance(options, (root, rootId) => prepareRetentionOwned(options, root, rootId));
}
export function assertPreparedPlan(saved: unknown, expected: string): asserts saved is PreparedRetentionPlan {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw Error('Expected a coordinated retention plan');
  const { preparedAt: _time, planId, ...body } = saved as Record<string, unknown>;
  if (body.schemaVersion !== 1 || body.kind !== 'coordinated-retention-plan' || body.plannerVersion !== 'coordinated-removal-v4' ||
    typeof planId !== 'string' || planId !== expected || persistedJsonDigest(body) !== planId) throw Error('Prepared retention plan is unsupported, edited or does not match --expect-plan');
}
