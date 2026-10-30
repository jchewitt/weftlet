import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { createContextGraphApplication } from '../../src/application/application.js';

export const monorepoFiles: Readonly<Record<string, string>> = {
  '.gitattributes': '* text eol=lf\n', '.gitignore': '.context-graph/\ncontext-graph.config.json\n',
  'package.json': '{"name":"public-monorepo","private":true,"type":"module"}',
  'pnpm-workspace.yaml': "packages:\n  - 'services/*'\n  - 'apps/*'\n  - 'packages/*'\n",
  'tsconfig.json': '{"files":[],"exclude":["services","apps","packages"]}',
  'packages/contracts/src/reading.ts': 'export interface Reading { value: number }\nexport function label(r: Reading) { return String(r.value); }\n',
  'packages/contracts/src/index.ts': "export { label } from './reading.js';\nexport type { Reading } from './reading.js';\n",
  'packages/external/index.d.ts': 'export declare function external(value: number): number;\n',
  'services/api/src/collect.ts': "import type { Reading } from '@public/contracts';\nimport { external } from '@public/external';\nimport { adjust } from './imported.js';\nexport function collect(r: Reading) { return external(adjust(r.value)); }\n",
  'services/api/src/imported.ts': 'export function adjust(value: number) { return value + 1; }\n',
  'services/api/src/unselected.ts': 'export function notRequested() { return 0; }\n',
  'services/api/src/empty.ts': '// No symbols: observation must come from SCIP documents, not a fact count.\n',
  'services/execution/src/execute.ts': "import type { Reading } from '@public/contracts';\nexport function execute(r: Reading) { return r.value; }\n",
  'services/execution/src/missing.ts': "import { unavailable } from 'unavailable-public-package';\nexport function unresolved() { return unavailable(); }\n",
  'services/independent/src/run.ts': 'export function run(value: number) { return value + 1; }\n',
  'services/omitted/src/run.ts': 'export function run(value: number) { return value + 1; }\n',
  'apps/mobile/src/view.tsx': "import { label } from '@public/contracts';\nimport type { Reading } from '@public/contracts';\nexport function Card(r: Reading) { return <div>{label(r)}</div>; }\n",
  'apps/mobile/src/jsx.d.ts': 'declare namespace JSX { interface IntrinsicElements { div: { children?: unknown } } }\n',
  'docs/owner.md': '# Public source coverage\nCoverage observations do not approve behavior.\n',
  'provider.mjs': 'export function createSemanticExtractor() { return { identity: "public-coverage-empty:1", async extract() { return { parsed: { assertions: [], diagnostics: [], oml: "" }, rawModelOutput: "{}" }; } }; }\n',
};
export const packageRoots = ['apps/mobile', 'packages/contracts', 'packages/external', 'services/api', 'services/execution', 'services/independent', 'services/omitted'];

export async function monorepoProject() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-monorepo-')), execute = promisify(execFile);
  try {
    const files: Record<string, string> = { ...monorepoFiles };
    for (const path of packageRoots) files[`${path}/package.json`] = JSON.stringify({ name: `@public/${path.split('/').at(-1)}`, version: '1.0.0', type: 'module' });
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content);
    }
    const template = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    const config = { ...template, repositoryId: 'public/monorepo-coverage', semanticSources: ['docs'], evidenceRoots: ['test'],
      codeRoots: packageRoots.filter(path => path !== 'services/omitted'),
      semantic: { ...template.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity: 'public-coverage-empty:1' },
      scip: { ...template.scip, args: ['index', '--no-global-caches'], sourceProject: {
        include: ['packages/**/*.ts', 'services/api/src/collect.ts', 'services/api/src/empty.ts', 'services/execution/**/*.ts', 'services/independent/**/*.ts', 'apps/mobile/**/*.tsx', 'apps/mobile/**/*.d.ts'],
        aliases: { '@public/contracts': 'packages/contracts/src/index.ts', '@public/external': 'packages/external/index.d.ts' } } } };
    const configPath = join(root, 'context-graph.config.json'); await writeFile(configPath, JSON.stringify(config));
    const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root })).stdout.trim();
    const commit = async () => { await git('add', '.'); await git('-c', 'user.name=Public fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public monorepo fixture'); };
    await git('init', '--quiet'); await commit();
    const app = await createContextGraphApplication(configPath);
    const hydrated = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    return { root, files, config, configPath, app, git, commit, snapshot: hydrated.snapshot };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
