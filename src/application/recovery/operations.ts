import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { inspectSmallJson } from '../../storage/inspection/read.js';
import { safeTransferPath } from '../../storage/transfer-files.js';
import { applyRecovery } from '../../storage/recovery/apply.js';
import { planRecovery, type RecoveryOptions } from '../../storage/recovery/plan.js';

export async function recoveryOperation(operation: 'plan' | 'apply', options: RecoveryOptions & {
  planPath?: string; expectedPlan?: string; acknowledgeQuiescence?: boolean;
}) {
  if (operation === 'plan') return planRecovery(options);
  if (!options.planPath || !options.expectedPlan) throw Error('Recovery requires --plan and --expect-plan');
  await safeTransferPath(resolve(options.root), true);
  const root = await realpath(options.root), input = await realpath(options.planPath), local = relative(root, input);
  if (!local || (!isAbsolute(local) && local !== '..' && !local.startsWith(`..${sep}`))) throw Error('Keep the recovery plan outside the cache');
  const saved = await inspectSmallJson(input, 32 * 1024 ** 2, true);
  return applyRecovery(saved, options.expectedPlan, { ...options, acknowledgeQuiescence: options.acknowledgeQuiescence === true });
}
