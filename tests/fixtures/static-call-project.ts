import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { createContextGraphApplication } from '../../src/application/application.js';

/** Independently authored source and expectations, never populated from extracted facts. */
export function staticCallProject() {
  const lines = [
    'export function normalize(value: number) { return leaf(value); }',
    'export function analyze(value: number) { return normalize(value) + normalize(value); }',
    'export function plan(value: number) { return analyze(value); }',
    'export function run(value: number) { return plan(value); }',
    'export function recursive(value: number): number { return value ? recursive(value - 1) : 0; }',
    'export function shadow() { function normalize(value: number) { return value + 5; } return normalize(2); }',
    'export function local() { const inner = (value: number) => leaf(value); return inner(2); }',
    'export class Worker {',
    '  private helper(value: number) { return leaf(value); }',
    '  execute(value: number) { return this.helper(value); }',
    '}',
    'export function construct() { return new Worker(); }',
    'export function register(callback: (value: number) => number) { return callback; }',
    'export function configure() { register(leaf); return leaf; }',
    'export function anonymous() { return register(value => leaf(value)); }',
    'export function invoke(callback: (value: number) => number) { return callback(2); }',
    'export function dispatch(key: "one" | "two") { const table = { one: leaf, two: normalize }; return table[key](2); }',
    'export function alias() { const delegated = leaf; return delegated(2); }',
    'export function optional() { return leaf?.(2); }',
    'export function external() { return Math.round(2); }',
    'export interface Contract { execute(value: number): number }',
    'export function declarationOnly(contract: Contract) { return contract.execute(2); }',
    'export function convert(value: number): number;',
    'export function convert(value: string): string;',
    'export function convert(value: string | number) { return value; }',
    'export function useConvert() { return convert(1); }',
    'export type LeafType = typeof leaf;',
    'export const top = leaf(4);',
    'export const publicCatalog = [',
  ];
  // Actual public data rows make helper definitions distant. This is a location workload,
  // not a claim of 3,000 lines of algorithmic complexity or production performance.
  while (lines.length < 2994) lines.push(`  { code: "public-${lines.length}", active: true },`);
  lines.push('] as const;', 'export function unrelated(value: number) { return value * 7; }',
    'export function leaf(value: number) { return value < 0 ? 0 : value; }',
    'export function unicode() { const label = "😀"; return leaf(label.length); }');
  return {
    '.gitattributes': '* text eol=lf\n', '.gitignore': '.context-graph/\ncontext-graph.config.json\n',
    'package.json': '{"name":"public-static-calls","version":"1.0.0","type":"module"}',
    'src/large.ts': lines.join('\n') + '\n',
    'src/consumer.ts': "import { run } from './large.js';\nexport function consume(value: number) { return run(value); }\n",
    'src/copy.ts': 'export function normalize(value: number) { return value; }\nexport function other() { return normalize(1); }\n',
    'src/bom.ts': '\uFEFFexport function bomLeaf() { return 1; }\nexport function bomUse() { return bomLeaf(); }\n',
    'src/view.tsx': "import { leaf } from './large.js';\nexport function View() { return <div>{leaf(1)}</div>; }\n",
    'docs/rules.md': '# Approved policy source\nRule policy belongs to workflow discovery.\n' +
      '[Clamp](../src/large.ts#weftlet-symbol=leaf "weftlet:implementedBy invariant:policy")\n',
  };
}

export const callExpectations = {
  maxFacts: 800, maxHydrationMs: 90_000, maxResponseBytes: 80_000,
  chain: ['run', 'plan', 'analyze', 'normalize', 'leaf'],
  direct: [['normalize', 'leaf'], ['analyze', 'normalize'], ['plan', 'analyze'], ['run', 'plan'],
    ['recursive', 'recursive'], ['shadow', 'normalize'], ['local', 'inner'], ['inner', 'leaf'],
    ['helper', 'leaf'], ['execute', 'helper'], ['construct', 'Worker'], ['configure', 'register'],
    ['anonymous', 'register'], ['optional', 'leaf'], ['external', 'round'], ['declarationOnly', 'execute'],
    ['useConvert', 'convert'], ['unicode', 'leaf']] as const,
  noCallToLeaf: ['configure', 'anonymous', 'invoke', 'dispatch', 'alias'],
  unresolvedCallers: ['anonymous', 'invoke', 'dispatch', 'alias'],
} as const;

export async function staticCallFixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-calls-'));
  try {
    const provider = await readFile(new URL('../../evaluations/mapping-gaps/project/provider.mjs', import.meta.url), 'utf8');
    for (const [path, content] of Object.entries({ ...staticCallProject(), 'provider.mjs': provider })) {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content);
    }
    const template = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    const configPath = join(root, 'context-graph.config.json');
    await writeFile(configPath, JSON.stringify({ ...template, repositoryId: 'public/static-calls',
      semanticSources: ['docs'], approvedIntentSources: ['docs/**'],
      semantic: { ...template.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity: 'public-mapping-grammar:1' },
      scip: { version: '0.4.0', command: 'bundled-scip-typescript', args: ['index', '--no-global-caches'],
        sourceProject: { include: ['src/**/*.ts', 'src/**/*.tsx'], aliases: {} } } }));
    const execute = promisify(execFile);
    const git = async (...args: string[]) => (await execute('git', ['-c', 'core.autocrlf=false',
      '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root })).stdout.trim();
    const commit = async () => { await git('add', '.'); await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public call evidence'); };
    await git('init', '--quiet'); await commit();
    const app = await createContextGraphApplication(configPath);
    return { root, app, git, commit };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
