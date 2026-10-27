#!/usr/bin/env node
// Public synthetic benchmark; build first. No providers, private data, or timing gates.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const seed = 'weftlet-public-shacl-v1';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

function fixture(count, topology) {
  const facts = Array.from({ length: count }, (_, i) => ({
    id: hash(`${seed}:${topology}:${i}`),
    subject: { id: `workflow:dispatch-${topology === 'shared' ? i % 10 : i}`,
      kind: 'Workflow', label: `Dispatch ${topology === 'shared' ? i % 10 : i}` },
    predicate: 'implementedBy',
    object: { id: `component:file:src/worker-${topology === 'shared' ? i % 40 : i}.ts`,
      kind: 'Component', label: `Worker ${topology === 'shared' ? i % 40 : i}`,
      attributes: { domain: 'public-synthetic', indexed: true } },
    provenance: { path: `docs/public-owner-${i % 19}.md`, startLine: i % 50 + 1,
      endLine: i % 50 + 1, digest: hash(`public-document-${i % 19}`), commitSha: '1'.repeat(40) },
    extractor: { id: 'public-scaling-fixture', version: '1' }, confidence: 0.95,
    snapshotId: seed, authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed',
  }));
  return {
    manifest: { schemaVersion: 1, repositoryId: 'public/shacl-scaling', ref: 'HEAD',
      commitSha: '1'.repeat(40), snapshotId: seed, configurationDigest: hash(seed), scope: ['docs'],
      ontologyVersion: 'rdf-v1', extractorVersions: { fixture: '1' }, semanticModel: 'none',
      semanticPromptVersion: 'none', generatedAt: '2026-01-01T00:00:00.000Z',
      contentDigest: hash(JSON.stringify(facts)), semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
    facts, invariants: [], runtimeEvidence: [], unresolved: [],
  };
}

async function worker({ count, topology, mode }) {
  const { RdfEvidenceGraph, inspectGraphIdentities } = await import('../dist/index.js');
  const { Parser, Store } = await import('n3');
  const { default: SHACLValidator } = await import('rdf-validate-shacl');
  const { evidenceShapes } = await import('../dist/graph/shacl-shapes.js');
  const started = performance.now();
  const snapshot = fixture(count, topology);
  const fixtureMs = performance.now() - started;
  const preflightStarted = performance.now();
  const preflight = inspectGraphIdentities(snapshot.facts, { repositoryId: snapshot.manifest.repositoryId });
  const preflightMs = performance.now() - preflightStarted;
  assert(preflight.passed && !preflight.shaclValidated, 'Preflight is not a full conformance verdict');
  const constructionStarted = performance.now();
  const graph = new RdfEvidenceGraph(snapshot);
  const constructionMs = performance.now() - constructionStarted;
  const serializationStarted = performance.now();
  const before = await graph.serialize();
  const serializationBeforeMs = performance.now() - serializationStarted;
  const serializationDigest = hash(before);
  // N-Quads escapes literal newlines and writes one newline-terminated quad per line.
  const quadCount = before.split('\n').length - 1;
  const nodeCount = new Set(snapshot.facts.flatMap(f => [f.subject.id, f.object.id])).size;
  const preparationStarted = performance.now();
  const legacy = mode === 'legacy'
    ? new Store(new Parser({ format: 'N-Quads' }).parse(before)) : undefined;
  const legacyPreparationMs = performance.now() - preparationStarted;
  const details = { count, topology, mode, nodeCount, quadCount, namedGraphCount: count,
    fixtureMs, preflightMs, constructionMs, serializationBeforeMs, legacyPreparationMs, serializationDigest };
  emit({ phase: 'validating', ...details });
  const validationStarted = performance.now();
  const cpuStarted = process.cpuUsage();
  const validationPhases = [];
  const report = mode === 'legacy'
    ? await new SHACLValidator(new Store(evidenceShapes)).validate(legacy)
    : await graph.validate({ onProgress: event => validationPhases.push(event) });
  const validationMs = performance.now() - validationStarted;
  const validationCpu = process.cpuUsage(cpuStarted);
  const serializationAfterStarted = performance.now();
  const serializationAfterDigest = hash(await graph.serialize());
  const serializationAfterMs = performance.now() - serializationAfterStarted;
  assert.equal(serializationAfterDigest, serializationDigest, 'Validation changed the canonical dataset');
  assert.equal(report.conforms, true, 'Public positive fixture failed validation');
  emit({ phase: 'complete', ...details, conforms: report.conforms,
    issueCount: (report.issues ?? report.results).length, serializationPreserved: true,
    serializationAfterDigest, serializationAfterMs, validationMs, validationPhases,
    validationCpuMs: (validationCpu.user + validationCpu.system) / 1000,
    workerMeasuredMs: performance.now() - started, rssAfterBytes: process.memoryUsage().rss,
    maxRssKiB: process.resourceUsage().maxRSS || null });
}

function options(args) {
  const result = { counts: [100, 500, 2000], topologies: ['shared', 'unique'],
    modes: ['legacy', 'optimized'], deadlineMs: 45_000 };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    assert(['--counts', '--topologies', '--modes', '--deadline-ms'].includes(flag), `Unknown option: ${flag}`);
    const value = args[++i];
    assert(value && !value.startsWith('--'), `Missing value for ${flag}`);
    if (flag === '--counts') result.counts = [...new Set(value.split(',').map(Number))];
    if (flag === '--topologies') result.topologies = [...new Set(value.split(','))];
    if (flag === '--modes') result.modes = [...new Set(value.split(','))];
    if (flag === '--deadline-ms') result.deadlineMs = Number(value);
  }
  assert(result.counts.every(n => Number.isInteger(n) && n >= 1 && n <= 100_000), 'Counts must be integers from 1 to 100000');
  assert(result.topologies.every(t => ['shared', 'unique'].includes(t)), 'Topologies must be shared,unique');
  assert(result.modes.every(m => ['legacy', 'optimized'].includes(m)), 'Modes must be legacy,optimized');
  assert(Number.isInteger(result.deadlineMs) && result.deadlineMs >= 1 && result.deadlineMs <= 45_000,
    'Deadline must be an integer from 1 to 45000 milliseconds');
  result.counts.sort((a, b) => a - b);
  return result;
}

