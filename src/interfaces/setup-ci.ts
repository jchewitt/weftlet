import { applyCiSetup, planCiSetup } from '../application/setup/ci/plan.js';
import type { CiSetupOptions } from '../application/setup/ci/project.js';

function parse(args: readonly string[]) {
  const flags = new Set<string>(), values = new Map<string, string>(), testScripts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (['--checks', '--generate', '--apply', '--dry-run', '--update', '--json'].includes(key)) {
      if (flags.has(key)) throw Error(`Repeated CI setup option: ${key}`);
      flags.add(key); continue;
    }
    if (!['--directory', '--config', '--working-directory', '--build-script', '--test-script', '--architecture-policy', '--runner', '--environment', '--provider-version', '--expect-plan'].includes(key)) throw Error(`Unknown CI setup option: ${key}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw Error(`${key} requires a value`);
    if (key === '--test-script') testScripts.push(value);
    else { if (values.has(key)) throw Error(`Repeated CI setup option: ${key}`); values.set(key, value); }
  }
  if (flags.has('--apply') && flags.has('--dry-run')) throw Error('Choose --apply or --dry-run');
  if (values.has('--expect-plan') && !flags.has('--apply')) throw Error('--expect-plan requires --apply');
  return { flags, values, testScripts };
}
export async function runCiSetup(args: readonly string[]) {
  const { flags, values, testScripts } = parse(args);
  if (!flags.has('--generate') && ['--runner', '--environment', '--provider-version'].some(key => values.has(key))) throw Error('Generation options require --generate');
  const options: CiSetupOptions = { directory: values.get('--directory'), configPath: values.get('--config'), workingDirectory: values.get('--working-directory'),
    checks: flags.has('--checks') || !flags.has('--generate'), generate: flags.has('--generate'), update: flags.has('--update'),
    buildScript: values.get('--build-script'), testScripts, architecturePolicy: values.get('--architecture-policy'),
    runner: values.get('--runner') as CiSetupOptions['runner'], environment: values.get('--environment'), providerVersion: values.get('--provider-version') };
  const preview = await planCiSetup(options);
  const plan = flags.has('--apply') ? await applyCiSetup(options, values.get('--expect-plan') ?? preview.planId) : preview;
  if (flags.has('--json')) process.stdout.write(`${JSON.stringify({ ...plan, applied: flags.has('--apply') }, null, 2)}\n`);
  else process.stdout.write([`CI setup: ${plan.root} (${plan.packageManager}; working directory ${plan.workingDirectory})`,
    `Existing workflows retained: ${plan.existingWorkflows.length}`, ...plan.files.flatMap(file => [`${file.action}: ${file.path}`, file.proposedContent]),
    ...plan.nextSteps, flags.has('--apply') ? 'CI setup applied; no workflow dispatched.' : `Preview only. Apply with the same options, --apply --expect-plan ${plan.planId}`, ''].join('\n'));
  if (!plan.ready) process.exitCode = 1;
}
