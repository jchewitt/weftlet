import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { createContextGraphApplication } from '../../src/application/application.js';
import { sha256 } from '../../src/infrastructure/util.js';
import { readMappingInputs } from './protocol.js';
import { measureMappingCase } from './measure.js';

const execute = promisify(execFile);
export async function assessMappings(inputRoot: string, onProgress: (phase: string) => void = () => {}) {
  const { protocol, inputs, inventoryDigest } = await readMappingInputs(inputRoot);
  const root = await mkdtemp(join(tmpdir(), 'weftlet-mappings-'));
  try {
    for (const [path, content] of inputs) {
      if (!path.startsWith('project/')) continue;
      const target = join(root, path.slice('project/'.length));
      await mkdir(dirname(target), { recursive: true }); await writeFile(target, content);
    }
    const git = async (...args: string[]) => (await execute('git', ['-c', 'core.autocrlf=false',
      '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root,
      env: { ...process.env, GIT_COMMITTER_DATE: '2026-10-29T12:00:00Z' } })).stdout.trim();
    await git('init', '--quiet'); await git('add', '.');
    await git('add', '-f', 'context-graph.config.json');
    await git('-c', 'user.name=Public mapping study', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--date=2026-10-29T12:00:00Z', '-m', 'Frozen public mapping inputs');
    const app = await createContextGraphApplication(join(root, 'context-graph.config.json'));
    onProgress('cold-hydration'); let started = performance.now();
    const cold = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    const coldMs = Math.round(performance.now() - started);
    onProgress('unchanged-repeat'); started = performance.now();
    const repeat = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    const repeatMs = Math.round(performance.now() - started);
    onProgress('agent-queries');
    const cases = [];
    for (const item of protocol.cases) cases.push(await measureMappingCase(app, cold.snapshot, item, protocol.budget));
    const summary = { cases: cases.length, matchingStates: cases.filter(c => c.matchesExpected).length,
      forbiddenMappings: cases.reduce((count, c) => count + c.forbiddenMappings.length, 0),
      missedDirectMappings: cases.filter(c => !c.agentQuery.allDirectMappingsReturned).length,
      exhaustedNeighborhoodBudgets: cases.filter(c => c.agentQuery.pageBudgetExhausted).length };
    const stableRepeat = cold.snapshot.manifest.snapshotId === repeat.snapshot.manifest.snapshotId &&
      cold.snapshot.manifest.contentDigest === repeat.snapshot.manifest.contentDigest;
    return { schemaVersion: 1, baselineCommit: protocol.baselineCommit, inventoryDigest,
      generatedAt: new Date().toISOString(), environment: { platform: process.platform, node: process.version },
      provider: { identity: 'public-mapping-grammar:1', kind: 'offline-grammar-control', modelCalls: 0,
        qualityScope: 'Does not evaluate natural-language extraction or model inference.' },
      manifest: cold.snapshot.manifest, factCount: cold.snapshot.facts.length,
      cold: { elapsedMs: coldMs, semanticExtracted: cold.semanticExtracted, semanticReused: cold.semanticReused },
      repeat: { elapsedMs: repeatMs, semanticExtracted: repeat.semanticExtracted, semanticReused: repeat.semanticReused, stableIdentityAndContent: stableRepeat },
      summary, passed: summary.matchingStates === cases.length && summary.forbiddenMappings === 0 &&
        summary.missedDirectMappings === 0 && summary.exhaustedNeighborhoodBudgets === 0 && stableRepeat &&
        repeat.semanticExtracted === 0 && repeat.semanticReused === cold.semanticExtracted,
      cases };
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}

export async function evaluatorIdentity(root: string) {
  const sourceDigests = [];
  for (const path of ['scripts/mapping-study/assessment.ts', 'scripts/mapping-study/measure.ts',
    'scripts/mapping-study/protocol.ts', 'scripts/mapping-study/run.ts']) {
    sourceDigests.push({ path, sha256: sha256((await readFile(join(root, path), 'utf8')).replaceAll('\r\n', '\n')) });
  }
  const commitSha = (await execute('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  const dirty = Boolean((await execute('git', ['status', '--porcelain'], { cwd: root })).stdout.trim());
  return { commitSha, dirty, sourceDigests };
}
