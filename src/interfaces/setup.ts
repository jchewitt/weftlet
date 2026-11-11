import { applyProjectSetup, planProjectSetup, type ProjectSetupOptions } from '../application/setup/project.js';
import { verifyProjectSetup } from '../application/setup/verify.js';
import { applySkillSetup, parseSkillClients, planSkillSetup, type SkillSetupPlan } from '../application/setup/skills.js';

export function formatSkillPlan(plan: SkillSetupPlan): string {
  return [`Skill setup: ${plan.root}`, `Toolkit ${plan.packageVersion}; plan ${plan.planId}`,
    ...plan.files.map(file => `  ${file.action}: ${file.path}`),
    ...(plan.ready ? [] : ['Review required: customized files stay intact. --json shows before/after content; --update accepts only unchanged managed copies.']),
    'This step installs agent instructions. MCP registration is configured separately.',
  ].join('\n') + '\n';
}

function parseSetupArgs(args: readonly string[]) {
  const clients: string[] = [], values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (['--apply', '--dry-run', '--update', '--json', '--mcp', '--verify', '--no-skill', '--absolute-launcher'].includes(key)) {
      if (flags.has(key)) throw Error(`Repeated setup option: ${key}`);
      flags.add(key); continue;
    }
    if (!['--client', '--directory', '--expect-plan', '--config', '--snapshot'].includes(key)) throw Error(`Unknown setup option: ${key}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw Error(`${key} requires a value`);
    if (key === '--client') clients.push(value);
    else {
      if (values.has(key)) throw Error(`Repeated setup option: ${key}`);
      values.set(key, value);
    }
  }
  return { clients, values, flags };
}

export async function runSetup(args: readonly string[]): Promise<void> {
  const { clients, values, flags } = parseSetupArgs(args);
  if (flags.has('--apply') && flags.has('--dry-run')) throw Error('Choose --apply or --dry-run, not both');
  if (values.has('--expect-plan') && !flags.has('--apply')) throw Error('--expect-plan requires --apply');
  const options = { directory: values.get('--directory'), clients: parseSkillClients(clients), update: flags.has('--update') };
  if (flags.has('--mcp') || flags.has('--verify')) {
    if (flags.has('--verify') && flags.has('--dry-run')) throw Error('--verify starts a local MCP process; use it separately from --dry-run');
    return runProjectSetup({ ...options, mcp: true, skills: !flags.has('--no-skill'),
      configPath: values.get('--config'), absoluteLauncher: flags.has('--absolute-launcher') }, flags, values);
  }
  if (flags.has('--no-skill') || flags.has('--absolute-launcher') || values.has('--config') || values.has('--snapshot')) {
    throw Error('--no-skill, --absolute-launcher, --config and --snapshot require --mcp or --verify');
  }
  const plan = await planSkillSetup(options);
  const result = flags.has('--apply')
    ? await applySkillSetup(options, values.get('--expect-plan') ?? plan.planId) : plan;
  process.stdout.write(flags.has('--json') ? `${JSON.stringify({ ...result, applied: flags.has('--apply') }, null, 2)}\n` :
    formatSkillPlan(result) + (flags.has('--apply') ? 'Skill setup applied.\n' : `Preview only. Apply with the same options, --apply --expect-plan ${plan.planId}\n`));
  if (!result.ready) process.exitCode = 1;
}

async function runProjectSetup(options: ProjectSetupOptions, flags: Set<string>, values: Map<string, string>) {
  if (values.has('--snapshot') && !flags.has('--verify')) throw Error('--snapshot requires --verify');
  const plan = await planProjectSetup(options);
  const result = flags.has('--apply') ? await applyProjectSetup(options, values.get('--expect-plan') ?? plan.planId) : plan;
  const verification = flags.has('--verify') ? await verifyProjectSetup(options, values.get('--snapshot')) : undefined;
  if (flags.has('--json')) process.stdout.write(`${JSON.stringify({ ...result, applied: flags.has('--apply'), verification }, null, 2)}\n`);
  else {
    const rows = [ ...(result.skill?.files.map(file => `  ${file.action}: ${file.path}`) ?? []),
      ...(result.mcp?.registrations.map(item => `  ${item.action}: ${item.path}`) ?? []),
      ...(result.mcp ? [`  ${result.mcp.launcher.action}: ${result.mcp.launcher.path}`] : []) ];
    process.stdout.write([`Project setup: ${result.root}`, ...rows,
      flags.has('--apply') ? 'Project setup applied.' : flags.has('--verify') ? 'Verification only; no setup files written.' :
        `Preview only. Apply with the same options, --apply --expect-plan ${plan.planId}`,
      ...(verification ? [JSON.stringify(verification, null, 2)] : []),
      'Restart/trust the project in your client, then check its MCP tools. Setup does not change client trust or login.', ''].join('\n'));
  }
  if (!result.ready || verification?.passed === false) process.exitCode = 1;
}
