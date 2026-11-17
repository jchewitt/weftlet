import { dirname, resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { transferDirectory, safeTransferPath } from '../../storage/transfer-files.js';
import { inspectSmallJson } from '../../storage/inspection/read.js';
import { emptyRetentionPolicy, readRetentionPolicy } from '../../storage/retention/policy.js';
import { checkRetentionPlan, planRetention } from '../../storage/retention/plan.js';

export async function initializeRetentionPolicy(file: string) {
  const path = resolve(file);
  await transferDirectory(dirname(path)); await safeTransferPath(path, false, true);
  await writeFile(path, JSON.stringify(emptyRetentionPolicy(), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
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
