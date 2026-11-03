import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { createContextGraphApplication } from '../../src/application/application.js';

export const sameGroupBudget = { maxDepth: 3, maxFacts: 60, maxPages: 3 } as const;
export const sameGroupAnchor = 'src/catalog.ts';
export const sameGroupSources = 136;
export const sameGroupOccurrences = 8;
export const sameGroupTarget = { path: 'src/consumers/worker-077.ts', line: 25, symbol: 'score' } as const;

/** Frozen diagnostic corpus. Specific mode distinguishes two workers by a rare
 * shared symbol; symmetric mode gives every worker the same producer connection. */
export async function sameGroupFiles(mode: 'specific' | 'symmetric') {
  const files: Record<string, string> = {
    '.gitignore': '.context-graph/\n', '.gitattributes': '* text eol=lf\n',
    'package.json': JSON.stringify({ name: 'public-same-group-retrieval', version: '1.0.0', type: 'module' }),
    'src/catalog.ts': ["import { RARE, COMMON } from './shared.js';", "import * as Engine from './engine.js';",
      'export function publish() { return [RARE, COMMON, Engine]; }',
      ...Array.from({ length: 48 }, (_, i) => `export interface Record${i} { value: number; }`), ''].join('\n'),
    'src/engine.ts': 'export function score(job: {value:number}) { return job.value; }\n',
    'src/shared.ts': 'export const RARE = { value: 1 };\nexport const COMMON = { value: 2 };\n',

  };
  const worker = (shared: string) => [
    "import { score } from '../engine.js';", `import { ${shared} } from '../shared.js';`,
    'export const setup = 1;',
    ...Array.from({ length: 14 }, () => '// Public repeated-site control.'),
    'export function processBatch(jobs: {value:number}[]) {', `  if (${shared}.value < 0) return [];`, '  return jobs.map(job => {',
    ...Array.from({ length: sameGroupOccurrences }, () => '    score(job);'),
    '    return job.value;', '  });', '}', '',
  ].join('\n');
  for (let i = 0; i < sameGroupSources; i++) files[`src/consumers/worker-${String(i).padStart(3, '0')}.ts`] =
    worker(mode === 'symmetric' || i === 1 || i === 77 ? 'RARE' : 'COMMON');
  for (let i = 0; i < 48; i++) files[`src/setup-${String(i).padStart(3, '0')}.ts`] =
    "import { score } from './engine.js';\nimport { RARE } from './shared.js';\n";
  for (let i = 0; i < 12; i++) files[`test/check-${i}.test.ts`] =
    "import { RARE } from '../src/shared.js';\nexport function check() { return RARE.value; }\n";
  const base = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  files['context-graph.config.json'] = JSON.stringify({ ...base, repositoryId: 'public/same-group-retrieval',
    codeRoots: ['src', 'test'], evidenceRoots: ['test'], semanticSources: [], approvedIntentSources: [],
    scip: { version: '0.4.0', command: 'bundled-scip-typescript', args: ['index', '--no-global-caches'],
      sourceProject: { include: ['src/**/*.ts', 'test/**/*.ts'], aliases: {} } } });
  return files;
}

export async function sameGroupProject(mode: 'specific' | 'symmetric') {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-same-group-'));
  try {
    const files = await sameGroupFiles(mode);
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content);
    }
    const execute = promisify(execFile);
    const git = async (...args: string[]) => execute('git', ['-c', 'core.autocrlf=false',
      '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root, env: { ...process.env,
        GIT_AUTHOR_DATE: '2026-11-03T12:00:00-06:00', GIT_COMMITTER_DATE: '2026-11-03T12:00:00-06:00' } });
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
      'commit', '--quiet', '-m', 'Public same-group retrieval diagnostic');
    return { root, files, app: await createContextGraphApplication(join(root, 'context-graph.config.json')) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
