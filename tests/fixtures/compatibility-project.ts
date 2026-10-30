import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { createContextGraphApplication } from '../../src/application/application.js';
import { compatibilityFiles } from './compatibility-cases.js';
import { obligationFiles } from './obligation-project.js';

export async function compatibilityProject() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-compatibility-')), execute = promisify(execFile);
  try {
    const files: Record<string, string> = { ...Object.fromEntries(Object.entries(obligationFiles).filter(([path]) => !path.endsWith('.md'))),
      ...compatibilityFiles,
      'services/executor.spec.ts': "import { execute } from './executor.js';\nexport const staleRejected = !execute({ observedAt: 0 }, 61000);\n" };
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content);
    }
    const template = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    const config = { ...template, repositoryId: 'public/compatibility', approvedIntentSources: ['docs/queue-subset-producer.md'],
      semanticSources: ['docs'], codeRoots: ['services'], evidenceRoots: ['tests'],
      semantic: { ...template.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity: 'public-obligation-empty:1', maxDocuments: 32 },
      scip: { ...template.scip, args: ['index', '--no-global-caches'], sourceProject: { include: ['services/**/*.ts'] } } };
    const configPath = join(root, 'context-graph.config.json'); await writeFile(configPath, JSON.stringify(config));
    const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root })).stdout.trim();
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Public fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public compatibility declarations');
    const app = await createContextGraphApplication(configPath);
    const hydrated = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    return { root, files, config, configPath, app, git, snapshot: hydrated.snapshot };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
