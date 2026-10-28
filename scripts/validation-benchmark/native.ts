/** Optional Linux research probe. Explicit local binary only; no download, service or runtime integration. */
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { DataFactory, Parser, Store, Writer } from 'n3';
import { cases, fact, snapshot } from '../../tests/fixtures/shacl.js';
import { CG, factIri, RdfEvidenceGraph } from '../../dist/graph/rdf.js';
import { evidenceShapes } from '../../dist/graph/shacl-shapes.js';
import { hash, syntheticFixture } from './inputs.mjs';

const SH = 'http://www.w3.org/ns/shacl#';
const { namedNode, quad } = DataFactory;
const execute = promisify(execFile);
const binary = resolve(process.argv[2] ?? '');
assert(process.argv.length === 3, 'Usage: node --import tsx scripts/validation-benchmark/native.ts /explicit/path/to/rudof');
assert(process.platform === 'linux', 'This optional process-memory probe requires Linux and Python 3 resource accounting');
await execute('python3', ['-c', 'import resource, subprocess'], { timeout: 5000 });
const version = (await execute(binary, ['--version'], { timeout: 5000 })).stdout.trim();
assert.equal(version, 'rudof 0.3.35', 'Only the evaluated Rudof version is supported by this probe');
const binarySha256 = hash(await readFile(binary));
assert.equal(binarySha256, 'd9d230e27e594ab5d7927cc021fbdc8b907a014cebfa13722a5521a65ce9ff66', 'Use the reviewed Linux GNU release asset');
const directory = await mkdtemp(join(tmpdir(), 'weftlet-native-study-'));
const pairs = (issues: { focus?: string; path?: string }[]) => issues.map(x => [x.focus ?? '', x.path ?? '']).sort();
function boundedProcess(args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((accept, reject) => {
    const child = spawn('python3', ['-c',
      'import subprocess,resource,sys; result=subprocess.run(sys.argv[2:]); open(sys.argv[1],"w").write(str(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss)); sys.exit(result.returncode)',
      ...args], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', killed = false, failure: Error | undefined;
    const stop = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ } } };
    const timer = setTimeout(() => { killed = true; stop(); }, 30_000);
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 4 * 1024 * 1024) { failure = new Error('Native output limit exceeded'); stop(); } });
    child.stderr.on('data', data => { stderr += data; if (stderr.length > 4 * 1024 * 1024) { failure = new Error('Native diagnostic limit exceeded'); stop(); } });
    child.on('error', error => { failure = error; });
    child.on('close', code => {
      clearTimeout(timer);
      if (killed || failure || code !== 0) reject(Object.assign(failure ?? new Error(killed ? 'Native deadline exceeded' : `Native exit ${code}: ${stderr.slice(0, 1500)}`), { killed, code }));
      else accept({ stdout, stderr });
    });
  });
}
async function ntriples(quads: ReturnType<Store['getQuads']>) {
  const writer = new Writer({ format: 'N-Triples' }); writer.addQuads(quads);
  return new Promise<string>((accept, reject) => writer.end((error, text) => error ? reject(error) : accept(text)));
}
async function prepare(value: ReturnType<typeof snapshot>) {
  const started = performance.now();
  const graph = new RdfEvidenceGraph(value);
  const serialized = await graph.serialize();
  const all = new Parser({ format: 'N-Quads' }).parse(serialized);
  const union = new Store(all.map(q => quad(q.subject, q.predicate, q.object)));
  await writeFile(join(directory, 'data.nt'), await ntriples(union.getQuads(null, null, null, null)));
  return { graph, serialized, preparationMs: performance.now() - started, quadCount: all.length, unionTriples: union.size };
}
async function native(value: ReturnType<typeof snapshot>) {
  const started = performance.now();
  try {
    const result = await boundedProcess([join(directory, 'rss.txt'),
      binary, 'validate', '--mode', 'shacl', '--backend', 'memory', '--data-format', 'ntriples',
      '--schema-format', 'ntriples', '--schema', join(directory, 'shapes.nt'), '--result-format', 'turtle', join(directory, 'data.nt')]);
    const elapsedMs = performance.now() - started;
    const report = new Store(new Parser({ format: 'Turtle' }).parse(result.stdout));
    const conformance = report.getObjects(null, namedNode(`${SH}conforms`), null);
    assert.equal(conformance.length, 1, 'Expected one native conformance report');
    assert(['true', 'false'].includes(conformance[0].value), 'Invalid native verdict');
    const issues = report.getObjects(null, namedNode(`${SH}result`), null).map(node => ({
      focus: report.getObjects(node, namedNode(`${SH}focusNode`), null)[0]?.value,
      path: report.getObjects(node, namedNode(`${SH}resultPath`), null)[0]?.value,
    }));
    const nativeConforms = conformance[0].value === 'true';
    // Preserve the released supplemental citation-order rule, which is not a SHACL shape.
    for (const item of value.facts) if (item.provenance.endLine < item.provenance.startLine) {
      issues.push({ focus: factIri(item.id), path: `${CG}endLine` });
    }
    return { status: 'complete', nativeConforms, conforms: nativeConforms && issues.length === 0,
      diagnosticPairs: pairs(issues), elapsedMs, maxRssKiB: Number((await readFile(join(directory, 'rss.txt'), 'utf8')).trim()),
      ...(result.stderr ? { stderr: result.stderr.slice(0, 2000) } : {}) };
  } catch (error) {
    const failure = error as Error & { killed?: boolean; code?: string | number };
    return { status: failure.killed ? 'timeout' : 'error', elapsedMs: performance.now() - started,
      message: failure.message.slice(0, 2000), code: failure.code };
  }
}

