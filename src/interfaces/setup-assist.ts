import { resolve } from 'node:path';
import { inspectSetupPath } from '../application/setup/files.js';
import { applyAssistedPlan, assistedInputId, previewAssistedInputs, proposeAssistedSetup, reviewAssistedPlan, saveAssistedPlan } from '../application/setup/assist/plan.js';

function parse(args: readonly string[]) {
  const values = new Map<string, string>(), flags = new Set<string>(), inputs: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const key = args[index]!;
    if (['--allow-model', '--apply', '--accept-authority', '--dry-run', '--json'].includes(key)) {
      if (flags.has(key)) throw Error(`Repeated assisted setup option: ${key}`);
      flags.add(key); continue;
    }
    if (!['--directory', '--config', '--input', '--expect-input', '--output', '--plan', '--expect-plan'].includes(key)) throw Error(`Unknown assisted setup option: ${key}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw Error(`${key} requires a value`);
    if (key === '--input') inputs.push(value);
    else { if (values.has(key)) throw Error(`Repeated assisted setup option: ${key}`); values.set(key, value); }
  }
  return { values, flags, inputs };
}
type Arguments = ReturnType<typeof parse>;
const emit = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

async function reviewOrApply({ values, flags, inputs }: Arguments, root: string) {
  if (inputs.length || values.has('--config') || values.has('--output') || values.has('--expect-input') || flags.has('--allow-model')) throw Error('Review/apply a saved plan separately from model planning');
  if (flags.has('--apply') && flags.has('--dry-run')) throw Error('Choose review or --apply');
  if (!flags.has('--apply') && (flags.has('--accept-authority') || values.has('--expect-plan'))) throw Error('--accept-authority/--expect-plan require --apply');
  const text = await inspectSetupPath(root, values.get('--plan')!, 2_097_152);
  if (text === null) throw Error('Saved proposal is missing');
  let saved;
  try { saved = JSON.parse(text); }
  catch { throw Error('Invalid saved proposal JSON'); }
  if (saved?.request?.directory !== root) throw Error('Saved plan belongs to a different --directory');
  if (flags.has('--apply') && !values.has('--expect-plan')) throw Error('Apply requires the reviewed --expect-plan ID');
  const plan = flags.has('--apply') ? await applyAssistedPlan(saved, values.get('--expect-plan')!, flags.has('--accept-authority')) : (await reviewAssistedPlan(saved)).plan;
  emit({ ...plan, applied: flags.has('--apply') });
}
async function requestProposal(options: Parameters<typeof proposeAssistedSetup>[0], values: Map<string, string>, summary: Awaited<ReturnType<typeof previewAssistedInputs>>) {
  if (!values.has('--expect-input') || !values.has('--output')) throw Error('Model planning requires the reviewed --expect-input and a new --output path');
  const output = values.get('--output')!, root = options.directory!;
  if (!output.endsWith('.json') || await inspectSetupPath(root, output, 2_097_152) !== null) throw Error('Choose a new in-project .json proposal output');
  process.stderr.write(`Weftlet setup: one ${summary.provider} planning request; ${summary.inputBytes} input bytes; no project changes applied.\n`);
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const plan = await proposeAssistedSetup(options, { allowModel: true, expectedInputId: values.get('--expect-input')! }, { signal: controller.signal });
    await saveAssistedPlan(root, output, plan);
    emit({ ...plan, savedTo: output, applied: false, next: 'Review this proposal; apply with --plan <path> --apply --expect-plan <planId>. Authority changes also require --accept-authority.' });
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
export async function runAssistedSetup(args: readonly string[]) {
  const parsed = parse(args), { values, flags, inputs } = parsed, root = resolve(values.get('--directory') ?? '.');
  if (values.has('--plan')) return reviewOrApply(parsed, root);
  if (flags.has('--apply') || flags.has('--accept-authority') || values.has('--expect-plan')) throw Error('Apply only a saved --plan after reviewing it');
  const options = { directory: root, configPath: values.get('--config'), inputs };
  const summary = await previewAssistedInputs(options), inputId = assistedInputId(summary);
  if (!flags.has('--allow-model')) {
    if (values.has('--output') || values.has('--expect-input')) throw Error('--output/--expect-input require --allow-model');
    emit({ ...summary, inputId, modelCalled: false, next: 'Review the selected files, then use --allow-model --expect-input <inputId> --output .weftlet/setup-plan.json' }); return;
  }
  if (flags.has('--dry-run')) throw Error('--dry-run performs no model work; remove it to explicitly request a proposal');
  await requestProposal(options, values, summary);
}