async function runChild(spec, deadlineMs) {
  const started = performance.now();
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child', JSON.stringify(spec)],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '', stderr = '', timedOut = false, spawnError;
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  child.on('error', error => { spawnError = error.message; });
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, deadlineMs);
  const { code, signal } = await new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })));
  clearTimeout(timer);
  const lines = stdout.split('\n'), trailing = lines.pop();
  const phases = [], outputDiagnostics = [];
  for (const line of lines.filter(Boolean)) {
    try { phases.push(JSON.parse(line)); }
    catch { outputDiagnostics.push(`Malformed JSON record (${line.length} characters)`); }
  }
  if (trailing) outputDiagnostics.push(`Incomplete final JSON record (${trailing.length} characters)`);
  const complete = code === 0 && !spawnError && !outputDiagnostics.length && phases.at(-1)?.phase === 'complete';
  return { ...spec, status: timedOut ? 'timeout' : complete ? 'complete' : 'error',
    deadlineMs, processElapsedMs: performance.now() - started, code, signal, phases,
    ...(outputDiagnostics.length ? { outputDiagnostics } : {}),
    ...(stderr || spawnError ? { error: spawnError ?? stderr.trim() } : {}) };
}

async function main(args) {
  if (args.includes('--help')) {
    process.stdout.write(`Build first: pnpm build
Usage: node scripts/benchmark-shacl.mjs [--counts 100,500,2000]
  [--topologies shared,unique] [--modes legacy,optimized] [--deadline-ms 45000]
Large optimized-only run: node scripts/benchmark-shacl.mjs --counts 10000 --modes optimized
Writes one JSON report to stdout and progress to stderr. Each case uses a fresh child
with a hard process deadline (maximum 45s), including startup and serialization.
Legacy uses the original named dataset and the same SHACL shapes; optimized uses
the public production validator. Validation timing includes its projection work.
Legacy preparation reparses a second dataset while retaining the canonical graph.
RSS includes this extra copy, imports, fixtures and serialization; it cannot compare
old/new production memory. Serialization preservation checks the canonical graph.
Comparisons cover positive fixtures only. Timeouts have no validation verdict.
No provider calls or private data. These are measurements, not CI timing thresholds.
`);
    return;
  }
  const config = options(args);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const builtRdf = await readFile(new URL('../dist/graph/rdf.js', import.meta.url));
  const builtShapes = await readFile(new URL('../dist/graph/shacl-shapes.js', import.meta.url));
  const cases = [], timedOut = new Set();
  for (const topology of config.topologies) for (const count of config.counts) for (const mode of config.modes) {
    const key = `${topology}:${mode}`, spec = { count, topology, mode };
    if (timedOut.has(key)) {
      cases.push({ ...spec, status: 'skipped', reason: 'A smaller case reached its process deadline' });
      continue;
    }
    process.stderr.write(`SHACL benchmark: ${count} ${topology} facts, ${mode}\n`);
    const result = await runChild(spec, config.deadlineMs);
    cases.push(result);
    if (result.status === 'timeout') timedOut.add(key);
  }
  const comparisons = config.topologies.flatMap(topology => config.counts.map(count => {
    const pair = cases.filter(c => c.topology === topology && c.count === count);
    if (pair.some(c => c.status !== 'complete')) return { count, topology, status: 'incomplete' };
    if (pair.length !== 2) return { count, topology, status: 'single-mode' };
    const [a, b] = pair.map(c => c.phases.at(-1));
    const conformsMatch = a.conforms === b.conforms;
    const serializationMatch = a.serializationDigest === b.serializationDigest;
    return { count, topology, status: conformsMatch && serializationMatch ? 'positive-fixture-match' : 'mismatch',
      conformsMatch, serializationMatch };
  }));
  emit({ schemaVersion: 1, fixtureSeed: seed, generatedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    toolkitVersion: pkg.version, builtRdfSha256: hash(builtRdf), builtShapesSha256: hash(builtShapes),
    declaredDependencyVersions: { n3: pkg.dependencies.n3, 'rdf-validate-shacl': pkg.dependencies['rdf-validate-shacl'] },
    config, memoryUnits: { rssAfterBytes: 'bytes', maxRssKiB: 'KiB; null if unavailable' },
    memoryScope: 'Whole process including imports, fixture, serialization and a second dataset in legacy mode; not a production before/after comparison',
    serializationScope: 'Canonical named dataset; legacy validation reads a reparsed copy',
    timing: 'Milliseconds; processElapsedMs includes startup; validationMs excludes serialization and legacy parsing',
    cases, comparisons });
  if (cases.some(c => c.status === 'error') || comparisons.some(c => c.status === 'mismatch')) process.exitCode = 1;
}

try {
  if (process.argv[2] === '--child') await worker(JSON.parse(process.argv[3]));
  else await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
}
