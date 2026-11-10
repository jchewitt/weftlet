import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { initializeProject } from '../src/interfaces/init.js';
import { diagnoseSetup } from '../src/interfaces/doctor.js';
import { loadConfig } from '../src/configuration/config.js';
import { createContextGraphApplication } from '../src/application/application.js';
import { resolveOpenCodeInvocation } from '../src/extraction/opencode-auth.js';
import { sha256 } from '../src/infrastructure/util.js';

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function temporary() { const root = await mkdtemp(join(tmpdir(), 'weftlet-opencode-consumer-')); roots.push(root); return root; }
async function fixture(root: string) {
  const bin = join(root, 'bin'), pkg = join(bin, 'node_modules/opencode-ai'); await mkdir(pkg, { recursive: true });
  const trace = join(root, 'trace.jsonl'), bad = join(root, 'bad'), foreign = join(root, 'foreign');
  const script = `#!${process.execPath}
const fs=require('node:fs');const args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify({args,cwd:process.cwd(),foreign:!!(process.env.OPENAI_API_KEY||process.env.CODEX_API_KEY||process.env.ANTHROPIC_API_KEY)})+'\\n');
if(args.includes('--version')) console.log('1.19.5');
else if(args[0]==='run') {
 const auth=JSON.parse(process.env.OPENCODE_AUTH_CONTENT),cfg=JSON.parse(process.env.OPENCODE_CONFIG_CONTENT);
 if(auth.fixture?.key!=='public-fixture'||cfg.permission['*']!=='deny'||process.env.OPENCODE_TEST_HOME!==process.cwd()) process.exit(3);
 let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
 if(!input.includes('2|Search uses the worker.')) process.exit(4);
 const output={assertions:[{subject:{id:'capability:search',kind:'Capability',label:'Search'},predicate:'implementedBy',object:{id:'component:file:src/worker.ts',kind:fs.existsSync(${JSON.stringify(bad)})?'Evidence':'Component',label:'Worker'},citation:{startLine:2,endLine:2},confidence:0.95}],oml:'',diagnostics:[]};
 for(const [type,part] of [['step_start',{type:'step-start'}],['text',{type:'text',text:JSON.stringify(output),time:{end:1}}],['step_finish',{type:'step-finish',reason:'stop'}]]) console.log(JSON.stringify({type,sessionID:'fixture',part:{id:type,sessionID:'fixture',messageID:'message',...part}}));
 });
} else process.exit(5);
`;
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'opencode-ai', bin: { opencode: 'cli.cjs' } }));
  await writeFile(join(pkg, 'cli.cjs'), script); await writeFile(join(bin, 'opencode'), script, { mode: 0o755 });
  await writeFile(join(bin, 'opencode.cmd'), '@echo off\r\n"%dp0%\\node.exe" "%dp0%\\node_modules\\opencode-ai\\cli.cjs" %*\r\n');
  const poison = `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(foreign)},'unexpected');process.exit(99);\n`;
  for (const name of ['codex', 'claude']) await writeFile(join(bin, name), poison, { mode: 0o755 });
  vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`); vi.stubEnv('WEFTLET_OPENCODE_API_KEY', 'public-fixture');
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY']) vi.stubEnv(key, 'must-not-inherit');
  return { bin, pkg, trace, bad, foreign };
}

it('initializes OpenCode alone, indexes real TypeScript, validates/publishes, reuses and preserves failed-run bytes', async () => {
  const root = await temporary(), repo = join(root, 'repo'); await mkdir(repo); const f = await fixture(root);
  await mkdir(join(repo, 'src')); await mkdir(join(repo, 'docs'));
  await writeFile(join(repo, 'package.json'), '{"name":"public-opencode-consumer","version":"1.0.0","type":"module"}');
  await writeFile(join(repo, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(repo, 'src/worker.ts'), 'export function work() { return true; }\n');
  await writeFile(join(repo, 'docs/intent.md'), '# Public\nSearch uses the worker.\n');
  await writeFile(join(repo, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' }, include: ['src'] }));
  const init = await initializeProject({ directory: repo, provider: 'opencode-cli', model: 'fixture/public', semanticSources: ['docs/intent.md'] });
  expect(init.config.semantic).toMatchObject({ provider: 'opencode-cli', model: 'fixture/public', reasoningEffort: 'default', auth: { mode: 'opencode-auth' } });
  const config = { ...init.config, approvedIntentSources: ['docs/intent.md'], semantic: { ...init.config.semantic, auth: { mode: 'api-key' } },
    scip: { ...init.config.scip, args: ['index', '--no-global-caches', 'tsconfig.json'] } };
  await writeFile(init.configPath, JSON.stringify(config)); await loadConfig(init.configPath);
  const doctor = await diagnoseSetup(init.configPath);
  expect(doctor).toMatchObject({ opencodeSupported: true, opencodeAuthStatus: 'api-key-present-unverified', opencodeOAuthSupported: false });
  expect(doctor.codexAvailable).toBeUndefined(); expect(doctor.claudeAvailable).toBeUndefined();
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '--quiet'); git('add', '.'); git('-c', 'user.name=Public', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'public OpenCode consumer');
  const app = await createContextGraphApplication(init.configPath);
  const phases: string[] = [];
  const first = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default', onProgress: e => phases.push(e.phase) });
  expect(phases).toContain('validate-shacl'); expect(first.semanticExtracted).toBe(1);
  expect(first.snapshot.facts.filter(fact => fact.extractor.id.startsWith('opencode-cli:'))).toMatchObject([
    { predicate: 'implementedBy', authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed',
      provenance: { path: 'docs/intent.md', startLine: 2, endLine: 2, commitSha: git('rev-parse', 'HEAD').trim() } }]);
  expect(first.snapshot.facts.some(fact => fact.extractor.id === 'scip-symbol-extractor')).toBe(true);
  expect(await app.snapshotStore.read(first.snapshot.manifest.snapshotId)).toEqual(first.snapshot);
  const capture = async () => {
    const hashes: Record<string, string> = {};
    for (const dir of ['artifacts/semantic', 'heads', 'snapshots']) for (const name of await readdir(join(app.storageRoot, dir)))
      hashes[`${dir}/${name}`] = sha256(await readFile(join(app.storageRoot, dir, name)));
    return hashes;
  };
  const before = await capture(), traceBefore = await readFile(f.trace, 'utf8');
  const repeat = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
  expect(repeat.semanticExtracted).toBe(0); expect(repeat.semanticReused).toBe(1);
  expect(repeat.snapshot.manifest.contentDigest).toBe(first.snapshot.manifest.contentDigest);
  expect(repeat.snapshot.manifest.snapshotId).toBe(first.snapshot.manifest.snapshotId);
  expect(await readFile(f.trace, 'utf8')).toBe(traceBefore); expect(await capture()).toEqual(before);
  await writeFile(f.bad, 'invalid kind');
  await expect(app.hydrator.hydrate({ ref: 'HEAD', headName: 'default', forceSemantic: true })).rejects.toThrow('invalid-output');
  expect(await capture()).toEqual(before);
  for (const call of (await readFile(f.trace, 'utf8')).trim().split('\n').map(line => JSON.parse(line))) {
    expect(call.foreign).toBe(false); expect(call.cwd).not.toBe(repo);
    await expect(readdir(call.cwd)).rejects.toMatchObject({ code: 'ENOENT' });
  }
  await expect(readFile(f.foreign)).rejects.toMatchObject({ code: 'ENOENT' });
}, 120000);

it('requires an explicit OpenCode backend, rejects incompatible auth and resolves Windows native npm bins', async () => {
  const root = await temporary();
  await expect(initializeProject({ directory: root, provider: 'opencode-cli' })).rejects.toThrow('--model provider/model');
  await expect(readFile(join(root, 'context-graph.config.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  const init = await initializeProject({ directory: root, provider: 'opencode-cli', model: 'fixture/public' });
  for (const auth of [{ mode: 'chatgpt' }, { mode: 'claude-login' }, { mode: 'opencode-auth', key: 'never-store' }]) {
    await writeFile(init.configPath, JSON.stringify({ ...init.config, semantic: { ...init.config.semantic, auth } }));
    await expect(loadConfig(init.configPath)).rejects.toThrow('semantic.auth');
  }
  const f = await fixture(root); await mkdir(join(f.pkg, 'bin'));
  await writeFile(join(f.pkg, 'package.json'), JSON.stringify({ name: 'opencode-ai', bin: { opencode: './bin/opencode.exe' } }));
  await writeFile(join(f.pkg, 'bin/opencode.exe'), 'public native fixture');
  await writeFile(join(f.bin, 'opencode.cmd'), '@echo off\r\n"%~dp0node_modules\\opencode-ai\\bin\\opencode.exe" %*\r\n');
  expect(await resolveOpenCodeInvocation({ Path: f.bin }, {}, 'win32')).toEqual({ command: join(f.pkg, 'bin/opencode.exe'), prefixArgs: [] });
});
