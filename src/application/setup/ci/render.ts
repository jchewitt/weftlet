import { parse, stringify } from 'yaml';
import type { CiProject, CiSetupOptions } from './project.js';
import type { GenerationProfile } from './provider.js';

const checkout = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262';
const node = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020';
const pnpm = 'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1';
const quote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;
type Step = Record<string, unknown>;
// Resolve from the selected package, including npm workspace hoisting; never download a CLI.
const cliBootstrap = 'process.argv.splice(1,0,"weftlet");await import(new URL("./cli.js",import.meta.resolve("@weftlet/toolkit")))';
export const graphCommand = (command: string) => `node --input-type=module -e ${quote(cliBootstrap)} -- ${command} --config "$GITHUB_WORKSPACE/$WEFTLET_CONFIG"`;

function commonSteps(project: CiProject, options: CiSetupOptions): Step[] {
  const steps: Step[] = [{ uses: checkout, with: { ref: '${{ github.sha }}', 'persist-credentials': false } }];
  if (project.manager === 'pnpm') steps.push({ uses: pnpm, with: { version: project.pnpmVersion, run_install: false } });
  steps.push({ uses: node, with: { 'node-version': 24 } });
  if (project.npmVersion) steps.push({ name: 'Use pinned npm version', run: `npm install --global npm@${project.npmVersion}` });
  steps.push({ name: 'Frozen dependency installation', 'working-directory': '.', run: project.manager === 'npm' ? 'npm ci' : 'pnpm install --frozen-lockfile' });
  if (options.buildScript) steps.push({ name: 'Selected project/adapter build', run: `${project.manager} run ${quote(options.buildScript)}` });
  steps.push({ name: 'Validate Weftlet configuration', run: graphCommand('config validate') },
    { name: 'Preview committed evidence scope without model calls', run: graphCommand('hydrate --plan --ref "$GITHUB_SHA" --json') });
  for (const name of options.testScripts ?? []) steps.push({ name: `Project script: ${name}`, run: `${project.manager} run ${quote(name)}` });
  if (project.architecturePolicy) steps.push({ name: 'Selected deterministic architecture policy',
    run: graphCommand('govern --policy "$GITHUB_WORKSPACE/$WEFTLET_POLICY" --output "$RUNNER_TEMP/weftlet-architecture.json"') });
  return steps;
}
function workflow(project: CiProject, job: Record<string, unknown>, generation: boolean) {
  const value = {
    name: generation ? 'Weftlet trusted generation' : 'Weftlet project checks',
    on: generation ? { workflow_dispatch: { inputs: { allow_model: { description: 'Allow configured semantic model usage within committed budgets', type: 'boolean', required: true, default: false } } } } : { pull_request: {}, workflow_dispatch: {} },
    permissions: { contents: 'read' },
    env: { WEFTLET_CONFIG: project.configPath, ...(project.architecturePolicy ? { WEFTLET_POLICY: project.architecturePolicy } : {}) },
    defaults: { run: { shell: 'bash', 'working-directory': project.workingDirectory } },
    jobs: { [generation ? 'generate' : 'checks']: job },
  };
  const text = stringify(value, { lineWidth: 0 });
  // A generated workflow must round-trip as YAML, including GitHub's expression strings.
  if (JSON.stringify(parse(text)) !== JSON.stringify(value)) throw Error('Generated workflow YAML did not preserve its configuration');
  return text;
}
export function renderChecks(project: CiProject, options: CiSetupOptions) {
  return workflow(project, { 'runs-on': 'ubuntu-latest', 'timeout-minutes': 20, steps: commonSteps(project, options) }, false);
}
export function renderGeneration(project: CiProject, options: CiSetupOptions, profile: GenerationProfile) {
  const steps = commonSteps(project, options);
  if (profile.runner === 'hosted') steps.push({ name: 'Install the explicitly pinned extraction CLI',
    run: `npm install --global ${quote(`${profile.package}@${profile.version}`)}` });
  const versionCheck = `const {execFileSync}=require('node:child_process');const output=execFileSync(${JSON.stringify(profile.command)},['--version'],{encoding:'utf8',timeout:10000});if(!output.split(/[^0-9.]+/).includes(${JSON.stringify(profile.version)}))throw Error('Extraction CLI version does not match the reviewed CI pin');`;
  steps.push({ name: 'Verify extraction CLI version', run: `node -e ${quote(versionCheck)}` });
  const key = profile.apiKeyEnv;
  const requireKey = key ? `node -e ${quote(`if(!process.env[${JSON.stringify(key)}]?.trim())throw Error('Configured generation API credential is missing')`)}\n` : '';
  steps.push({ name: 'Explicit bounded semantic generation', ...(key ? { env: { [key]: `\${{ secrets.${key} }}` } } : {}),
    run: `${requireKey}${graphCommand('hydrate --ref "$GITHUB_SHA" --json --quiet')} > "$RUNNER_TEMP/weftlet-build.json"` },
    { name: 'Final exact-commit evidence and invariants', run: graphCommand('invariant check --ref "$GITHUB_SHA"') });
  return workflow(project, {
    if: "github.ref == format('refs/heads/{0}', github.event.repository.default_branch) && inputs.allow_model",
    'runs-on': profile.runner === 'hosted' ? 'ubuntu-latest' : ['self-hosted', 'linux', 'weftlet-generation'],
    'timeout-minutes': 30, environment: profile.environment,
    concurrency: { group: 'weftlet-trusted-generation', 'cancel-in-progress': false }, steps,
  }, true);
}
