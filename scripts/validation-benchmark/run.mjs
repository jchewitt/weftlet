#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { syntheticSnapshot } from '../benchmark-shacl.mjs';
import { scenarios, scenarioSnapshot, expectedConformance, hash } from './inputs.mjs';
import { observe, workerExecutor, cancellationProbe } from './execution.mjs';

const script = fileURLToPath(import.meta.url);
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);

export function options(args) {
  const config = { counts: [2000], fixtures: ['pipeline', 'shared', 'unique'], modes: ['direct', 'worker'],
    scenarios: [...scenarios], samples: 3, deadlineMs: 45_000 };
  const fields = { '--counts': 'counts', '--fixtures': 'fixtures', '--modes': 'modes', '--scenarios': 'scenarios',
    '--samples': 'samples', '--deadline-ms': 'deadlineMs' };
  for (let index = 0; index < args.length; index++) {
    const field = fields[args[index]], value = args[++index];
    assert(field && value && !value.startsWith('--'), 'Unknown option or missing value');
    config[field] = ['samples', 'deadlineMs'].includes(field) ? Number(value)
      : [...new Set(value.split(',').map(item => field === 'counts' ? Number(item) : item))];
  }
  assert(config.counts.length && config.counts.every(n => Number.isInteger(n) && n >= 2 && n <= 10_000), 'Counts must be 2–10000');
  assert(config.fixtures.length && config.fixtures.every(x => ['pipeline', 'shared', 'unique'].includes(x)), 'Invalid fixtures');
  assert(config.modes.length && config.modes.every(x => ['direct', 'worker'].includes(x)), 'Invalid modes');
  assert(config.scenarios.length && config.scenarios.every(x => scenarios.includes(x)), 'Invalid scenarios');
  assert(!config.scenarios.includes('repeat') || config.scenarios.indexOf('repeat') === config.scenarios.indexOf('cold') + 1 && config.scenarios.includes('cold'), 'Repeat must immediately follow cold');
  assert(Number.isInteger(config.samples) && config.samples >= 1 && config.samples <= 5, 'Samples must be 1–5');
  assert(Number.isInteger(config.deadlineMs) && config.deadlineMs >= 1 && config.deadlineMs <= 45_000, 'Deadline must be 1–45000 ms');
  return config;
}

async function child(spec) {
  const snapshot = spec.fixture === 'pipeline' ? JSON.parse(await readFile(spec.fixturePath, 'utf8')) : syntheticSnapshot(spec.count, spec.fixture);
  const startup = performance.now();
  const executor = spec.mode === 'worker' ? await workerExecutor() : { run: (await import('./measure.mjs')).measure, close: async () => {} };
  const startupMs = performance.now() - startup;
  try {
    const cases = [];
    for (const scenario of spec.scenarios) {
      const input = scenarioSnapshot(snapshot, scenario);
      const result = await observe(() => executor.run(input, scenario));
      assert.equal(result.conforms, expectedConformance(scenario), `Unexpected ${scenario} verdict`);
      cases.push(result);
      emit({ kind: 'case', result });
    }
    const cold = cases.find(c => c.scenario === 'cold');
    if (cold) for (const result of cases.filter(c => ['repeat', 'rebuild'].includes(c.scenario))) {
      assert.equal(result.canonicalDigest, cold.canonicalDigest, 'Identical evidence changed serialization');
      assert.equal(result.verdictDigest, cold.verdictDigest, 'Identical evidence changed verdict');
    }
    emit({ kind: 'complete', startupMs });
  } finally { await executor.close(); }
}

export async function runBoundedCase(spec, deadlineMs) {
  const started = performance.now();
  const child = spawn(process.execPath, ['--expose-gc', script, '--child', JSON.stringify(spec)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '', stderr = '', timedOut = false, spawnError;
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  child.on('error', error => { spawnError = error.message; });
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, deadlineMs);
  const { code, signal } = await new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })));
  clearTimeout(timer);
  const lines = stdout.split('\n'), trailing = lines.pop();
  const messages = [], diagnostics = [];
  for (const line of lines.filter(Boolean)) {
    try { messages.push(JSON.parse(line)); } catch { diagnostics.push('Malformed child JSON'); }
  }
  if (trailing) diagnostics.push('Incomplete child JSON');
  const complete = code === 0 && !spawnError && !diagnostics.length && messages.at(-1)?.kind === 'complete';
  const { fixturePath: _path, ...publicSpec } = spec;
  return { ...publicSpec, status: timedOut ? 'timeout' : complete ? 'complete' : 'error', code, signal,
    deadlineMs, processElapsedMs: performance.now() - started,
    cases: messages.filter(m => m.kind === 'case').map(m => m.result), startupMs: messages.at(-1)?.startupMs,
    ...(diagnostics.length ? { diagnostics } : {}), ...(stderr || spawnError ? { error: spawnError ?? stderr.trim() } : {}) };
}

