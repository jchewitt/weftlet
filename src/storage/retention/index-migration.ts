import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { persistedJsonDigest } from '@weftlet/core';
import { revision } from '../recovery/state.js';
import { inventoryLimits } from '../inspection/inventory.js';
import { installLegacyScipBlob, previewScipBlob, previewScipReference, publishScipReference } from '../shared-scip.js';
import { safeTransferPath } from '../transfer-files.js';
import { inspectIndexSharing } from './index-sharing-preview.js';
import { parseRetentionPolicy } from './policy.js';
import { assertNoPendingRemoval, withRetentionMaintenance, type PreparedRetentionOptions } from './prepared.js';
import { executeJournaledRemoval } from './owned-removal.js';
import { isCoordinationObject } from './history-accounting.js';
import { migrationFitsRecovery } from './migration-capacity.js';
import { probeGradleScratch } from './gradle-scratch.js';

async function prepareOwned(root: string, rootId: string, options: PreparedRetentionOptions) {
  await assertNoPendingRemoval(root);
  const policy = parseRetentionPolicy(await options.readPolicy?.() ?? options.policy);
  const { report, inventory } = await inspectIndexSharing(root, { ...options, policy });
  const objects = inventory.objects.filter(o => !isCoordinationObject(o.path));
  const { blockers } = await probeGradleScratch(objects, policy, rootId, options.signal);
  const issues = [...report.issues, ...Array.from(blockers, ([path, code]) => ({ path, code }))];
  for (const o of objects) if (o.category === 'lease-marker') issues.push({ path: o.path, code: 'operation-lease-marker' });
  const byPath = new Map(objects.map(o => [o.path, o]));
  const groups = report.groups.filter(g => g.projectedLogicalSavings > 0).map(group => ({
    ...group, members: group.members.map(m => ({ ...m,
      indexRevision: byPath.get(m.indexPath)!.revision, snapshotRevision: byPath.get(m.snapshotPath)!.revision,
      snapshotSha256: byPath.get(m.snapshotPath)!.sha256! })),
  }));
  const members = groups.flatMap(g => g.members);
  if (!migrationFitsRecovery(root, inventory.objects, members)) issues.push({ path: '.', code: 'insufficient-recovery-capacity' });
  if (members.length > 10_000) issues.push({ path: '.', code: 'migration-batch-exceeds-10000-files' });
  const body = { schemaVersion: 1, kind: 'scip-index-migration-v1', root, rootId, policyDigest: persistedJsonDigest(policy),
    limits: inventoryLimits(options), groups, issues, excluded: report.excluded, canApply: !issues.length,
    projectedLogicalSavings: report.positiveGroupLogicalSavings };
  return { ...body, planId: persistedJsonDigest(body) };
}

export function prepareIndexMigration(options: PreparedRetentionOptions) {
  return withRetentionMaintenance(options, (root, rootId) => prepareOwned(root, rootId, options));
}

type Plan = Awaited<ReturnType<typeof prepareOwned>>;
function checkPlan(input: unknown, expected: string): asserts input is Plan {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Expected a prepared index migration');
  const { planId, ...body } = input as Record<string, unknown>;
  if (body.kind !== 'scip-index-migration-v1' || body.schemaVersion !== 1 || planId !== expected ||
      persistedJsonDigest(body) !== planId) throw Error('Index migration plan is unsupported, edited or differs from --expect-plan');
}

export async function applyIndexMigration(saved: unknown, expected: string, options: PreparedRetentionOptions) {
  checkPlan(saved, expected);
  const bounded = { ...options, ...inventoryLimits(saved.limits) };
  return withRetentionMaintenance(bounded, async (root, rootId, scope) => {
    const plan = await prepareOwned(root, rootId, bounded);
    if (!plan.canApply || plan.planId !== expected) throw Error('Index migration is stale or blocked; prepare and review a new plan');
    const members = new Map(plan.groups.flatMap(g => g.members.map(m => [m.indexPath, { ...m, scipIndexDigest: g.digest }] as const)));
    const candidates = [...members.values()].map(m => ({ category: 'scip-index' as const, path: m.indexPath,
      sha256: m.scipIndexDigest, replacement: { snapshotPath: m.snapshotPath, snapshotSha256: m.snapshotSha256 }, revision: m.indexRevision, logicalBytes: m.legacyLogicalBytes, removeBefore: [] }));
    const removal = await executeJournaledRemoval(plan, candidates, bounded, scope, async entry => {
      const m = members.get(entry.path)!;
      await installLegacyScipBlob(root, m.scipIndexDigest, join(root, m.indexPath), m.legacyLogicalBytes, options.signal);
      const verifyGraph = async () => {
        const graph = join(root, m.snapshotPath);
        await safeTransferPath(graph);
        if (revision(await lstat(graph, { bigint: true })) !== m.snapshotRevision) throw Error('Migration graph changed');
      };
      await verifyGraph();
      await publishScipReference(join(root, m.profile), m);
      return async () => {
        await verifyGraph();
        if (!(await previewScipReference(join(root, m.profile), m)).exists ||
            !await previewScipBlob(root, m.scipIndexDigest, bounded.maxBytes, options.signal)) throw Error('Migration replacement changed');
      };
    });
    return { kind: 'scip-index-migration-result', rootId, planId: plan.planId, status: removal.status,
      legacyCopiesRemoved: removal.deleted.length, legacyLogicalBytesRemoved: removal.deletedLogicalBytes,
      projectedLogicalSavings: plan.projectedLogicalSavings, removal };
  });
}
