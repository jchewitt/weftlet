import { recoveryOperation } from '../application/recovery/operations.js';
const usage = 'cache recovery plan --root <managed-cache> [--max-entries <n>] [--max-bytes <n>] | apply --root <managed-cache> --plan <external.json> --expect-plan <id> --acknowledge-quiescence. JSON output; stop all cache clients before recovery.';
export async function runCacheRecovery(args: readonly string[]) {
  if (args[0] !== 'cache' || args[1] !== 'recovery') return false;
  const operation = args[2];
  if (operation !== 'plan' && operation !== 'apply') throw Error(usage);
  const allowed = operation === 'plan' ? ['--root', '--max-entries', '--max-bytes'] : ['--root', '--plan', '--expect-plan'];
  const values = new Map<string, string>(); let acknowledgeQuiescence = false, json = false;
  for (let i = 3; i < args.length; i++) {
    const flag = args[i]!;
    if (flag === '--acknowledge-quiescence' && operation === 'apply' && !acknowledgeQuiescence) acknowledgeQuiescence = true;
    else if (flag === '--json' && !json) json = true;
    else if (allowed.includes(flag) && !values.has(flag) && args[i + 1] && !args[i + 1]!.startsWith('--')) values.set(flag, args[++i]!);
    else throw Error(usage);
  }
  if (!values.has('--root')) throw Error(usage);
  const integer = (flag: string) => {
    const value = values.get(flag); if (value === undefined) return;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw Error('Recovery scan limits must be positive safe integers');
    return Number(value);
  };
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const result = await recoveryOperation(operation, { root: values.get('--root')!, planPath: values.get('--plan'),
      expectedPlan: values.get('--expect-plan'), acknowledgeQuiescence, maxEntries: integer('--max-entries'), maxBytes: integer('--max-bytes'), signal: controller.signal });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if ('canApply' in result && !result.canApply) process.exitCode = 1;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
  return true;
}
