import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applySetupFiles, contentDigest, inspectSetupPath } from './files.js';

export const skillClients = ['codex', 'claude', 'opencode'] as const;
export type SkillClient = typeof skillClients[number];
const directories: Record<SkillClient, string> = { codex: '.agents', claude: '.claude', opencode: '.opencode' };
const marker = '\n<!-- weftlet-managed-skill ';
const normalize = (content: string) => content.replaceAll('\r\n', '\n');

export interface SkillSetupOptions {
  directory?: string;
  clients: readonly SkillClient[];
  update?: boolean;
}

export function parseSkillClients(values: readonly string[]): SkillClient[] {
  if (!values.length || values.some(value => !skillClients.includes(value as SkillClient))) {
    throw Error('Choose at least one --client codex, claude or opencode');
  }
  return skillClients.filter(client => values.includes(client));
}

function unmodifiedManagedCopy(content: string): boolean {
  content = normalize(content);
  const offset = content.lastIndexOf(marker);
  if (offset < 0 || !content.endsWith(' -->\n')) return false;
  try {
    const receipt = JSON.parse(content.slice(offset + marker.length, -5));
    return receipt.schemaVersion === 1 && typeof receipt.packageVersion === 'string' &&
      receipt.templateSha256 === contentDigest(content.slice(0, offset));
  } catch { return false; }
}

/** Load from the installed toolkit, independent of cwd or the consumer's node_modules layout. */
export async function planSkillSetup(options: SkillSetupOptions) {
  const root = resolve(options.directory ?? '.');
  const clients = parseSkillClients(options.clients);
  const template = normalize(await readFile(new URL('../../../templates/context-graph-development/SKILL.md', import.meta.url), 'utf8'));
  const { version } = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
  const templateSha256 = contentDigest(template);
  const after = `${template}${marker}${JSON.stringify({ schemaVersion: 1, packageVersion: version, templateSha256 })} -->\n`;
  const files = await Promise.all(clients.map(async client => {
    const path = `${directories[client]}/skills/context-graph-development/SKILL.md`;
    const before = await inspectSetupPath(root, path);
    const action = before !== null && normalize(before) === after ? 'unchanged' : before === null ? 'create' :
      unmodifiedManagedCopy(before) ? (options.update ? 'update' : 'update-available') : 'conflict';
    const output = before?.includes('\r\n') ? after.replaceAll('\n', '\r\n') : after;
    return { client, path, action, before, after: output, beforeSha256: before === null ? null : contentDigest(before) };
  }));
  const identity = { root, clients, update: Boolean(options.update), version, templateSha256,
    files: files.map(({ path, beforeSha256, action }) => ({ path, beforeSha256, action })) };
  return { schemaVersion: 1, planId: contentDigest(JSON.stringify(identity)), root, packageVersion: version, templateSha256,
    ready: files.every(file => ['create', 'unchanged', 'update'].includes(file.action)), files };
}

export type SkillSetupPlan = Awaited<ReturnType<typeof planSkillSetup>>;

/** Recreate the plan from packaged assets; never execute caller-supplied patch content. */
export async function applySkillSetup(options: SkillSetupOptions, expectedPlanId: string) {
  const plan = await planSkillSetup(options);
  if (plan.planId !== expectedPlanId) throw Error('Setup plan is stale; preview again before applying.');
  if (!plan.ready) throw Error('Skill setup needs review: customized files are preserved; use --update only for unchanged managed copies. Inspect setup --json.');
  if (plan.files.some(file => file.action !== 'unchanged')) await applySetupFiles(plan.root, plan.files);
  return plan;
}
