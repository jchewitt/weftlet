import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { promisify } from 'node:util';
import { createContextGraphApplication } from '../../src/application/application.js';

export const indirectRetrievalBudget = { maxDepth: 3, maxFacts: 60, maxPages: 3 } as const;
export const indirectAnchor = 'src/catalog.ts';
export const indirectTarget = { path: 'src/worker.ts', line: 7, symbol: 'evaluate' } as const;

/** Frozen public setup/no-call-proof corpus. Do not tune source counts or targets
 * when changing ranking; compare the same saved snapshot first. */
export async function indirectRetrievalFiles() {
  const files: Record<string, string> = {
    '.gitignore': '.context-graph/\n', '.gitattributes': '* text eol=lf\n',
    'package.json': JSON.stringify({ name: 'public-indirect-retrieval', version: '1.0.0', type: 'module' }),
    'src/catalog.ts': Array.from({ length: 48 }, (_, i) => `export interface Record${i} { value: number; }`).join('\n') + '\n',
    'src/engine.ts': [
      "import type { Record0, Record1 } from './catalog.js';", 'export class Engine {',
      '  readonly setup: Record1 = {value: 1};',
      '  evaluate(job: Record0) { return job.value + this.setup.value; }', '}', '',
    ].join('\n'),
    'src/worker.ts': [
      "import { Engine } from './engine.js';", "import type { Record47 } from './catalog.js';",
      'export const setup: Record47 = { value: 1 };', 'const engine = new Engine();',
      "export const queue = 'public:review';", 'export function processBatch(jobs: {value:number}[]) {',
      '  return jobs.map(job => engine.evaluate(job));', '}', '',
    ].join('\n'),
  };
  for (let i = 0; i < 192; i++) {
    files[`src/parts/setup-${String(i).padStart(3, '0')}.ts`] =
      "import type * as Catalog from '../catalog.js';\n" + Array.from({ length: 8 }, (_, j) =>
        `export interface Setting${j} { input: Catalog.Record${(i + j) % 48}; }`).join('\n') + '\n';
  }
  const base = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  files['context-graph.config.json'] = JSON.stringify({ ...base, repositoryId: 'public/indirect-retrieval',
    codeRoots: ['src'], evidenceRoots: [], semanticSources: [], approvedIntentSources: [],
    scip: { version: '0.4.0', command: 'bundled-scip-typescript', args: ['index', '--no-global-caches'],
      sourceProject: { include: ['src/**/*.ts'], aliases: {} } } });
  return files;
}

export async function indirectRetrievalProject() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-indirect-retrieval-'));
  try {
    const files = await indirectRetrievalFiles();
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }
    const execute = promisify(execFile);
    const git = async (...args: string[]) => (await execute('git', ['-c', 'core.autocrlf=false',
      '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root, env: { ...process.env,
        GIT_AUTHOR_DATE: '2026-11-03T04:00:00Z', GIT_COMMITTER_DATE: '2026-11-03T04:00:00Z' } })).stdout.trim();
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
      'commit', '--quiet', '-m', 'Public indirect retrieval');
    return { root, files, app: await createContextGraphApplication(join(root, 'context-graph.config.json')) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
