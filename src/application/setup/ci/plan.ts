import { toolkitIdentity } from '../../../infrastructure/package-identity.js';
import { applySetupFiles, contentDigest, inspectSetupPath, type SetupFileChange } from '../files.js';
import { inspectCiProject, type CiSetupOptions } from './project.js';
import { generationProfile } from './provider.js';
import { renderChecks, renderGeneration } from './render.js';

const marker = '# weftlet-managed-workflow ';
const normalize = (value: string) => value.replaceAll('\r\n', '\n');
function owned(text: string) {
  const normalized = normalize(text), newline = normalized.indexOf('\n');
  if (!normalized.startsWith(marker) || newline < 0) return false;
  try {
    const receipt = JSON.parse(normalized.slice(marker.length, newline));
    return receipt.schemaVersion === 1 && receipt.bodySha256 === contentDigest(normalized.slice(newline + 1));
  } catch { return false; }
}
function managed(body: string, packageVersion: string) {
  return `${marker}${JSON.stringify({ schemaVersion: 1, packageVersion, bodySha256: contentDigest(body) })}\n${body}`;
}
async function prepare(options: CiSetupOptions) {
  if (!options.checks && !options.generate) throw Error('Choose --checks and/or --generate');
  const project = await inspectCiProject(options);
  const profile = generationProfile(project.config, options);
  const { version } = await toolkitIdentity();
  const outputs: { path: string; body: string }[] = [];
  if (options.checks) outputs.push({ path: '.github/workflows/weftlet-check.yml', body: renderChecks(project, options) });
  if (profile) outputs.push({ path: '.github/workflows/weftlet-generate.yml', body: renderGeneration(project, options, profile) });
  const changes: SetupFileChange[] = project.guards.filter(guard => !outputs.some(output => guard.path === output.path));
  const files = [];
  for (const output of outputs) {
    const before = await inspectSetupPath(project.root, output.path), canonical = managed(output.body, version);
    const after = before?.includes('\r\n') ? canonical.replaceAll('\n', '\r\n') : canonical;
    const action = before === null ? 'create' : normalize(before) === canonical ? 'unchanged' :
      owned(before) ? options.update ? 'update' : 'update-available' : 'conflict';
    changes.push({ path: output.path, before, after });
    files.push({ path: output.path, action, beforeSha256: before === null ? null : contentDigest(before), afterSha256: contentDigest(after), proposedContent: after });
  }
  if (new Set(changes.map(change => change.path)).size !== changes.length) throw Error('CI setup configuration/input paths collide with workflow outputs');
  const plan = { schemaVersion: 1, packageVersion: version, root: project.root, workingDirectory: project.workingDirectory,
    packageManager: project.manager, pnpmVersion: project.pnpmVersion, npmVersion: project.npmVersion, configPath: project.configPath,
    availableScripts: project.availableScripts, selectedBuildScript: options.buildScript, selectedTestScripts: options.testScripts ?? [],
    architecturePolicy: project.architecturePolicy, generation: profile, existingWorkflows: project.existingWorkflows,
    inputs: project.inputs, files, ready: files.every(file => !['conflict', 'update-available'].includes(file.action)),
    nextSteps: profile ? [
      `Configure and protect the ${profile.environment} GitHub environment before dispatch; YAML does not create reviewers or branch restrictions.`,
      profile.apiKeyEnv ? `Store ${profile.apiKeyEnv} in that environment; it is referenced only by the hydration step.` : 'Provision the selected provider login/API store on the dedicated trusted runner; setup performs no login.',
      ...(profile.runner === 'self-hosted' ? [`Provision a Linux runner labeled weftlet-generation with ${profile.command} ${profile.version}; no provider installation or authentication is changed by this workflow.`] : []),
      'Review source/model budgets, then explicitly select allow_model when dispatching from the default branch.',
      'This scaffold validates generation without uploading graphs or caches. Configure reviewed private evidence delivery separately; hosted runner snapshots are otherwise temporary.',
    ] : ['Commit the generated workflow and config; it runs on pull requests or manual dispatch without Weftlet model credentials.'],
  };
  return { plan: { ...plan, planId: contentDigest(JSON.stringify(plan)) }, changes };
}
export async function planCiSetup(options: CiSetupOptions) { return (await prepare(options)).plan; }
export async function applyCiSetup(options: CiSetupOptions, expectedPlanId: string) {
  const { plan, changes } = await prepare(options);
  if (plan.planId !== expectedPlanId) throw Error('CI setup plan is stale; preview again before applying');
  if (!plan.ready) throw Error('CI setup preserves customized workflows; review the proposed content or use --update for unchanged managed copies');
  await applySetupFiles(plan.root, changes);
  return plan;
}
