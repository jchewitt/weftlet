import { contentDigest, type SetupFileChange } from '../files.js';
import { prepareCiSetup } from '../ci/plan.js';
import { projectPath } from '../ci/project.js';
import { prepareProjectSetup } from '../project.js';
import { integrateChecks } from './workflow.js';
import type { AssistedInputs } from './inputs.js';
import type { SetupRecommendation } from './contract.js';

function sourceChanges(context: AssistedInputs, recommendation: SetupRecommendation) {
  const { config, input } = context;
  const allowed = new Set([...config.semanticSources, ...(config.approvedIntentSources ?? []),
    ...input.files.filter(file => /\.(md|mdx|txt)$/i.test(file.path)).map(file => file.path)]);
  const fields = ['semanticSources', 'approvedIntentSources'] as const;
  for (const field of fields) for (const path of recommendation[field] ?? []) {
    if (!allowed.has(path)) throw Error('Proposed document selection must use existing patterns or explicitly selected documentation paths');
  }
  const after = { ...config,
    ...(recommendation.semanticSources === null ? {} : { semanticSources: recommendation.semanticSources }),
    ...(recommendation.approvedIntentSources === null ? {} : { approvedIntentSources: recommendation.approvedIntentSources }) };
  const selection = Object.fromEntries(fields.map(field => [field, { before: config[field] ?? [], after: after[field] ?? [] }]));
  const changed = fields.some(field => JSON.stringify(config[field] ?? []) !== JSON.stringify(after[field] ?? []));
  const authorityChanged = JSON.stringify(config.approvedIntentSources ?? []) !== JSON.stringify(after.approvedIntentSources ?? []);
  const before = context.guards[0]!.before!;
  return { selection, authorityChanged, change: { path: context.configPath, before,
    after: changed ? `${JSON.stringify(after, null, 2)}\n` : before } };
}
function mergeChanges(changes: SetupFileChange[]) {
  const merged = new Map<string, SetupFileChange>();
  for (const change of changes) {
    const old = merged.get(change.path);
    if (old) {
      if (old.before !== change.before || (old.after !== old.before && change.after !== change.before && old.after !== change.after)) throw Error('Assisted setup has conflicting file changes');
      if (old.after !== old.before) continue;
    }
    merged.set(change.path, change);
  }
  return [...merged.values()].sort((a, b) => a.path.localeCompare(b.path));
}
async function ciChanges(context: AssistedInputs, recommendation: SetupRecommendation) {
  if (!recommendation.ci) return undefined;
  const ci = recommendation.ci, directory = projectPath(context.root, ci.workingDirectory);
  const manifest = directory === '.' ? 'package.json' : `${directory}/package.json`;
  if (!context.input.files.some(file => file.path === manifest)) throw Error('Select the working package.json as an input before proposing CI');
  const prepared = await prepareCiSetup({ directory: context.root, configPath: context.configPath, checks: true,
    workingDirectory: directory, buildScript: ci.buildScript ?? undefined, testScripts: ci.testScripts });
  if (!ci.existingWorkflow) {
    if (!prepared.plan.ready) throw Error('Standalone workflow requires manual review; assisted setup preserves customized files');
    return { changes: prepared.changes, preview: prepared.plan };
  }
  const path = projectPath(context.root, ci.existingWorkflow);
  const selected = context.input.files.find(file => file.path === path && /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path));
  if (!selected) throw Error('Select the existing workflow as an input before proposing integration');
  const output = prepared.plan.files[0]!;
  if (output.path === path) throw Error('Use the standalone managed workflow for this path');
  const { after, job } = integrateChecks(selected.content, output.proposedContent);
  const changes = prepared.changes.filter(change => change.path !== output.path && change.path !== path);
  changes.push({ path, before: selected.content, after });
  return { changes, preview: { path, addedJob: 'weftlet_checks', job, existingJobsTriggersAndPermissionsPreserved: true } };
}
export async function prepareAssistedChanges(context: AssistedInputs, recommendation: SetupRecommendation) {
  const sources = sourceChanges(context, recommendation);
  const project = recommendation.clients.length ? await prepareProjectSetup({ directory: context.root, configPath: context.configPath,
    clients: recommendation.clients, mcp: recommendation.mcp }) : undefined;
  if (project && !project.plan.ready) throw Error('Customized skill/MCP settings need manual setup review before assisted application');
  const ci = await ciChanges(context, recommendation);
  const changes = mergeChanges([...context.guards, sources.change, ...(project?.changes ?? []), ...(ci?.changes ?? [])]);
  // Raw client settings and unrelated config/workflow contents remain internal to CAS writes.
  const files = changes.filter(change => change.before !== change.after).map(change => ({ path: change.path,
    beforeSha256: change.before === null ? null : contentDigest(change.before), afterSha256: contentDigest(change.after) }));
  const guards = changes.map(change => ({ path: change.path, beforeSha256: change.before === null ? null : contentDigest(change.before),
    afterSha256: contentDigest(change.after) }));
  const preview = { files, selection: sources.selection, authorityChanged: sources.authorityChanged,
    skills: project?.plan.skill?.files.map(file => ({ path: file.path, action: file.action, proposedContent: file.after })),
    mcp: project?.plan.mcp, ci: ci?.preview };
  return { changes, preview, guards };
}
