import { lstat, mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { ContextGraphConfig } from "../configuration/config.js";
import { applySkillSetup, parseSkillClients, planSkillSetup, type SkillClient } from '../application/setup/skills.js';
import { formatSkillPlan } from './setup.js';

export interface InitOptions {
  directory?: string;
  configPath?: string;
  repositoryId?: string;
  codeRoots?: string[];
  semanticSources?: string[];
  evidenceRoots?: string[];
  model?: string;
  provider?: 'codex-cli' | 'claude-cli' | 'opencode-cli';
  gitignore?: boolean;
  /** Defaults to the extraction provider's client. Empty opts out of skill installation. */
  clients?: readonly SkillClient[];
  approvedIntentSources?: string[];
}

const toPosix = (path: string) => path.replace(/\\/g, '/');

async function present(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function providerDefaults(options: InitOptions): Pick<ContextGraphConfig['semantic'], 'provider' | 'auth' | 'model'> {
  const provider = options.provider ?? 'codex-cli';
  if (!['codex-cli', 'claude-cli', 'opencode-cli'].includes(provider)) throw new Error('Provider must be codex-cli, claude-cli or opencode-cli');
  if (provider === 'opencode-cli') {
    if (!options.model || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/\S+$/.test(options.model)) throw new Error('OpenCode requires --model provider/model; no billing provider is selected automatically');
    return { provider, auth: { mode: 'opencode-auth' }, model: options.model };
  }
  return { provider, auth: { mode: provider === 'claude-cli' ? 'claude-login' : 'chatgpt' },
    model: options.model ?? (provider === 'claude-cli' ? 'sonnet' : 'gpt-6-astra') };
}

/** Prepares local configuration; no provider, indexer or Git mutation is invoked. */
export async function prepareProjectConfig(options: InitOptions = {}) {
  const root = resolve(options.directory ?? '.');
  const configPath = resolve(root, options.configPath ?? 'context-graph.config.json');
  let packageName: string | undefined;
  if (await present(resolve(root, 'package.json'))) {
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    if (typeof manifest.name === 'string' && manifest.name.trim()) packageName = manifest.name;
  }
  const repositoryId = options.repositoryId ?? packageName ?? basename(root);
  if (!repositoryId.trim()) throw new Error('Repository ID must not be empty');
  const paths = (values: string[]) => values.map((path) => {
    const normalized = toPosix(path).replace(/^\.\//, '');
    if (!normalized || normalized.startsWith('/') || isAbsolute(path) || /^[A-Za-z]:/.test(normalized) ||
        normalized.split('/').includes('..')) throw new Error(`Source paths must stay within the repository: ${path}`);
    return normalized;
  });
  const detectedEvidence = [];
  for (const candidate of ['test', 'tests', '__tests__']) {
    if (await present(resolve(root, candidate))) detectedEvidence.push(candidate);
  }
  const config: ContextGraphConfig = {
    schemaVersion: 1,
    repositoryRoot: toPosix(relative(dirname(configPath), root)) || '.',
    repositoryId,
    namespace: `https://example.test/context/${encodeURIComponent(repositoryId)}/`,
    semanticSources: paths(options.semanticSources ?? []),
    approvedIntentSources: paths(options.approvedIntentSources ?? []),
    codeRoots: paths(options.codeRoots ?? [await present(resolve(root, 'src')) ? 'src' : '.']),
    contractPatterns: [],
    evidenceRoots: paths(options.evidenceRoots ?? detectedEvidence),
    semantic: {
      ...providerDefaults(options), reasoningEffort: options.provider === 'opencode-cli' ? 'default' : 'medium',
      promptVersion: 'generic-semantic-v3', extractorVersion: '1.1.0', adapterVersion: '1.1.0',
      ontologyVersion: '1.1.0', minimumConfidence: 0.7, failOnUnresolved: true, concurrency: 1,
      maxDocuments: 8, maxSourceBytes: 65_536, timeoutMs: 120_000, retries: 0,
    },
    scip: { version: '0.4.0', command: 'bundled-scip-typescript',
      args: ['index', '--no-global-caches', '--infer-tsconfig'] },
    ontology: { backend: 'rdf', toolVersion: 'rdf-record-v1' },
    runtimeEvidence: [], storagePath: '.context-graph',
  };
  if (!config.semantic.model.trim()) throw new Error('Model must not be empty');
  return { root, configPath, config };
}

async function prepareInitSkills(options: InitOptions, root: string, configPath: string) {
  const clients = options.clients ?? [options.provider === 'claude-cli' ? 'claude' : options.provider === 'opencode-cli' ? 'opencode' : 'codex'];
  const skillOptions = { directory: root, clients };
  const skillPlan = clients.length ? await planSkillSetup(skillOptions) : undefined;
  if (skillPlan && !skillPlan.ready) throw new Error('Existing skill needs review. Run weftlet setup --client <client> --json, or init --no-skill to preserve it and create only configuration.');
  if (relative(configPath, resolve(root, '.weftlet-setup.lock')) === '' || skillPlan?.files.some(file => {
    const targetFromConfig = relative(configPath, resolve(root, file.path));
    return !targetFromConfig || (!isAbsolute(targetFromConfig) && !targetFromConfig.split(/[\\/]/).includes('..'));
  })) throw new Error('Configuration cannot replace a skill path or setup lock');
  return { skillOptions, skillPlan };
}

export async function initializeProject(options: InitOptions = {}) {
  const prepared = await prepareProjectConfig(options);
  const { root, configPath } = prepared;
  if (await present(configPath)) throw new Error(`Configuration already exists: ${configPath}. Edit it or choose another --config path.`);
  const { skillOptions, skillPlan } = await prepareInitSkills(options, root, configPath);
  const ignorePath = resolve(root, '.gitignore');
  if (configPath === ignorePath) throw new Error('Configuration cannot replace .gitignore');
  let ignoreContent = '';
  if (options.gitignore !== false && await present(ignorePath)) {
    if (!(await lstat(ignorePath)).isFile()) throw new Error('.gitignore must be a regular file');
    ignoreContent = await readFile(ignorePath, 'utf8');
  }
  await mkdir(dirname(configPath), { recursive: true });
  // Exclusive creation prevents a second initializer from overwriting a concurrent writer.
  await writeFile(configPath, `${JSON.stringify(prepared.config, null, 2)}\n`, { flag: 'wx' });
  const ignoresStorage = ignoreContent.split(/\r?\n/).some((line) =>
    ['.context-graph', '.context-graph/', '/.context-graph', '/.context-graph/'].includes(line.trim()));
  if (options.gitignore !== false && !ignoresStorage) {
    const newline = ignoreContent.includes('\r\n') ? '\r\n' : '\n';
    await appendFile(ignorePath, `${ignoreContent && !ignoreContent.endsWith('\n') ? newline : ''}.context-graph/${newline}`);
  }
  if (skillPlan) await applySkillSetup(skillOptions, skillPlan.planId);
  return { ...prepared, skillPlan };
}

/** TTY prompts are optional; automation uses --yes and explicit source flags. */
export async function runInit(args: readonly string[]): Promise<void> {
  const values = new Map<string, string[]>();
  const flags = new Set(['--yes', '--no-gitignore', '--no-skill']);
  const valued = new Set(['--directory', '--config', '--repository-id', '--code-root', '--semantic-source', '--approved-intent-source', '--evidence-root', '--model', '--provider', '--client']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (flags.has(key)) continue;
    if (!valued.has(key)) throw new Error(`Unknown init option: ${key}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`);
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const one = (key: string) => {
    const entries = values.get(key);
    if (entries && entries.length > 1) throw new Error(`${key} may only be supplied once`);
    return entries?.[0];
  };
  const options: InitOptions = {
    directory: one('--directory'), configPath: one('--config'), repositoryId: one('--repository-id'),
    model: one('--model'), provider: one('--provider') as InitOptions['provider'], codeRoots: values.get('--code-root'), semanticSources: values.get('--semantic-source'),
    evidenceRoots: values.get('--evidence-root'), gitignore: !args.includes('--no-gitignore'),
    clients: args.includes('--no-skill') ? [] : values.has('--client') ? parseSkillClients(values.get('--client')!) : undefined,
    approvedIntentSources: values.get('--approved-intent-source'),
  };
  if (args.includes('--no-skill') && values.has('--client')) throw Error('--no-skill cannot be combined with --client');
  if (!args.includes('--yes')) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Non-interactive setup requires --yes. Use --semantic-source <path> to select documents explicitly.');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      process.stdout.write('Set up a TypeScript context graph. Documents are opt-in; source approval is configured separately.\n');
      if (!options.provider) {
        options.provider = ((await prompt.question('Extraction provider [codex-cli; or claude-cli, opencode-cli]: ')).trim() || 'codex-cli') as InitOptions['provider'];
      }
      if (options.provider === 'opencode-cli' && !options.model) options.model = (await prompt.question('OpenCode provider/model (required): ')).trim();
      const defaults = await prepareProjectConfig(options);
      if (!options.repositoryId) options.repositoryId = (await prompt.question(`Repository ID [${defaults.config.repositoryId}]: `)).trim() || defaults.config.repositoryId;
      if (!options.codeRoots) {
        const answer = (await prompt.question(`Code roots, comma-separated [${defaults.config.codeRoots.join(', ')}]: `)).trim();
        if (answer) options.codeRoots = answer.split(',').map((path) => path.trim()).filter(Boolean);
      }
      if (!options.semanticSources) {
        const candidates: string[] = [];
        for (const path of ['PRODUCT.md', 'README.md', 'docs', 'specs']) if (await present(resolve(defaults.root, path))) candidates.push(path);
        if (candidates.length) process.stdout.write(`Possible document sources: ${candidates.join(', ')}\n`);
        const answer = (await prompt.question('Document paths, comma-separated [none]: ')).trim();
        options.semanticSources = answer ? answer.split(',').map((path) => path.trim()).filter(Boolean) : [];
      }
      if (!options.approvedIntentSources) {
        const answer = (await prompt.question('Governing source paths/globs, comma-separated [none; other selected docs remain context]: ')).trim();
        options.approvedIntentSources = answer ? answer.split(',').map(path => path.trim()).filter(Boolean) : [];
      }
      if (!options.clients) {
        const suggested = options.provider === 'claude-cli' ? 'claude' : options.provider === 'opencode-cli' ? 'opencode' : 'codex';
        const answer = (await prompt.question(`Install project skill for clients, comma-separated [${suggested}; codex, claude, opencode, or none]: `)).trim() || suggested;
        options.clients = answer === 'none' ? [] : parseSkillClients(answer.split(',').map(value => value.trim()));
      }
      if (!options.model) options.model = (await prompt.question(`Model [${defaults.config.semantic.model}]: `)).trim() || defaults.config.semantic.model;
      if (options.clients.length) process.stdout.write(formatSkillPlan(await planSkillSetup({ directory: defaults.root, clients: options.clients })));
      const confirm = (await prompt.question(`Write ${defaults.configPath}${options.gitignore ? ', update .gitignore' : ''}${options.clients.length ? ', and install the listed skills' : ''}? [Y/n]: `)).trim();
      if (confirm && !/^y(?:es)?$/i.test(confirm)) {
        process.stdout.write('Setup cancelled; no files written.\n');
        return;
      }
    } finally { prompt.close(); }
  }
  const result = await initializeProject(options);
  process.stdout.write(`Created ${result.configPath}\n`);
  process.stdout.write(`Selected ${result.config.semanticSources.length} document paths; governing source patterns: ${result.config.approvedIntentSources?.length ?? 0}.\n`);
  if (result.skillPlan) process.stdout.write(formatSkillPlan(result.skillPlan));
  process.stdout.write('Review the configuration, select any contracts and owner-approved documents, and commit the inputs you want indexed.\n');
  const configArg = JSON.stringify(result.configPath);
  process.stdout.write(`Next: npx @weftlet/toolkit doctor --config ${configArg}\nThen: npx @weftlet/toolkit hydrate --config ${configArg} --ref HEAD\n`);
  process.stdout.write('Hydration with selected documents uses the configured provider and may incur model charges. Setup made no model requests.\n');
}