try {
  await writeFile(join(directory, 'shapes.nt'), await ntriples(evidenceShapes));
  const ownership = { status: 'resolved' as const, ownerDocuments: ['docs/owner.md'], mappingIds: ['owner'] };
  const extra = [
    { name: 'resolved source ownership', conforms: true, facts: [fact(0, { sourceRole: 'intent', sourcePolicyDigest: 'public-policy', sourceOwnership: ownership })] },
    { name: 'missing required owner', conforms: false, facts: [fact(0, { sourceOwnership: { ...ownership, ownerDocuments: [] } })] },
    { name: 'missing owner status with owner', conforms: false, facts: [fact(0, { sourceOwnership: { ...ownership, status: 'missing' } })] },
    { name: 'ambiguous owner has one document', conforms: false, facts: [fact(0, { sourceOwnership: { ...ownership, status: 'ambiguous' } })] },
    { name: 'empty source policy', conforms: false, facts: [fact(0, { sourcePolicyDigest: '' })] },
    { name: 'invalid source role', conforms: false, facts: [fact(0, { sourceRole: 'invalid' as 'intent' })] },
  ];
  const parity = [];
  for (const test of [...cases, ...extra]) {
    const value = snapshot(test.facts), input = await prepare(value);
    const reference = await input.graph.validate();
    assert.equal(reference.conforms, test.conforms, `Bad reference fixture: ${test.name}`);
    const candidate = await native(value);
    assert.equal(await input.graph.serialize(), input.serialized, 'Canonical data changed');
    const referencePairs = pairs(reference.issues);
    const locations = (values: string[][] | undefined) => [...new Set((values ?? []).map(x => JSON.stringify(x)))].sort();
    parity.push({ name: test.name, canonicalDigest: hash(input.serialized),
      reference: { conforms: reference.conforms, diagnosticPairs: pairs(reference.issues) }, candidate,
      conformanceMatch: candidate.status === 'complete' && candidate.conforms === reference.conforms,
      diagnosticLocationsMatch: candidate.status === 'complete' &&
        JSON.stringify(locations(candidate.diagnosticPairs)) === JSON.stringify(locations(referencePairs)),
      match: candidate.status === 'complete' && candidate.conforms === reference.conforms &&
        JSON.stringify(candidate.diagnosticPairs) === JSON.stringify(referencePairs) });
    process.stderr.write(`Native parity: ${test.name}: ${parity.at(-1)!.match ? 'match' : 'MISMATCH'}\n`);
  }
  const measurements = [];
  // Keep diagnostic multiplicity differences visible. Timing is exploratory, not replacement approval.
  if (parity.every(item => item.conformanceMatch && item.diagnosticLocationsMatch)) for (const topology of ['unique', 'document-rich']) for (const count of [2000, 10000]) {
    const value = syntheticFixture(count, topology), input = await prepare(value);
    const reference = await input.graph.validate(); assert(reference.conforms);
    for (let sample = 1; sample <= 3; sample++) {
      const candidate = await native(value);
      process.stderr.write(`Native timing: ${topology} ${count}, sample ${sample}: ${candidate.status}\n`);
      measurements.push({ topology, count, sample, preparationMs: input.preparationMs,
        quadCount: input.quadCount, unionTriples: input.unionTriples, ...candidate });
      if (candidate.status !== 'complete' || candidate.conforms !== true) break;
    }
  }
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceDirtyPaths: execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
    harnessSha256: hash(await readFile(new URL('./native.ts', import.meta.url))),
    fixtureSha256: hash(await readFile(new URL('../../tests/fixtures/shacl.ts', import.meta.url))),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    candidate: { version, binarySha256, license: 'Apache-2.0',
      release: 'https://github.com/rudof-project/rudof/releases/tag/0.3.35' },
    methodology: 'Complete SPO union of original named graph; unchanged shapes. Same JS citation-order supplement. Record conformance, diagnostic locations and full focus/path multiplicity separately; no matching on messages. Native time includes Python launcher/parser/startup; RSS is native process only, not Node canonical graph/export overhead. Each native process has a 30s deadline. Performance skipped on conformance/location mismatch, but recorded multiplicity differences do not prevent exploratory timing. No production dependency or backend change.',
    parity, measurements, exactDiagnosticParity: parity.every(item => item.match), replacementApproved: false };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.exactDiagnosticParity || measurements.some(x => x.status !== 'complete' || x.conforms !== true)) process.exitCode = 1;
} finally { await rm(directory, { recursive: true, force: true }); }
