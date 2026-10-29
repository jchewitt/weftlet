import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { createContextGraphApplication } from '../../src/application/application.js';
import { codeEvidenceProject } from './code-evidence-project.js';

export const bindingFiles = {
  ...codeEvidenceProject(),
  'src/duplicates.ts': 'export class First { run() { return 1; } }\nexport class Second { run() { return 2; } }\n',
  'src/barrel.ts': "export { normalize as publicAlias } from './large.js';\n",
  'src/declarations.d.ts': 'export declare function declared(): number;\n',
  'docs/rules.md': '# Rules\nRule max-age constrains workflow planning.\n',
  'docs/links.md': [
    '# Explicit mapping declarations',
    '[implementation](../src/large.ts#weftlet-symbol=normalize "weftlet:implementedBy invariant:max-age")',
    '[test](../test/mock.spec.ts#weftlet-symbol=check "weftlet:verifiedBy invariant:max-age")',
    '[private helper](../src/large.ts#weftlet-symbol=Engine.helper)',
    '[overload](../src/large.ts#weftlet-symbol=overloaded)',
    '[qualified](../src/duplicates.ts#weftlet-symbol=First.run)',
    '[ambiguous](../src/duplicates.ts#weftlet-symbol=run)',
    '[missing](../src/large.ts#weftlet-symbol=absent)',
    '[unknown subject](../src/large.ts#weftlet-symbol=run "weftlet:implementedBy invariant:unknown")',
    '[alias](../src/barrel.ts#weftlet-symbol=publicAlias&weftlet-line=1&weftlet-column=23)',
    '[declaration](../src/declarations.d.ts#weftlet-symbol=declared)',
    '[bom](../src/bom.ts#weftlet-symbol=bom&weftlet-line=1&weftlet-column=18)',
    '[reference][repeat]', '',
    '[repeat]: ../src/large.ts#weftlet-symbol=normalize',
    '[consumer](../src/consumer.ts#weftlet-symbol=consume)',
    '[removed](../src/unrelated.ts#weftlet-symbol=other)',
    '[contract check](../test/mock.spec.ts#weftlet-symbol=check "weftlet:verifiedBy contract:file:src/declarations.d.ts")', '',
  ].join('\n'),
};

/** Offline prose parser for acceptance; real SCIP, assembly, caching and validation run unchanged. */
const provider = `
import { appendFile } from 'node:fs/promises';
export function createSemanticExtractor() {
  return { identity: 'public-symbol-bindings:1', async extract(source) {
    await appendFile(new URL('./provider-calls.log', import.meta.url), source.path + '\\n');
    const assertions = source.content.split('\\n').flatMap((line, index) => {
      const match = /^Rule ([\\w-]+) constrains workflow ([\\w-]+)\\.$/.exec(line);
      return match ? [{ subject: {id:'workflow:'+match[2],kind:'Workflow',label:match[2]}, predicate:'governedBy',
        object:{id:'invariant:'+match[1],kind:'Invariant',label:match[1]},
        citation:{startLine:index+1,endLine:index+1},confidence:0.9 }] : [];
    });
    const parsed = { assertions, diagnostics: [], oml: '' };
    return { parsed, rawModelOutput: JSON.stringify(parsed) };
  } };
}`;

export async function symbolBindingFixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-bindings-'));
  try {
    for (const [path, contents] of Object.entries({ ...bindingFiles, 'provider.mjs': provider })) {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), contents);
    }
    await writeFile(join(root, '.gitignore'), '.context-graph/\ncontext-graph.config.json\nprovider-calls.log\n');
    const template = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    const configPath = join(root, 'context-graph.config.json');
    await writeFile(configPath, JSON.stringify({ ...template, repositoryId: 'public/symbol-bindings',
      contractPatterns: ['src/declarations.d.ts'], semanticSources: ['docs'], approvedIntentSources: ['docs/rules.md', 'docs/links.md'], evidenceRoots: ['test'],
      semantic: { ...template.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity: 'public-symbol-bindings:1' },
      scip: { command: 'bundled-scip-typescript', version: '0.4.0', args: ['index', '--no-global-caches'],
        sourceProject: { include: ['src/**/*.ts', 'test/**/*.ts'], aliases: {} } } }));
    const execute = promisify(execFile);
    const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root })).stdout.trim();
    const commit = async () => { await git('add', '.'); await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public symbol bindings'); };
    await git('init', '--quiet'); await commit();
    const app = await createContextGraphApplication(configPath);
    return { root, app, git, commit, configPath };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
