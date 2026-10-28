import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import { RdfEvidenceGraph } from '../../dist/graph/rdf.js';
import { inspectGraphIdentities } from '../../dist/graph/identity-preflight.js';
import { hash, normalized } from './inputs.mjs';

// Candidate exact-result key, evaluated only. Includes raw named data and code/dependency semantics.
const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const contract = hash(JSON.stringify({ identity: 'validation-study-exact-v1', runtime: process.version,
  lockSha256: hash(await readFile(new URL('../../pnpm-lock.yaml', import.meta.url))),
  dependencies: { n3: pkg.dependencies.n3, shacl: pkg.dependencies['rdf-validate-shacl'] },
  files: await Promise.all(['graph/rdf.js', 'graph/shacl-shapes.js', 'graph/authority.js', 'graph/validation-progress.js']
    .map(async path => [path, hash(await readFile(new URL(`../../dist/${path}`, import.meta.url)))])) }));
let previousGraph;

/** No receipt is consumed and no production code is changed: every case executes full validation. */
export async function measure(snapshot, scenario) {
  if (scenario !== 'repeat') previousGraph = undefined;
  global.gc?.();
  const started = performance.now();
  const rssBeforeBytes = process.memoryUsage().rss;
  const preflightStarted = performance.now();
  const preflight = inspectGraphIdentities(snapshot.facts, { repositoryId: snapshot.manifest.repositoryId });
  const preflightMs = performance.now() - preflightStarted;
  const buildStarted = performance.now();
  const graph = scenario === 'repeat' && previousGraph ? previousGraph : new RdfEvidenceGraph(snapshot);
  const constructionMs = performance.now() - buildStarted;
  const reusedGraphInstance = graph === previousGraph;
  previousGraph = graph;
  const rssAfterConstructionBytes = process.memoryUsage().rss;
  const serializeStarted = performance.now();
  const before = await graph.serialize();
  const serializationMs = performance.now() - serializeStarted;
  const rssAfterSerializationBytes = process.memoryUsage().rss;
  const keyStarted = performance.now();
  const canonicalDigest = hash(before);
  const exactKey = hash(`${contract}:${canonicalDigest}`);
  const keyHashMs = performance.now() - keyStarted;
  const validationPhases = [];
  const cpu = process.cpuUsage();
  const validationStarted = performance.now();
  const verdict = normalized(await graph.validate({ onProgress: event => validationPhases.push(event) }));
  const validationMs = performance.now() - validationStarted;
  const validationCpu = process.cpuUsage(cpu);
  const preserved = hash(await graph.serialize()) === canonicalDigest;
  assert(preserved, 'Validation changed named evidence');
  return { scenario, factCount: snapshot.facts.length, nodeCount: new Set(snapshot.facts.flatMap(f => [f.subject.id, f.object.id])).size,
    quadCount: before.split('\n').length - 1, namedGraphCount: new Set(snapshot.facts.map(f => f.id)).size,
    preflightPassed: preflight.passed, preflightMs, constructionMs, reusedGraphInstance,
    serializationMs, keyHashMs, canonicalDigest, exactKey, contract, validationMs, validationPhases,
    conforms: verdict.conforms, issueCount: verdict.issues.length, verdictDigest: hash(JSON.stringify(verdict)),
    issuePaths: [...new Set(verdict.issues.map(issue => issue.path))].sort(), serializationPreserved: preserved,
    validationCpuMs: (validationCpu.user + validationCpu.system) / 1000,
    measuredMs: performance.now() - started, rssBeforeBytes, rssAfterConstructionBytes, rssAfterSerializationBytes, rssAfterBytes: process.memoryUsage().rss,
    heapUsedAfterBytes: process.memoryUsage().heapUsed, maxRssKiB: process.resourceUsage().maxRSS || null };
}
