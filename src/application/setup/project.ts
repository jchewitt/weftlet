import { resolve } from 'node:path';
import { applySetupFiles, contentDigest, type SetupFileChange } from './files.js';
import { prepareMcpSetup, type McpSetupOptions } from './mcp.js';
import { planSkillSetup } from './skills.js';

export interface ProjectSetupOptions extends McpSetupOptions { mcp?: boolean; skills?: boolean }
async function prepare(options: ProjectSetupOptions) {
  const skill = options.skills === false ? undefined : await planSkillSetup(options);
  const mcp = options.mcp ? await prepareMcpSetup(options) : undefined;
  if (!skill && !mcp) throw Error('Select skills or --mcp for setup');
  const root = resolve(options.directory ?? '.');
  const changes: SetupFileChange[] = [...(skill?.files ?? []), ...(mcp?.changes ?? [])];
  if (new Set(changes.map(change => change.path)).size !== changes.length) throw Error('Setup paths collide');
  const plan = { schemaVersion: 1, root, ready: (skill?.ready ?? true) && (mcp?.plan.ready ?? true),
    skill, mcp: mcp?.plan, planId: contentDigest(JSON.stringify([skill?.planId, mcp?.plan.planId])) };
  return { plan, changes };
}
export async function planProjectSetup(options: ProjectSetupOptions) { return (await prepare(options)).plan; }
export async function applyProjectSetup(options: ProjectSetupOptions, expectedPlanId: string) {
  const { plan, changes } = await prepare(options);
  if (plan.planId !== expectedPlanId) throw Error('Setup plan is stale; preview again before applying.');
  if (!plan.ready) throw Error('Setup needs review: existing customized files are preserved; --update accepts only unchanged managed entries.');
  await applySetupFiles(plan.root, changes);
  return plan;
}
