import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { createContextGraphApplication } from '../../src/application/application.js';

// Freeze source/expectations before comparing query policies. These are relationship
// targets, not a test that merely finds any mention of the worker's file or queue.
export const retrievalBudget = { maxDepth: 3, maxFacts: 60, maxPages: 3 } as const;
export const retrievalDomains = ['analysis', 'delivery', 'learning'] as const;
export const relationshipExpectations = retrievalDomains.map(domain => ({
  domain, changedFiles: [`src/${domain}/source.ts`],
  files: [`src/${domain}/producer.ts`, `src/${domain}/queue.ts`, `src/${domain}/worker.ts`, `test/${domain}.spec.ts`],
  calls: [
    { path: `src/${domain}/producer.ts`, caller: 'publish', callee: 'evaluate' },
    { path: `src/${domain}/producer.ts`, caller: 'publish', callee: 'enqueue' },
    { path: `src/${domain}/worker.ts`, caller: 'processJob', callee: 'evaluate' },
    { path: `test/${domain}.spec.ts`, caller: 'check', callee: 'processJob' },
  ],
}));

export function relationshipRetrievalFiles(): Record<string, string> {
  const files: Record<string, string> = {
    '.gitattributes': '* text eol=lf\n', '.gitignore': '.context-graph/\n',
    'package.json': '{"name":"public-relationship-retrieval","version":"1.0.0","type":"module"}',
    'provider.mjs': `export let calls = 0;
export function createSemanticExtractor() { return { identity: 'public-queue-grammar:1', async extract(source) {
  calls++;
  const assertions = source.content.split('\\n').flatMap((line, index) => {
    const match = /^(src\\/[a-z]+\\/[a-z]+\\.ts) (emits|consumes) queue (public:[a-z]+)\\.$/.exec(line);
    return match ? [{ subject: { id: 'component:file:' + match[1], kind: 'Component', label: match[1] },
      predicate: match[2], object: { id: 'contract:queue:' + match[3], kind: 'Contract', label: match[3] },
      citation: { startLine: index + 1, endLine: index + 1 }, confidence: 1 }] : [];
  });
  if (assertions.length !== 2) throw Error('Public queue fixture must have two cited relationships');
  return { parsed: { assertions, diagnostics: [], oml: '' }, rawModelOutput: JSON.stringify({ assertions }) };
} }; }\n`,
  };
  // Standard-library references are real extracted evidence and remain in the
  // denominator. Put them in the same functions as the calls under evaluation.
  const libraryWork = Array.from({ length: 24 }, (_, i) =>
    `  const values${i}: ReadonlyArray<number> = Array.from(new Set<number>([value]));\n` +
    `  const cache${i}: Map<string, number> = new Map<string, number>();\n` +
    `  cache${i}.set(String(value), Math.max(...values${i}));`).join('\n');
  for (const domain of retrievalDomains) {
    files[`src/${domain}/source.ts`] = `export function evaluate(value: number) {\n${libraryWork}\n  return value < 0 ? 0 : value;\n}\n`;
    files[`src/${domain}/queue.ts`] = `export const QUEUE = 'public:${domain}';\n` +
      'export interface Job { value: number }\n' +
      'export function enqueue(job: Job) { return { queue: QUEUE, job }; }\n';
    files[`src/${domain}/producer.ts`] = "import { evaluate } from './source.js';\nimport { enqueue } from './queue.js';\n" +
      `export function publish(value: number) {\n${libraryWork}\n  return enqueue({ value: evaluate(value) });\n}\n`;
    files[`src/${domain}/worker.ts`] = "import { evaluate } from './source.js';\nimport { QUEUE, type Job } from './queue.js';\n" +
      'export const workerQueue = QUEUE;\nexport function processJob(job: Job) {\n  const value = job.value;\n' +
      `${libraryWork}\n  return evaluate(value);\n}\n`;
    files[`test/${domain}.spec.ts`] = `import { processJob } from '../src/${domain}/worker.js';\n` +
      'export function check(value: number) {\n' + libraryWork + '\n  return processJob({ value }) >= 0;\n}\n';
    files[`docs/${domain}.md`] = `# Public ${domain} queue contract\n` +
      `src/${domain}/producer.ts emits queue public:${domain}.\n` +
      `src/${domain}/worker.ts consumes queue public:${domain}.\n`;
  }
  return files;
}

export async function relationshipRetrievalProject() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-relationship-retrieval-'));
  try {
    const files = relationshipRetrievalFiles();
    const template = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    const config = { ...template, repositoryId: 'public/relationship-retrieval', codeRoots: ['src', 'test'], evidenceRoots: ['test'],
      approvedIntentSources: ['docs/*.md'], semantic: { ...template.semantic, provider: 'module', providerModule: './provider.mjs',
        providerIdentity: 'public-queue-grammar:1', maxDocuments: 3 },
      scip: { version: '0.4.0', command: 'bundled-scip-typescript', args: ['index', '--no-global-caches'],
        sourceProject: { include: ['src/**/*.ts', 'test/**/*.ts'], aliases: {} } } };
    files['context-graph.config.json'] = JSON.stringify(config);
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content);
    }
    const execute = promisify(execFile);
    const git = async (...args: string[]) => (await execute('git', ['-c', 'core.autocrlf=false', '-c', 'maintenance.auto=false',
      '-c', 'gc.auto=0', ...args], { cwd: root, env: { ...process.env,
        GIT_AUTHOR_DATE: '2026-11-02T18:00:00-06:00', GIT_COMMITTER_DATE: '2026-11-02T18:00:00-06:00' } })).stdout.trim();
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
      'commit', '--quiet', '-m', 'Public relationship retrieval fixture');
    const app = await createContextGraphApplication(join(root, 'context-graph.config.json'));
    return { root, app, files, git };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
