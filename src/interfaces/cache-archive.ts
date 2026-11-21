import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { planArchive } from '../application/cache-relocation/plan.js';
import { createArchive, restoreArchive, checkCutover } from '../application/cache-relocation/transfer.js';
import { readRetentionPolicy } from '../storage/retention/policy.js';
import { retentionInputs } from '../application/retention/inputs.js';

export async function runCacheArchive(args: readonly string[]) {
  if (args[0] !== 'cache' || args[1] !== 'archive') return false;
  const action = args[2];
  const required: Record<string, string[]> = {
    plan: ['root', 'policy'],
    create: ['root', 'policy', 'output', 'expect-plan'],
    restore: ['input', 'to', 'expect-plan'],
    cutover: ['root', 'policy', 'to', 'expect-plan'],
  };
  const flags = action && Object.hasOwn(required, action) ? required[action] : undefined;
  if (!flags) throw Error('cache archive requires plan, create, restore or cutover');
  const options: Record<string, { type: 'string' | 'boolean'; multiple?: boolean }> = Object.fromEntries(
    flags.map((f) => [f, { type: 'string' }]),
  );
  options.json = { type: 'boolean' };
  if (action !== 'restore') {
    options['include-cold-semantic'] = { type: 'boolean' };
    options.config = { type: 'string', multiple: true };
    for (const flag of ['max-entries', 'max-bytes', 'wait-ms']) options[flag] = { type: 'string' };
  }
  if (action === 'cutover') options['acknowledge-quiescence'] = { type: 'boolean' };
  const { values } = parseArgs({ args: args.slice(3), options, strict: true, allowPositionals: false });
  const arg = (key: string) => {
    const v = values[key];
    if (typeof v !== 'string' || !v) throw Error('Missing --' + key);
    return v;
  };
  for (const flag of flags) arg(flag);
  const controller = new AbortController(),
    cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    let result;
    if (action === 'restore')
      result = await restoreArchive(resolve(arg('input')), arg('to'), arg('expect-plan'), controller.signal);
    else {
      const policyPath = arg('policy'),
        root = await retentionInputs(arg('root'), [policyPath]);
      const readPolicy = () => readRetentionPolicy(policyPath);
      const number = (key: string) => {
        const value = values[key];
        if (value === undefined) return;
        if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
          throw Error('Invalid --' + key);
        return Number(value);
      };
      const common = {
        maxEntries: number('max-entries'),
        maxBytes: number('max-bytes'),
        timeoutMs: number('wait-ms'),
        root,
        configs: values.config as string[] | undefined,
        policy: await readPolicy(),
        readPolicy,
        signal: controller.signal,
        includeColdSemantic: values['include-cold-semantic'] === true,
      };
      result =
        action === 'plan'
          ? await planArchive(common)
          : action === 'create'
            ? await createArchive(common, arg('output'), arg('expect-plan'))
            : await checkCutover(common, arg('to'), arg('expect-plan'), values['acknowledge-quiescence'] === true);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
  return true;
}
