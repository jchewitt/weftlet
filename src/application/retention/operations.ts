import { applyIndexMigration, prepareIndexMigration } from '../../storage/retention/index-migration.js';
import { applyRetention } from '../../storage/retention/apply.js';
import { prepareRetention } from '../../storage/retention/prepared.js';
import { dirname, resolve } from 'node:path';
import { retentionInputs } from './inputs.js';
import { writeFile } from 'node:fs/promises';
import { transferDirectory, safeTransferPath } from '../../storage/transfer-files.js';
import { inspectSmallJson } from '../../storage/inspection/read.js';
import { emptyRetentionPolicy, readRetentionPolicy, parseRetentionPolicy } from '../../storage/retention/policy.js';
import { checkRetentionPlan, planRetention } from '../../storage/retention/plan.js';

export async function initializeRetentionPolicy(file: string, options: { targetBytes?: number; keepIndefinitely?: boolean } = {}) {
  if (options.targetBytes !== undefined && options.keepIndefinitely) throw Error('Choose a history target or indefinite retention');
  const policy = emptyRetentionPolicy();
  if (options.targetBytes !== undefined) policy.history = { mode: 'target', maxBytes: options.targetBytes };
  else if (options.keepIndefinitely) policy.history = { mode: 'indefinite' };
  parseRetentionPolicy(policy);
  const path = resolve(file);
  await transferDirectory(dirname(path)); await safeTransferPath(path, false, true);
  await writeFile(path, JSON.stringify(policy, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { schemaVersion: 1, policyPath: path, initialized: true,
    next: 'Declare managed profiles, active heads, previous generations and explicit pins before requesting a review plan. Existing heads remain protected by default.' };
}
export async function retentionOperation(operation: 'plan' | 'check', options: {
  root: string; policyPath: string; planPath?: string; maxEntries?: number; maxBytes?: number;
  signal?: AbortSignal; onProgress?: (done: number, total: number) => void;
}) {
  const policy = await readRetentionPolicy(options.policyPath);
  const common = { ...options, policy };
  if (operation === 'plan') return planRetention(common);
  if (!options.planPath) throw Error('Retention check requires --plan');
  const saved = await inspectSmallJson(options.planPath, 64 * 1024 ** 2, true);
  // Retain the saved scan limits unless the operator explicitly changes them.
  const limits = saved && typeof saved === 'object' && 'limits' in saved ? saved.limits as { maxEntries?: number; maxBytes?: number } : {};
  return checkRetentionPlan(saved, { ...common, maxEntries: options.maxEntries ?? limits?.maxEntries,
    maxBytes: options.maxBytes ?? limits?.maxBytes });
}

/** These operations require an explicitly activated root and external policy/plan files. */
export async function coordinatedRetentionOperation(operation: 'prepare' | 'apply', options: {
  root: string; policyPath: string; planPath?: string; expectedPlan?: string; maxEntries?: number; maxBytes?: number; timeoutMs?: number;
  signal?: AbortSignal; onProgress?: (done: number, total: number) => void;
}) {
  const root = await retentionInputs(options.root, [options.policyPath, options.planPath].filter((path): path is string => !!path));
  const readPolicy = () => readRetentionPolicy(options.policyPath), policy = await readPolicy();
  const common = { ...options, root, policy, readPolicy };
  if (operation === 'prepare') return prepareRetention(common);
  if (!options.planPath || !options.expectedPlan) throw Error('Removal requires --plan and --expect-plan');
  const saved = await inspectSmallJson(options.planPath, 64 * 1024 ** 2, true);
  return applyRetention(saved, options.expectedPlan, common);
}

export async function indexMigrationOperation(operation: 'prepare-index-migration' | 'apply-index-migration', options: {
  root: string; policyPath: string; planPath?: string; expectedPlan?: string; maxEntries?: number; maxBytes?: number;
  timeoutMs?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void;
}) {
  const root = await retentionInputs(options.root, [options.policyPath, options.planPath].filter((path): path is string => !!path));
  const readPolicy = () => readRetentionPolicy(options.policyPath);
  const common = { ...options, root, policy: await readPolicy(), readPolicy };
  if (operation === 'prepare-index-migration') return prepareIndexMigration(common);
  if (!options.planPath || !options.expectedPlan) throw Error('Index migration requires --plan and --expect-plan');
  const saved = await inspectSmallJson(options.planPath, 64 * 1024 ** 2, true);
  return applyIndexMigration(saved, options.expectedPlan, common);
}
