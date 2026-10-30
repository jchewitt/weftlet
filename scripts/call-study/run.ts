import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { callExpectations, staticCallFixture, staticCallProject } from '../../tests/fixtures/static-call-project.js';
import { handleGraphNeighbors } from '../../src/interfaces/graph-exploration.js';
import { sha256 } from '../../src/infrastructure/util.js';

const { values } = parseArgs({ options: { output: { type: 'string', default: '.context-graph/evaluation/static-calls.json' } }, strict: true });
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const evaluator = { commitSha: git('rev-parse', 'HEAD'), dirty: Boolean(git('status', '--porcelain')) };
const fixture = await staticCallFixture();
try {
  let started = performance.now();
  const cold = await fixture.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
  const coldMs = Math.round(performance.now() - started); started = performance.now();
  const repeated = await fixture.app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
  const repeatMs = Math.round(performance.now() - started), snapshot = cold.snapshot;
  const symbol = (name: string) => snapshot.facts.find(f => f.codeOccurrence?.role === 'definition' &&
    f.provenance.path === 'src/large.ts' && f.subject.label === name)!.subject.id;
  const requests = [], responses = []; let continuation: string | undefined;
  do {
    const request = { snapshotId: snapshot.manifest.snapshotId, nodeId: symbol('analyze'), direction: 'both' as const,
      predicates: ['calls'] as const, maxFacts: 2, ...(continuation ? { continuation } : {}) };
    const response = await handleGraphNeighbors(fixture.app.explorationService, request);
    requests.push(request); responses.push(response); continuation = response.selection.continuation;
  } while (continuation && requests.length < 4);
  const pathRequest = { snapshotId: snapshot.manifest.snapshotId, fromNodeId: symbol('run'), toNodeId: 'invariant:policy',
    direction: 'both' as const, predicates: ['calls', 'implementedBy'] as const, maxDepth: 6, maxPaths: 3, maxSteps: 500 };
  const paths = await fixture.app.pathService.paths(pathRequest);
  const facts = snapshot.facts.filter(f => f.codeCall), returnedBytes = Buffer.byteLength(JSON.stringify(responses));
  const report = { schemaVersion: 1, evaluator, generatedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform },
    inputs: Object.entries(staticCallProject()).map(([path, source]) => ({ path, sha256: sha256(source) })),
    providerSha256: sha256(await readFile(new URL('../../evaluations/mapping-gaps/project/provider.mjs', import.meta.url))),
    expected: callExpectations, modelCalls: 0, manifest: snapshot.manifest,
    cold: { elapsedMs: coldMs, semanticExtracted: cold.semanticExtracted, semanticReused: cold.semanticReused },
    repeat: { elapsedMs: repeatMs, semanticExtracted: repeated.semanticExtracted, semanticReused: repeated.semanticReused,
      stableIdentity: snapshot.manifest.snapshotId === repeated.snapshot.manifest.snapshotId,
      stableContent: snapshot.manifest.contentDigest === repeated.snapshot.manifest.contentDigest },
    factCount: snapshot.facts.length, calls: facts, diagnostics: snapshot.diagnostics, requests, responses, returnedBytes,
    neighborhoodBudgetExhausted: Boolean(continuation), pathRequest, paths,
    limits: 'Public location/isolation workload; static edges do not prove execution. Full assertions are tested in tests/static-calls.test.ts.' };
  const output = resolve(values.output!); await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  const passed = !continuation && returnedBytes <= callExpectations.maxResponseBytes &&
    report.repeat.stableIdentity && report.repeat.stableContent && paths.paths.some(path => path.nodeIds.length === 6);
  process.stdout.write(JSON.stringify({ output, passed, facts: report.factCount, calls: facts.length,
    pages: requests.length, returnedBytes, coldMs, repeatMs }) + '\n');
  if (!passed) process.exitCode = 1;
} finally { await rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
