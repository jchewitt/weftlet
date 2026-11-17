import { initializeRetentionPolicy, retentionOperation } from '../application/retention/operations.js';

const usage = 'cache retention init --file <policy.json> | plan --root <cache> --policy <policy.json> [--json] | check --root <cache> --policy <policy.json> --plan <saved-plan.json> [--json]. Review only; no apply/delete command.';
function argumentsFor(args: readonly string[]) {
  const operation = args[2];
  if (!['init', 'plan', 'check'].includes(operation ?? '')) throw Error(usage);
  const allowed = operation === 'init' ? ['--file'] : ['--root', '--policy', '--max-entries', '--max-bytes', ...(operation === 'check' ? ['--plan'] : [])];
  const values = new Map<string, string>(); let json = false, quiet = false;
  for (let i = 3; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--json' && !json) json = true;
    else if (arg === '--quiet' && !quiet) quiet = true;
    else if (allowed.includes(arg) && !values.has(arg) && args[i + 1] && !args[i + 1]!.startsWith('--')) values.set(arg, args[++i]!);
    else throw Error(usage);
  }
  const required = operation === 'init' ? ['--file'] : ['--root', '--policy', ...(operation === 'check' ? ['--plan'] : [])];
  if (required.some(key => !values.has(key))) throw Error(usage);
  const integer = (name: string) => {
    const value = values.get(name); if (value === undefined) return;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw Error('Retention scan limits must be positive safe integers');
    return Number(value);
  };
  return { operation: operation as 'init' | 'plan' | 'check', values, json, quiet, integer };
}
export async function runCacheRetention(args: readonly string[]) {
  if (args[0] !== 'cache' || args[1] !== 'retention') return false;
  const { operation, values, json, quiet, integer } = argumentsFor(args);
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  let lastProgress = 0;
  try {
    const result = operation === 'init' ? await initializeRetentionPolicy(values.get('--file')!) : await retentionOperation(operation, {
      root: values.get('--root')!, policyPath: values.get('--policy')!, planPath: values.get('--plan'),
      maxEntries: integer('--max-entries'), maxBytes: integer('--max-bytes'), signal: controller.signal,
      onProgress(done, total) { if (!quiet && Date.now() - lastProgress >= 5000) { lastProgress = Date.now(); process.stderr.write(`[weftlet] retention inventory ${done}/${total} entries\n`); } },
    });
    process.stdout.write(json ? JSON.stringify(result, null, 2) + '\n' : format(result));
    if ('readyForReview' in result && !result.readyForReview || 'unchanged' in result && !result.unchanged) process.exitCode = 1;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
  return true;
}
function format(result: Awaited<ReturnType<typeof initializeRetentionPolicy>> | Awaited<ReturnType<typeof retentionOperation>>) {
  if ('policyPath' in result) return `Created ${result.policyPath}\n${result.next}\n`;
  if ('unchanged' in result) return `Retention plan ${result.unchanged ? 'unchanged' : 'STALE'}; review ${result.readyForReview ? 'ready' : 'blocked'}. No deletion is enabled.\n`;
  return `Retention review ${result.readyForReview ? 'ready' : 'blocked'}: ${result.totals.candidateFiles} candidate files, ${result.totals.candidateLogicalBytes} logical bytes.\nPlan: ${result.planId}\n${result.issues.length} issues; use --json for per-object reasons, dependencies, declarations and recovery limits. No deletion is enabled.\n`;
}
