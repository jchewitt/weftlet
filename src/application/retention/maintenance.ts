import { maintainRetention } from '../../storage/retention/maintenance.js';
import { readRetentionPolicy } from '../../storage/retention/policy.js';
import { retentionInputs } from './inputs.js';

export async function recurringRetentionOperation(options: {
  root: string; policyPath: string; expectedRoot: string; expectedPolicy: string;
  maxEntries?: number; maxBytes?: number; timeoutMs?: number; signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}) {
  const root = await retentionInputs(options.root, [options.policyPath]);
  const readPolicy = () => readRetentionPolicy(options.policyPath), policy = await readPolicy();
  return maintainRetention({ ...options, root, policy, readPolicy });
}
