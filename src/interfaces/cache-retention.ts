import { previewIndexSharing } from '../storage/retention/index-sharing-preview.js';
import { readRetentionPolicy } from '../storage/retention/policy.js';
import { recurringRetentionOperation } from '../application/retention/maintenance.js';
import { initializeRetentionPolicy, retentionOperation, coordinatedRetentionOperation } from '../application/retention/operations.js';

const usage = 'cache retention init --file <policy.json> [--target-bytes <n>|--keep-indefinitely] | preview-index-sharing --root <managed-cache> --policy <file> [--json] | plan --root <cache> --policy <policy.json> [--json] | check --root <cache> --policy <policy.json> --plan <saved-plan.json> [--json] | prepare --root <managed-cache> --policy <file> [--json] | apply --root <managed-cache> --policy <file> --plan <prepared.json> --expect-plan <id> [--json] | maintain --root <managed-cache> --policy <file> --expect-root <id> --expect-policy <digest> [--json]. Apply removes reviewed history; maintain permanently removes history under the reviewed policy on each invocation.';
const scanFlags = ['--max-entries', '--max-bytes'];
const rootPolicy = ['--root', '--policy'];
const operationFlags = {
  init: { required: ['--file'], optional: ['--target-bytes'] },
  'preview-index-sharing': { required: rootPolicy, optional: scanFlags },
  plan: { required: rootPolicy, optional: scanFlags },
  check: { required: [...rootPolicy, '--plan'], optional: scanFlags },
  prepare: { required: rootPolicy, optional: [...scanFlags, '--wait-ms'] },
  maintain: { required: [...rootPolicy, '--expect-root', '--expect-policy'], optional: [...scanFlags, '--wait-ms'] },
  apply: { required: [...rootPolicy, '--plan', '--expect-plan'], optional: ['--wait-ms'] },
};
function argumentsFor(args: readonly string[]) {
  if (!args[2] || !Object.hasOwn(operationFlags, args[2])) throw Error(usage);
  const operation = args[2] as keyof typeof operationFlags;
  const { required, optional } = operationFlags[operation], allowed: string[] = [...required, ...optional];
  const values = new Map<string, string>(); let json = false, quiet = false, keepIndefinitely = false;
  for (let i = 3; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--keep-indefinitely' && operation === 'init' && !keepIndefinitely) keepIndefinitely = true;
    else if (arg === '--json' && !json) json = true;
    else if (arg === '--quiet' && !quiet) quiet = true;
    else if (allowed.includes(arg) && !values.has(arg) && args[i + 1] && !args[i + 1]!.startsWith('--')) values.set(arg, args[++i]!);
    else throw Error(usage);
  }
  if (required.some(key => !values.has(key))) throw Error(usage);
  const integer = (name: string) => {
    const value = values.get(name); if (value === undefined) return;
    if (!(name === '--target-bytes' ? /^(?:0|[1-9]\d*)$/ : /^[1-9]\d*$/).test(value) || !Number.isSafeInteger(Number(value))) throw Error('Retention scan limits must be positive safe integers; target bytes may be zero');
    return Number(value);
  };
  return { operation, values, json, quiet, integer, keepIndefinitely };
}
export async function runCacheRetention(args: readonly string[]) {
  if (args[0] !== 'cache' || args[1] !== 'retention') return false;
  const { operation, values, json, quiet, integer, keepIndefinitely } = argumentsFor(args);
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  let lastProgress = 0;
  try {
    const options = {
      root: values.get('--root')!, policyPath: values.get('--policy')!, planPath: values.get('--plan'), expectedPlan: values.get('--expect-plan'),
      maxEntries: integer('--max-entries'), maxBytes: integer('--max-bytes'), timeoutMs: integer('--wait-ms'), signal: controller.signal,
      onProgress(done: number, total: number) { if (!quiet && Date.now() - lastProgress >= 5000) { lastProgress = Date.now(); process.stderr.write(`[weftlet] retention inventory ${done}/${total} entries\n`); } },
    };
    if (operation === 'preview-index-sharing') {
      const report = await previewIndexSharing({ ...options, policy: await readRetentionPolicy(options.policyPath) });
      process.stdout.write(json ? JSON.stringify(report, null, 2) + '\n' :
        `Verified ${report.verifiedGenerations} of ${report.observedLegacyIndexes} legacy indexes. ` +
        `Projected savings across positive groups: ${report.positiveGroupLogicalSavings ?? 'unknown'} logical bytes.\n` +
        'Use --json for groups, exclusions, head references and pins. This preview preserves cache evidence.\n');
      if (!report.complete) process.exitCode = 1;
      return true;
    }
    const result = operation === 'init' ? await initializeRetentionPolicy(values.get('--file')!, { targetBytes: integer('--target-bytes'), keepIndefinitely }) :
      operation === 'maintain' ? await recurringRetentionOperation({ ...options, expectedRoot: values.get('--expect-root')!, expectedPolicy: values.get('--expect-policy')! }) :
      operation === 'prepare' || operation === 'apply' ? await coordinatedRetentionOperation(operation, options) : await retentionOperation(operation, options);
    process.stdout.write(json ? JSON.stringify(result, null, 2) + '\n' : format(result));
    if ('status' in result && result.status !== 'complete' || 'rootId' in result && 'canApply' in result && !result.canApply || 'readyForReview' in result && !result.readyForReview || 'unchanged' in result && !result.unchanged) process.exitCode = 1;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
  return true;
}
function format(result: Awaited<ReturnType<typeof initializeRetentionPolicy>> | Awaited<ReturnType<typeof retentionOperation>> | Awaited<ReturnType<typeof coordinatedRetentionOperation>> | Awaited<ReturnType<typeof recurringRetentionOperation>>) {
  if ('removal' in result) return `Recurring retention ${result.status}: ${result.removal.deleted.length} snapshots, ${result.removal.deletedLogicalBytes} logical bytes removed.\n${historySummary(result.history)}${result.removal.journalPath ? `Journal: ${result.removal.journalPath}` : 'No-op: no removal journal created.'}\nProjected bytes exclude new journal overhead; use cache usage for a fresh observation.\n`;
  if ('status' in result) return `Retention removal ${result.status}: ${result.deleted.length} files, ${result.deletedLogicalBytes} logical bytes removed.\n${result.journalPath ? `Journal: ${result.journalPath}` : 'No-op: no removal journal created.'}\n`;
  if ('rootId' in result) return `Coordinated retention ${result.canApply ? 'prepared' : 'blocked'}: ${result.totals.candidateFiles} candidate files, ${result.totals.candidateLogicalBytes} logical bytes.\nPlan: ${result.planId}\n${historySummary(result.history)}Review --json before explicit apply; preparation removes no evidence.\n`;
  if ('policyPath' in result) return `Created ${result.policyPath}\n${result.next}\n`;
  if ('unchanged' in result) return `Retention plan ${result.unchanged ? 'unchanged' : 'STALE'}; review ${result.readyForReview ? 'ready' : 'blocked'}. This observational report cannot be applied.\n`;
  return `Retention review ${result.readyForReview ? 'ready' : 'blocked'}: ${result.totals.candidateFiles} candidate files, ${result.totals.candidateLogicalBytes} logical bytes.\nPlan: ${result.planId}\n${historySummary(result.history)}${result.issues.length} issues; use --json for per-object reasons, dependencies, declarations and recovery limits. This observational report cannot be applied.\n`;
}

function historySummary(history: { mode: string; root: { projectedBytes: number; projectedOverageBytes: number; protectedOverageBytes: number } }) {
  return `History policy: ${history.mode}; projected retained ${history.root.projectedBytes} logical bytes; projected overage ${history.root.projectedOverageBytes}; protected minimum overage ${history.root.protectedOverageBytes}.\n`;
}