export function compareModes(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.fixture}:${run.count}:${run.sample}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return [...groups].map(([key, pair]) => {
    if (pair.some(run => run.status !== 'complete')) return { key, status: 'incomplete' };
    if (pair.length !== 2) return { key, status: 'single-mode' };
    const match = pair[0].cases.length === pair[1].cases.length && pair[0].cases.every((value, index) =>
      ['scenario', 'canonicalDigest', 'verdictDigest', 'conforms', 'issueCount'].every(field => value[field] === pair[1].cases[index][field]));
    return { key, status: match ? 'exact-verdict-and-data-match' : 'mismatch' };
  });
}

async function main(args) {
  if (args.includes('--help')) {
    process.stdout.write('Build first: pnpm build\nnode scripts/validation-benchmark/run.mjs [--counts 2000] [--fixtures pipeline,shared,unique] [--samples 3] [--modes direct,worker] [--scenarios cold,repeat,rebuild,insert,update,delete,rename,invalid-confidence,invalid-shared-kind,repair-delete] [--deadline-ms 45000]\nPublic development benchmark only. Workers and exact-result keys are experiments, not production options. Each fixture/mode/sample uses a fresh bounded child. Repeat revalidates the same object; rebuild constructs identical evidence afresh. Changed inputs always run full validation. No model calls; pipeline preparation uses an offline provider and real SCIP. Reports contain metadata/timings/digests, not graph contents. No performance thresholds are CI gates.\n');
    return;
  }
  const config = options(args);
  const directory = await mkdtemp(join(tmpdir(), 'weftlet-validation-study-'));
  const fixturePath = join(directory, 'public-pipeline.json');
  try {
    if (config.fixtures.includes('pipeline')) await promisify(execFile)(process.execPath,
      ['--import', 'tsx', fileURLToPath(new URL('./extracted.ts', import.meta.url)), fixturePath],
      { cwd: root, timeout: 45_000, maxBuffer: 4 * 1024 * 1024 });
    const runs = [];
    for (const fixture of config.fixtures) for (const count of fixture === 'pipeline' ? [0] : config.counts) {
      for (let sample = 1; sample <= config.samples; sample++) for (const mode of config.modes) {
        process.stderr.write(`Validation study: ${fixture} ${count || 'extracted'} facts, sample ${sample}, ${mode}\n`);
        runs.push(await runBoundedCase({ fixture, count, sample, mode, scenarios: config.scenarios, fixturePath }, config.deadlineMs));
      }
    }
    const comparisons = compareModes(runs);
    const cancellation = await cancellationProbe(syntheticSnapshot(2000, 'unique'));
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const report = { schemaVersion: 1, generatedAt: new Date().toISOString(),
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      dependencies: { n3: pkg.dependencies.n3, shacl: pkg.dependencies['rdf-validate-shacl'] }, config,
      harnessDigests: Object.fromEntries(await Promise.all(['run.mjs', 'inputs.mjs', 'execution.mjs', 'measure.mjs', 'worker.mjs', 'extracted.ts']
        .map(async name => [name, hash(await readFile(new URL(name, import.meta.url)))]))),
      units: 'All times milliseconds; RSS/heap bytes; maxRSS KiB. Whole process including imports, fixture, serialized data and validation; worker RSS includes parent.',
      methodology: 'Fresh child per fixture/mode/sample. Forced GC before each measured case, outside timers. Full validation every time. Serialization/key hashing measured separately. Worker startup and structured-clone roundtrip included separately. Timer probe is responsiveness, not progress. No production cache/worker/incremental backend.',
      runs, comparisons, cancellation };
    emit(report);
    if (runs.some(run => run.status !== 'complete') || comparisons.some(result => result.status === 'mismatch')) process.exitCode = 1;
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
}

if (resolve(process.argv[1] ?? '') === script) {
  try { if (process.argv[2] === '--child') await child(JSON.parse(process.argv[3])); else await main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; }
}
