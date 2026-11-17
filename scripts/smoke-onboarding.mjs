import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

/** The documented no-model tutorial, using two genuinely installed independent Git checkouts. */
export async function smokeOnboarding(parent, coreArchive, toolkitArchive, npmCli) {
  const project = join(parent, 'search tutorial'), receiver = join(parent, 'receiving checkout');
  await mkdir(project);
  const command = async (cwd, program, args, timeout = 120_000) =>
    (await execute(program, args, { cwd, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 })).stdout;
  const npm = (cwd, ...args) => command(cwd, process.execPath, [npmCli, ...args], 240_000);
  const git = (cwd, ...args) => command(cwd, 'git', args);
  const commit = async message => {
    await git(project, 'add', '--all');
    await git(project, '-c', 'user.name=Public Tutorial', '-c', 'user.email=tutorial@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message);
  };
  await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'public-search-tutorial', private: true, type: 'module',
    scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' } }));
  await npm(project, 'install', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund',
    coreArchive, toolkitArchive, 'typescript@5.5.4', 'vitest@3.2.4');
  const installed = join(project, 'node_modules/@weftlet/toolkit');
  for (const entry of await readdir(join(installed, 'examples/generic-typescript'))) {
    if (entry !== 'package.json') await cp(join(installed, 'examples/generic-typescript', entry), join(project, entry), { recursive: true, force: false, errorOnExist: true });
  }
  await writeFile(join(project, '.gitignore'), 'node_modules/\n.context-graph/\nweftlet-*.json\n.tutorial-artifacts/\n');
  const configPath = join(project, 'context-graph.config.json'), config = await readJson(configPath);
  config.semanticSources = []; // Intent extraction is a separately approved live-provider exercise.
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  await git(project, 'init', '--quiet');
  const cli = async (cwd, ...args) => JSON.parse(await command(dirname(cwd), process.execPath,
    [join(cwd, 'node_modules/@weftlet/toolkit/dist/cli.js'), ...args, '--config', join(cwd, 'context-graph.config.json')]));
  assert.equal((await cli(project, 'config', 'validate')).valid, true);
  const setupArgs = ['setup', '--directory', project, '--client', 'codex', '--mcp', '--json'];
  const preview = await cli(project, ...setupArgs, '--dry-run');
  assert.equal(preview.ready, true);
  const setup = await cli(project, ...setupArgs, '--apply', '--expect-plan', preview.planId, '--verify');
  assert.equal(setup.verification.passed, true);
  const skillPath = join(project, '.agents/skills/context-graph-development/SKILL.md');
  const skill = await readFile(skillPath, 'utf8'); assert.match(skill, /impact.scan/);
  await mkdir(join(project, '.github/workflows'), { recursive: true });
  const existingWorkflow = 'name: existing project\non: workflow_dispatch\njobs: {}\n';
  await writeFile(join(project, '.github/workflows/existing.yml'), existingWorkflow);
  const ciArgs = ['setup', 'ci', '--directory', project, '--checks', '--test-script', 'test', '--build-script', 'typecheck', '--json'];
  const ci = await cli(project, ...ciArgs, '--dry-run');
  assert.equal(ci.ready, true);
  await cli(project, ...ciArgs, '--apply', '--expect-plan', ci.planId);
  assert.equal(await readFile(join(project, '.github/workflows/existing.yml'), 'utf8'), existingWorkflow);
  await commit('Set up the documented public demo');
  await npm(project, 'ci', '--ignore-scripts', '--no-audit', '--no-fund');
  await npm(project, 'test'); await npm(project, 'run', 'typecheck');
  const plan = await cli(project, 'hydrate', '--plan', '--ref', 'HEAD', '--json');
  assert.equal(plan.ready, true); assert.equal(plan.documents.length, 0); assert.equal(plan.estimates.extractions, 0);
  const first = await cli(project, 'hydrate', '--ref', 'HEAD', '--json', '--quiet');
  assert.equal(first.semanticExtracted, 0); assert.equal(first.semanticReused, 0);
  const pack = await cli(project, 'impact', 'scan', '--snapshot', first.snapshotId, '--changed-file', 'src/search.ts', '--json');
  assert.ok(pack.facts.length > 0); assert.ok(pack.coverage.counts.implementationAndConsumers > 0);
  assert.equal(pack.coverage.counts.productIntent, 0);
  const verified = await cli(project, ...setupArgs, '--verify', '--snapshot', first.snapshotId);
  assert.equal(verified.verification.snapshot.status, 'readable');
  const { FileSnapshotStore } = await import(pathToFileURL(join(installed, 'dist/storage/storage.js')).href);
  const store = new FileSnapshotStore(join(project, '.context-graph'));
  const originalPath = await store.file(first.snapshotId), originalBytes = await readFile(originalPath);

  const testPath = join(project, 'test/search.test.ts');
  // Execute the reviewed packaged tutorial's test, so the prose example cannot silently drift.
  const tutorial = await readFile(join(installed, 'docs/tutorials/DOCUMENT-SEARCH.md'), 'utf8');
  const exampleTest = tutorial.match(/```ts\r?\n([\s\S]*?)\r?\n```/)?.[1];
  assert.ok(exampleTest && exampleTest.length < 2048 && exampleTest.startsWith("it('passes the trimmed query"));
  await writeFile(testPath, await readFile(testPath, 'utf8') + '\n' + exampleTest + '\n');
  const dirty = await cli(project, 'impact', 'scan', '--snapshot', first.snapshotId, '--changed-file', 'test/search.test.ts', '--json');
  assert.ok(dirty.evidenceState.excludedWorkingChanges.includes('test/search.test.ts'));
  assert.equal(dirty.evidenceState.eligibleForCurrentDiffValidation, false);
  await npm(project, 'test'); await npm(project, 'run', 'typecheck');
  await commit('Test exact delegation without changing product intent');
  const after = await cli(project, 'hydrate', '--ref', 'HEAD', '--json', '--quiet');
  const repeat = await cli(project, 'hydrate', '--ref', 'HEAD', '--json', '--quiet');
  assert.notEqual(after.snapshotId, first.snapshotId);
  assert.equal(after.snapshotId, repeat.snapshotId); assert.equal(after.contentDigest, repeat.contentDigest);
  assert.equal(repeat.semanticExtracted, 0); assert.equal(repeat.semanticReused, 0);
  assert.deepEqual(await readFile(originalPath), originalBytes);
  await cli(project, 'invariant', 'check', '--ref', 'HEAD');
  const output = join(parent, 'tutorial bundle');
  const exported = await cli(project, 'snapshot', 'export', '--snapshot', after.snapshotId, '--output', output);
  await git(parent, 'clone', '--quiet', '--no-hardlinks', project, receiver);
  await npm(receiver, 'ci', '--ignore-scripts', '--no-audit', '--no-fund');
  const importArgs = ['snapshot', 'import', '--input', output, '--expect-digest', exported.manifestSha256, '--activate', '--expect-head', 'none'];
  assert.equal((await cli(receiver, ...importArgs, '--dry-run')).activated, false);
  assert.equal((await cli(receiver, ...importArgs)).activated, true);
  const received = await cli(receiver, 'impact', 'scan', '--snapshot', after.snapshotId, '--changed-file', 'src/search.ts', '--json');
  assert.equal(received.snapshot.contentDigest, after.contentDigest);
  assert.equal(received.evidenceState.configurationMatches, true);
  const receiverSetup = await cli(receiver, 'setup', '--directory', receiver, '--client', 'codex', '--mcp', '--verify', '--snapshot', after.snapshotId, '--json');
  assert.equal(receiverSetup.verification.passed, true);
  assert.equal((await cli(project, ...ciArgs)).files[0].action, 'unchanged');
  assert.equal((await cli(project, ...setupArgs)).skill.files[0].action, 'unchanged');
  await writeFile(skillPath, skill + '\nProject-specific customization.\n');
  let customizationError;
  try { await cli(project, ...setupArgs, '--update'); } catch (error) { customizationError = error; }
  const customized = JSON.parse(customizationError?.stdout ?? '{}');
  assert.equal(customized.ready, false); assert.equal(customized.skill.files[0].action, 'conflict');
  assert.equal(await readFile(skillPath, 'utf8'), skill + '\nProject-specific customization.\n');
  return { mode: 'no-model-public-tutorial', packageVersion: (await readJson(join(installed, 'package.json'))).version,
    node: process.version, platform: process.platform, snapshots: 2, repeatedSnapshotPreserved: true,
    receivingCheckoutVerified: true, modelCalls: 0, clientLoading: 'separate-manual-qualification' };
}
