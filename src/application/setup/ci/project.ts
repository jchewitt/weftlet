import { readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { loadConfig } from '../../../configuration/config.js';
import { contentDigest, inspectSetupPath, type SetupFileChange } from '../files.js';

export interface CiSetupOptions {
  directory?: string;
  configPath?: string;
  workingDirectory?: string;
  checks?: boolean;
  generate?: boolean;
  testScripts?: readonly string[];
  buildScript?: string;
  architecturePolicy?: string;
  runner?: 'hosted' | 'self-hosted';
  environment?: string;
  providerVersion?: string;
  update?: boolean;
}
export function projectPath(root: string, value: string): string {
  const local = relative(root, resolve(root, value)).replaceAll('\\', '/') || '.';
  if (isAbsolute(local) || local.split('/').includes('..') || /[\x00-\x1f\x7f]|\$\{\{/.test(local)) {
    throw Error('CI setup paths must stay inside the repository and contain no control characters or workflow expressions');
  }
  return local;
}
function manifest(text: string | null) {
  try {
    const value = JSON.parse(text!);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value as { packageManager?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  } catch { throw Error('CI setup requires a valid project package.json'); }
}
type InputReader = (path: string, maxBytes?: number) => Promise<string | null>;
async function packageManager(selected: string | undefined, read: InputReader) {
  const npmLock = await read('package-lock.json', 16_777_216);
  const pnpmLock = await read('pnpm-lock.yaml', 16_777_216);
  if ((npmLock !== null) === (pnpmLock !== null)) throw Error('CI setup needs exactly one root lockfile: package-lock.json or pnpm-lock.yaml');
  const manager = pnpmLock !== null ? 'pnpm' : 'npm';
  const pin = typeof selected === 'string' ? /^(npm|pnpm)@(\d+\.\d+\.\d+)(?:\+sha\d+\.[a-f0-9]+)?$/.exec(selected) : undefined;
  if (selected !== undefined && (!pin || pin[1] !== manager)) throw Error('Root packageManager must match the lockfile with an exact version');
  if (manager === 'pnpm' && !pin) throw Error('Pin an exact pnpm version in the root package.json packageManager field');
  return { manager, pnpmVersion: manager === 'pnpm' ? pin?.[2] : undefined, npmVersion: manager === 'npm' ? pin?.[2] : undefined };
}
function validateScripts(pkg: ReturnType<typeof manifest>, options: CiSetupOptions) {
  if (!(pkg.dependencies?.['@weftlet/toolkit'] || pkg.devDependencies?.['@weftlet/toolkit'])) {
    throw Error('Add @weftlet/toolkit as a dependency of the selected working directory before scaffolding CI');
  }
  for (const name of [options.buildScript, ...(options.testScripts ?? [])].filter((value): value is string => value !== undefined)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(name) || typeof pkg.scripts?.[name] !== 'string') throw Error('Select an existing package script name for --build-script/--test-script');
  }
}
async function existingWorkflows(root: string, read: InputReader) {
  await inspectSetupPath(root, '.github/workflows/.weftlet-probe');
  let workflows: string[];
  try { workflows = (await readdir(join(root, '.github/workflows'))).filter(path => /\.ya?ml$/.test(path)).sort(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; workflows = []; }
  if (workflows.length > 128) throw Error('CI setup inspection is limited to 128 workflows; integrate manually for this repository');
  for (const path of workflows) await read(`.github/workflows/${path}`);
  return workflows;
}
export async function inspectCiProject(options: CiSetupOptions) {
  const root = resolve(options.directory ?? '.');
  const guards: SetupFileChange[] = [];
  const read = async (path: string, maxBytes = 262_144) => {
    const before = await inspectSetupPath(root, path, maxBytes);
    if (before !== null) guards.push({ path, before, after: before, maxBytes });
    return before;
  };
  const workingDirectory = projectPath(root, options.workingDirectory ?? '.');
  const packagePath = projectPath(root, join(workingDirectory, 'package.json'));
  const pkg = manifest(await read(packagePath));
  const rootPackage = packagePath === 'package.json' ? pkg : manifest(await read('package.json'));
  const { manager, pnpmVersion, npmVersion } = await packageManager(rootPackage.packageManager, read);
  await read('pnpm-workspace.yaml');
  await read('.npmrc'); // Bind operational install settings without exposing their contents.
  validateScripts(pkg, options);
  const configPath = projectPath(root, options.configPath ?? 'context-graph.config.json');
  if (await read(configPath) === null) throw Error('Create the Weftlet config before CI setup');
  let loaded;
  try { loaded = await loadConfig(resolve(root, configPath), root); } catch { throw Error('Validate the Weftlet configuration before CI setup'); }
  if (loaded.repositoryRoot !== root) throw Error('--directory must be the configured repository root');
  const architecturePolicy = options.architecturePolicy === undefined ? undefined : projectPath(root, options.architecturePolicy);
  if (architecturePolicy && await read(architecturePolicy) === null) throw Error('Selected architecture policy is missing');
  const workflows = await existingWorkflows(root, read);
  return { root, workingDirectory, packagePath, manager, pnpmVersion, npmVersion, configPath, config: loaded.config, architecturePolicy,
    availableScripts: Object.keys(pkg.scripts ?? {}).sort(), guards,
    existingWorkflows: workflows.map(path => `.github/workflows/${path}`),
    inputs: guards.map(({ path, before }) => ({ path, sha256: contentDigest(before!) })) };
}
export type CiProject = Awaited<ReturnType<typeof inspectCiProject>>;
