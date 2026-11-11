import { applySkillSetup, parseSkillClients, planSkillSetup, type SkillSetupPlan } from '../application/setup/skills.js';

export function formatSkillPlan(plan: SkillSetupPlan): string {
  return [`Skill setup: ${plan.root}`, `Toolkit ${plan.packageVersion}; plan ${plan.planId}`,
    ...plan.files.map(file => `  ${file.action}: ${file.path}`),
    ...(plan.ready ? [] : ['Review required: customized files stay intact. --json shows before/after content; --update accepts only unchanged managed copies.']),
    'This step installs agent instructions. MCP registration is configured separately.',
  ].join('\n') + '\n';
}

export async function runSetup(args: readonly string[]): Promise<void> {
  const clients: string[] = [], values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (['--apply', '--dry-run', '--update', '--json'].includes(key)) {
      if (flags.has(key)) throw Error(`Repeated setup option: ${key}`);
      flags.add(key); continue;
    }
    if (!['--client', '--directory', '--expect-plan'].includes(key)) throw Error(`Unknown setup option: ${key}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw Error(`${key} requires a value`);
    if (key === '--client') clients.push(value);
    else {
      if (values.has(key)) throw Error(`Repeated setup option: ${key}`);
      values.set(key, value);
    }
  }
  if (flags.has('--apply') && flags.has('--dry-run')) throw Error('Choose --apply or --dry-run, not both');
  if (values.has('--expect-plan') && !flags.has('--apply')) throw Error('--expect-plan requires --apply');
  const options = { directory: values.get('--directory'), clients: parseSkillClients(clients), update: flags.has('--update') };
  const plan = await planSkillSetup(options);
  const result = flags.has('--apply')
    ? await applySkillSetup(options, values.get('--expect-plan') ?? plan.planId) : plan;
  process.stdout.write(flags.has('--json') ? `${JSON.stringify({ ...result, applied: flags.has('--apply') }, null, 2)}\n` :
    formatSkillPlan(result) + (flags.has('--apply') ? 'Skill setup applied.\n' : `Preview only. Apply with the same options, --apply --expect-plan ${plan.planId}\n`));
  if (!result.ready) process.exitCode = 1;
}
