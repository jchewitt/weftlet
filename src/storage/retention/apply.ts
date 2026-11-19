import { assertPreparedPlan, prepareRetentionOwned, withRetentionMaintenance, type PreparedRetentionOptions } from './prepared.js';
import { executeRetentionOwned } from './owned-removal.js';

/** Never applies observational reports. Every decision is recomputed before the first destructive action. */
export async function applyRetention(saved: unknown, expected: string, options: PreparedRetentionOptions) {
  assertPreparedPlan(saved, expected);
  const bounded = { ...options, maxEntries: saved.limits.maxEntries, maxBytes: saved.limits.maxBytes };
  return withRetentionMaintenance(bounded, async (root, rootId, scope) => {
    const current = await prepareRetentionOwned(bounded, root, rootId);
    if (!current.canApply || current.planId !== saved.planId) throw Error('Prepared retention plan is stale or blocked; prepare and review a new plan');
    return executeRetentionOwned(current, bounded, scope);
  });
}
