import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { initializeProject } from '../src/interfaces/init.js';
import { diagnoseSetup } from '../src/interfaces/doctor.js';
import { loadConfig } from '../src/configuration/config.js';
import { createContextGraphApplication } from '../src/application/application.js';
import { RdfEvidenceGraph } from '../src/graph/rdf.js';
import { resolveClaudeInvocation } from '../src/extraction/claude-auth.js';
import { sha256 } from '../src/infrastructure/util.js';

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function temporary() { const root = await mkdtemp(join(tmpdir(), 'weftlet-claude-consumer-')); roots.push(root); return root; }
async function installFixture(root: string) {
  const bin = join(root, 'tools'), pkg = join(bin, 'node_modules/@anthropic-ai/claude-code');
  await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-code', bin: { claude: 'cli.cjs' } }));
  const trace = join(root, 'trace.jsonl'), bad = join(root, 'invalid');
  const script = `#!${process.execPath}
const {appendFileSync,existsSync}=require('node:fs');
const args=process.argv.slice(2);
appendFileSync(${JSON.stringify(trace)},JSON.stringify({args,cwd:process.cwd(),foreignCredentials:!!(process.env.CODEX_API_KEY||process.env.OPENAI_API_KEY||process.env.ANTHROPIC_API_KEY)})+'\\n');
if(args.includes('--version')) console.log('2.1.321 (Claude Code)');
else if(args.includes('status')) console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty'}));
else if(args.includes('--print')) {
 let prompt=''; process.stdin.on('data',c=>prompt+=c);process.stdin.on('end',()=>{
  if(!prompt.includes('2|Search uses the worker.')) process.exit(2);
  console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,structured_output:{assertions:[{
   subject:{id:'capability:search',kind:'Capability',label:'Search'},predicate:'implementedBy',
   object:{id:'component:file:src/worker.ts',kind:existsSync(${JSON.stringify(bad)})?'Evidence':'Component',label:'Worker'},
   citation:{startLine:2,endLine:2},confidence:0.95}],oml:'',diagnostics:[]}}));
 });
} else process.exit(3);
`;
  const entry = join(pkg, 'cli.cjs'); await writeFile(entry, script);
  await writeFile(join(bin, 'claude'), script, { mode: 0o755 });
  await writeFile(join(bin, 'claude.cmd'), '@echo off\r\n"%dp0%\\node.exe" "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.cjs" %*\r\n');
  // A poison Codex launcher proves provider selection never probes or executes Codex.
  const poison = `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(join(root, 'codex-ran'))},'unexpected');process.exit(99);\n`;
  await writeFile(join(bin, 'codex'), poison, { mode: 0o755 });
  vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`);
  vi.stubEnv('OPENAI_API_KEY', 'must-not-inherit'); vi.stubEnv('CODEX_API_KEY', 'must-not-inherit');
  vi.stubEnv('ANTHROPIC_API_KEY', 'must-not-inherit');
  return { bin, entry, trace, bad };
}

it('initializes a Claude-only consumer, hydrates with real SCIP/strict SHACL, reloads and reuses without Codex', async () => {
  const root = await temporary(), repo = join(root, 'repo'); await mkdir(repo);
  const fixture = await installFixture(root);
  await mkdir(join(repo, 'src')); await mkdir(join(repo, 'docs'));
  await writeFile(join(repo, 'package.json'), '{"name":"public-claude-consumer","version":"1.0.0","type":"module"}');
  await writeFile(join(repo, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(repo, 'src/worker.ts'), 'export function work() { return true; }\n');
  await writeFile(join(repo, 'docs/intent.md'), '# Public\nSearch uses the worker.\n');
  await writeFile(join(repo, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' }, include: ['src'] }));
  const initialized = await initializeProject({ directory: repo, provider: 'claude-cli', model: 'public-fixture', semanticSources: ['docs/intent.md'] });
  const config = { ...initialized.config, approvedIntentSources: ['docs/intent.md'],
    scip: { ...initialized.config.scip, args: ['index', '--no-global-caches', 'tsconfig.json'] } };
  await writeFile(initialized.configPath, JSON.stringify(config));
  expect((await loadConfig(initialized.configPath)).config.semantic.auth).toEqual({ mode: 'claude-login' });
  const doctor = await diagnoseSetup(initialized.configPath);
  expect(doctor).toMatchObject({ semanticProvider: 'claude-cli', claudeSupported: true, claudeAuthStatus: 'claude-login-present' });
  expect(doctor.codexAvailable).toBeUndefined();
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '--quiet'); git('add', '.'); git('-c', 'user.name=Public', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'public Claude consumer');
  const app = await createContextGraphApplication(initialized.configPath);
  // Constructing the application does not authenticate a provider or run a model.
  expect((await readFile(fixture.trace, 'utf8')).trim().split('\n')).toHaveLength(2);
  const first = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
  expect(first.semanticExtracted).toBe(1); expect(first.semanticReused).toBe(0);
  const semantic = first.snapshot.facts.filter(f => f.extractor.id.startsWith('claude-cli:'));
  expect(semantic).toHaveLength(1);
  expect(semantic[0]).toMatchObject({ predicate: 'implementedBy', authority: 'inferred', sourceAuthority: 'declared',
    extractionReview: 'unreviewed', confidence: 0.95, provenance: { path: 'docs/intent.md', startLine: 2, endLine: 2, commitSha: git('rev-parse', 'HEAD').trim() } });
  expect(first.snapshot.facts.some(f => f.extractor.id === 'scip-symbol-extractor')).toBe(true);
  expect((await new RdfEvidenceGraph(first.snapshot).validate()).conforms).toBe(true);
  expect(await app.snapshotStore.read(first.snapshot.manifest.snapshotId)).toEqual(first.snapshot);
  const capture = async () => {
    const hashes: Record<string, string> = {};
    for (const dir of ['artifacts/semantic', 'heads', 'snapshots']) for (const name of await readdir(join(app.storageRoot, dir)))
      hashes[`${dir}/${name}`] = sha256(await readFile(join(app.storageRoot, dir, name)));
    return hashes;
  };
  const before = await capture(), traceBefore = await readFile(fixture.trace, 'utf8');
  const repeat = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
  expect(repeat.semanticExtracted).toBe(0); expect(repeat.semanticReused).toBe(1);
  expect(repeat.snapshot.manifest.snapshotId).toBe(first.snapshot.manifest.snapshotId);
  expect(repeat.snapshot.manifest.contentDigest).toBe(first.snapshot.manifest.contentDigest);
  expect(await capture()).toEqual(before); expect(await readFile(fixture.trace, 'utf8')).toBe(traceBefore);
  await writeFile(fixture.bad, 'invalid kind');
  await expect(app.hydrator.hydrate({ ref: 'HEAD', headName: 'default', forceSemantic: true })).rejects.toThrow('invalid-output');
  expect(await capture()).toEqual(before);
  const calls = (await readFile(fixture.trace, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  expect(calls.every(c => !c.foreignCredentials)).toBe(true);
  for (const call of calls.filter(c => c.args.includes('--print'))) {
    expect(call.cwd).not.toBe(repo); await expect(readdir(call.cwd)).rejects.toMatchObject({ code: 'ENOENT' });
  }
  await expect(readFile(join(root, 'codex-ran'))).rejects.toMatchObject({ code: 'ENOENT' });
}, 120_000);

it('resolves standard Windows Claude npm JS/native launchers without running a command shell', async () => {
  const root = await temporary(), fixture = await installFixture(root);
  expect(await resolveClaudeInvocation({ Path: fixture.bin }, {}, 'win32')).toEqual({ command: process.execPath, prefixArgs: [fixture.entry] });
  const pkg = join(fixture.bin, 'node_modules/@anthropic-ai/claude-code');
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-code', bin: { claude: 'claude.exe' } }));
  await writeFile(join(pkg, 'claude.exe'), 'public native fixture');
  await writeFile(join(fixture.bin, 'claude.cmd'), '@echo off\r\n"%~dp0node_modules\\@anthropic-ai\\claude-code\\claude.exe" %*\r\n');
  expect(await resolveClaudeInvocation({ Path: fixture.bin }, {}, 'win32')).toEqual({ command: join(pkg, 'claude.exe'), prefixArgs: [] });
  await writeFile(join(fixture.bin, 'claude.cmd'), 'arbitrary wrapper');
  await expect(resolveClaudeInvocation({ Path: fixture.bin }, {}, 'win32')).rejects.toThrow('Unsupported Claude Code launcher');
});

it('rejects mismatched provider auth and preserves an existing configuration', async () => {
  const root = await temporary();
  const init = await initializeProject({ directory: root, provider: 'claude-cli' });
  for (const auth of [{ mode: 'chatgpt' }, { mode: 'claude-login', apiKey: 'never-store' }, { mode: 'api-key', apiKeyEnv: 'BAD-NAME' }]) {
    await writeFile(init.configPath, JSON.stringify({ ...init.config, semantic: { ...init.config.semantic, auth } }));
    await expect(loadConfig(init.configPath)).rejects.toThrow('semantic.auth');
  }
  for (const provider of [['claude-cli'], null, 'unknown-cli']) {
    await writeFile(init.configPath, JSON.stringify({ ...init.config, semantic: { ...init.config.semantic, provider } }));
    await expect(loadConfig(init.configPath)).rejects.toThrow('semantic.provider');
  }
  await writeFile(init.configPath, JSON.stringify(init.config));
  await expect(initializeProject({ directory: root, provider: 'codex-cli' })).rejects.toThrow('already exists');
  expect((await loadConfig(init.configPath)).config.semantic.provider).toBe('claude-cli');
});
