import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MappingProposalService } from '../../src/application/mapping-proposals.js';
import { createMappingProvider, mappingProviderIdentity } from '../../src/extraction/mapping-provider.js';
import { requiredSnapshotExtractorVersions } from '../../src/application/extraction-identity.js';
import { FileMappingProposalStore } from '../../src/storage/mapping-proposals.js';
import { sha256, stableJson } from '../../src/infrastructure/util.js';
import { createGitLineEndingReader } from '../git-content.mjs';
import { SemanticProviderError } from '../../src/extraction/semantic-process.js';

interface Protocol {
  cases: { id: string; ruleId: string; documentPath: string; files: string[]; expected: string[]; forbidden: string[] }[];
  limits: { maxCandidates: number; maxInputBytes: number; timeoutMs: number };
}

/** Explicit live-run entrypoint. Never imported by CI; it requires a reviewed local request budget. */
async function main() {
  const root = fileURLToPath(new URL('../../', import.meta.url)), args = process.argv.slice(2);
  const values = new Map<string, string>();
  let allowed = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (flag === '--allow-model' && !allowed) { allowed = true; continue; }
    if (!['--model', '--reasoning', '--max-requests', '--output'].includes(flag) || values.has(flag) || !args[i + 1] || args[i + 1]!.startsWith('--')) throw Error('Invalid evaluation argument');
    values.set(flag, args[++i]!);
  }
  if (!allowed || values.get('--max-requests') !== '3' || !values.get('--model') || !values.get('--output') || !['low', 'medium', 'high'].includes(values.get('--reasoning') ?? '')) {
    throw Error('Usage: pnpm evaluate:proposals --allow-model --max-requests 3 --model MODEL --reasoning medium --output /local/report.json');
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  if (git('status', '--porcelain')) throw Error('Freeze and commit the reviewed evaluation inputs before live measurement');
  const commit = git('rev-parse', 'HEAD'), normalize = createGitLineEndingReader(root);
  const lock = JSON.parse(await readFile(resolve(root, 'evaluations/mapping-proposals/inputs.lock.json'), 'utf8'));
  for (const entry of lock.inputs) if (sha256(normalize(entry.path, await readFile(resolve(root, entry.path)))) !== entry.sha256) throw Error('Frozen mapping evaluation input changed');
  const protocol = JSON.parse(await readFile(resolve(root, 'evaluations/mapping-proposals/protocol.json'), 'utf8')) as Protocol;
  const { mappingProject } = await import('../../tests/fixtures/mapping-project.js');
  const f = await mappingProject();
  const reports: unknown[] = [], output = resolve(values.get('--output')!);
  const config = { ...f.app.config.semantic, provider: 'codex-cli' as const, providerModule: undefined, providerIdentity: undefined,
    model: values.get('--model')!, reasoningEffort: values.get('--reasoning') as 'low' | 'medium' | 'high', auth: { mode: 'chatgpt' as const }, retries: 0 };
  const providerIdentity = mappingProviderIdentity(config);
  const service = new MappingProposalService(f.app.repository, f.app.snapshotStore, new FileMappingProposalStore(f.app.storageRoot), {
    repositoryId: f.app.config.repositoryId, configurationDigest: sha256(stableJson(f.app.config)), expectedExtractors: requiredSnapshotExtractorVersions(f.app.config),
    providerIdentity, timeoutMs: protocol.limits.timeoutMs, provider: () => createMappingProvider(config, f.root),
  });
  const save = () => writeFile(output, JSON.stringify({ version: 1, commit, inputLock: lock, protocol, model: config.model,
    reasoning: config.reasoningEffort, authentication: 'chatgpt', results: reports,
    tokenUsageAndMonetaryCost: 'not-reported-by-cli-adapter', usefulness: 'independent-review-pending' }, null, 2) + '\n');
  try {
    // Compute every plan before spending any model requests. No silent smaller evaluation.
    const requests = protocol.cases.map((c: { ruleId: string; documentPath: string; files: string[] }) => ({
      snapshotId: f.snapshot.manifest.snapshotId, ruleId: c.ruleId, documentPath: c.documentPath, files: c.files,
      maxCandidates: protocol.limits.maxCandidates, maxInputBytes: protocol.limits.maxInputBytes }));
    const plans = await Promise.all(requests.map((request: typeof f.request) => service.plan(request)));
    if (plans.some(plan => !plan.ready) || plans.length !== 3) throw Error('Public evaluation preview is incomplete; no provider requests made');
    for (let i = 0; i < requests.length; i++) {
      const started = performance.now(), c = protocol.cases[i]!;
      try {
        const result = await service.propose(requests[i]!, { allowModel: true });
        const labels = result.artifact.output.proposals.map(p => plans[i]!.candidates.find(candidate => candidate.node.id === p.symbolId)!.node.label).sort();
        const expected = [...c.expected].sort();
        const matchesExpected = JSON.stringify(labels) === JSON.stringify(expected);
        const correct = labels.filter(label => expected.includes(label)).length;
        const falseMappings = labels.filter(label => !expected.includes(label)).length;
        const misses = expected.filter(label => !labels.includes(label)).length;
        const repeated = await service.propose(requests[i]!);
        if (!repeated.reused || repeated.artifact.outputDigest !== result.artifact.outputDigest) throw Error('Unchanged proposal reuse failed');
        reports.push({ id: c.id, status: 'completed', elapsedMs: Math.round(performance.now() - started), matchesExpected, labels,
          correct, falseMappings, misses, abstained: result.artifact.output.decision === 'abstained',
          precision: labels.length ? correct / labels.length : null,
          request: requests[i], plan: plans[i], result, reused: repeated.reused });
        await save(); console.log(JSON.stringify({ id: c.id, matchesExpected, proposals: labels.length }));
      } catch (error) {
        reports.push({ id: c!.id, status: error instanceof SemanticProviderError && error.code === 'invalid-output' ? 'output-validation-failure' : 'infrastructure-failure', elapsedMs: Math.round(performance.now() - started) });
        await save(); throw Error('Public proposal evaluation stopped; completed results retained, provider details withheld');
      }
    }
  } finally { await rm(f.root, { recursive: true, force: true }); }
}
void main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'Evaluation failed'}\n`); process.exitCode = 1; });
