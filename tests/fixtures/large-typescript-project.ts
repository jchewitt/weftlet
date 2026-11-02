import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { createContextGraphApplication } from '../../src/application/application.js';

/** Generated public source, indexed by real SCIP/TS. No copied facts or model requests. */
export async function largeTypeScriptProject(modules: number, functions: number) {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-corpus-'));
  try {
    const files: Record<string, string> = {
      '.gitattributes': '* text eol=lf\n', '.gitignore': '.context-graph/\n',
      'package.json': '{"name":"public-large-corpus","version":"1.0.0","type":"module"}',
      'src/shared.ts': 'export function normalize(value: number) { return value < 0 ? 0 : value; }\n',
      'provider.mjs': `export let calls = 0;
export function createSemanticExtractor() { return { identity: 'public-corpus-prose:1', async extract(source) {
  calls++;
  const match = /^The (\\w+) capability is implemented by (src\\/module-\\d+\\.ts)\\.$/m.exec(source.content);
  if (!match) throw Error('Public fixture source must contain its expected assertion');
  const assertions = [{ subject: { id: 'capability:' + match[1], kind: 'Capability', label: match[1] },
    predicate: 'implementedBy', object: { id: 'component:file:' + match[2], kind: 'Component', label: match[2] },
    citation: { startLine: 2, endLine: 2 }, confidence: 1 }];
  return { parsed: { assertions, diagnostics: [], oml: '' }, rawModelOutput: JSON.stringify({ assertions }) };
} }; }\n`,
    };
    for (let module = 0; module < modules; module++) {
      const lines = ["import { normalize } from './shared.js';",
        'function clamp(value: number) { return normalize(value); }'];
      for (let index = 0; index < functions; index++) {
        lines.push(`export function stage${index}(value: number) { const adjusted = clamp(value); return normalize(adjusted) + clamp(value); }`);
      }
      files[`src/module-${module}.ts`] = lines.join('\n') + '\n';
      files[`test/module-${module}.spec.ts`] = `import { stage0 } from '../src/module-${module}.js';\nexport function check() { return stage0(-1) === 0; }\n`;
    }
    for (let doc = 0; doc < 18; doc++) files[`docs/rule-${doc}.md`] =
      `# Public rule ${doc}\nThe rule${doc} capability is implemented by src/module-${doc % modules}.ts.\n` +
      `[Implementation](../src/module-${doc % modules}.ts#weftlet-symbol=stage0)\n`;
    const template = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    const config = { ...template, repositoryId: 'public/large-typescript', codeRoots: ['src', 'test'],
      approvedIntentSources: ['docs/*.md'], semantic: { ...template.semantic, provider: 'module',
        providerModule: './provider.mjs', providerIdentity: 'public-corpus-prose:1', maxDocuments: 18 } };
    files['context-graph.config.json'] = JSON.stringify(config);
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content);
    }
    const execute = promisify(execFile);
    const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root })).stdout.trim();
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Public corpus', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public generated TypeScript corpus');
    const app = await createContextGraphApplication(join(root, 'context-graph.config.json'));
    return { root, files, git, app };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
