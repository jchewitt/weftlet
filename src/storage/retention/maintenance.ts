import { persistedJsonDigest } from '@weftlet/core';
import { parseRetentionPolicy } from './policy.js';
import { prepareRetentionOwned, withRetentionMaintenance, type PreparedRetentionOptions } from './prepared.js';
import { executeRetentionOwned } from './owned-removal.js';

export interface RecurringRetentionOptions extends PreparedRetentionOptions {
  expectedRoot: string;
  expectedPolicy: string;
}
/** Explicit policy authorization permits fresh snapshot selection, never implicit head retirement. */
export async function maintainRetention(options: RecurringRetentionOptions) {
  if (!options.expectedRoot || !/^[a-f0-9]{64}$/.test(options.expectedPolicy)) throw Error('Recurring maintenance requires the reviewed --expect-root and --expect-policy from preparation');
  return withRetentionMaintenance(options, async (root, rootId, scope) => {
    if (rootId !== options.expectedRoot) throw Error('Managed root does not match --expect-root; review this cache before maintenance');
    const readPolicy = async () => {
      const policy = parseRetentionPolicy(structuredClone(await options.readPolicy?.() ?? options.policy));
      if (persistedJsonDigest(policy) !== options.expectedPolicy) throw Error('Retention policy does not match --expect-policy; review the changed policy');
      if (!policy.history || policy.releasedHeads.length) throw Error('Recurring maintenance requires configured history and no releasedHeads; finish one-time reviewed migration first');
      return policy;
    };
    const policy = await readPolicy(), bounded = { ...options, policy, readPolicy };
    const current = await prepareRetentionOwned(bounded, root, rootId);
    if (!current.canApply) throw Error('Recurring retention is blocked; prepare --json to inspect current inventory and declarations');
    if (current.objects.some(o => o.disposition === 'candidate' && o.category !== 'snapshot' && !(policy.retireCompanionIndexes && o.category === 'scip-index'))) throw Error('Recurring retention cannot retire heads');
    const removal = await executeRetentionOwned(current, bounded, scope);
    return { schemaVersion: 1, kind: 'retention-maintenance-result' as const, rootId, policyDigest: current.policyDigest,
      status: removal.status, history: current.history, removal };
  });
}
