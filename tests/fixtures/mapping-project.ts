import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { createContextGraphApplication } from '../../src/application/application.js';
import { repositoryFileNode } from '@weftlet/core';

/** Public grammar and canned proposal exercise mechanics, never live semantic quality. */
export const mappingFiles: Record<string, string> = {
  '.gitignore': '.context-graph/\nnode_modules/\nrequest.json\n',
  'package.json': '{"name":"public-mapping-proposals","version":"1.0.0","type":"module"}',
  'src/observations.ts': 'export function acceptObservation(ageSeconds: number) { return ageSeconds <= 60; }\nexport function checkFreshness(ageSeconds: number) { return true; }\nexport function retention(ageDays: number) { return ageDays <= 14; }\n',
  'src/foreign.ts': 'export function acceptObservation(ageSeconds: number) { return ageSeconds <= 60; }\n',
  'src/ambient.d.ts': 'export declare function acceptObservation(age: number): boolean;\n',
  'src/omitted.ts': 'export function omitted(age: number) { return age <= 60; }\n',
  'src/mock.spec.ts': 'export function looksLikeImplementation(age: number) { return age <= 60; }\n',
  'src/verification.ts': 'declare function downstreamPolicy(value: string): boolean;\nexport function verifySignature(value: string) { return downstreamPolicy(value); }\n',
  'docs/owner.md': 'Rule freshness: Observations older than 60 seconds must be rejected.\nImplementation file: src/observations.ts\n',
  'docs/ambient.md': 'Rule ambient: Observations older than 60 seconds must be rejected.\nImplementation file: src/ambient.d.ts\n',
  'docs/omitted.md': 'Rule omitted: Observations older than 60 seconds must be rejected.\nImplementation file: src/omitted.ts\n',
  'docs/test.md': 'Rule test: Observations older than 60 seconds must be rejected.\nImplementation file: src/mock.spec.ts\n',
  'docs/retention.md': 'Rule retention: Keep observations for exactly 30 days, then remove them.\nImplementation file: src/observations.ts\n',
  'docs/verification.md': 'Rule verification: Verify every observation using the sender cryptographic signature before admission.\nImplementation file: src/verification.ts\n',
  'provider.mjs': `
const files = ${JSON.stringify(Object.fromEntries(['src/observations.ts', 'src/ambient.d.ts', 'src/omitted.ts', 'src/verification.ts', 'src/mock.spec.ts'].map(path => [path, repositoryFileNode(path)])))};
export function createSemanticExtractor(config) { return { identity: config.providerIdentity, async extract(source) {
  const match = /^Rule ([a-z]+): (.+)$/m.exec(source.content), file = /^Implementation file: (.+)$/m.exec(source.content);
  const subject = { id: 'invariant:' + match[1], kind: 'Invariant', label: match[2] };
  const parsed = { assertions: [
    { subject, predicate: 'references', object: { id: 'workflow:observations', kind: 'Workflow', label: 'Observation admission' }, citation: { startLine: 1, endLine: 1 }, confidence: 1 },
    { subject, predicate: 'implementedBy', object: files[file[1]], citation: { startLine: 2, endLine: 2 }, confidence: 1 },
  ], diagnostics: [], oml: '' }; return { parsed, rawModelOutput: JSON.stringify(parsed) };
} }; }
export function createMappingProposalProvider(config) { return { identity: config.providerIdentity, async propose(input) {
  const c = input.candidates.find(c => c.node.label === 'acceptObservation');
  return { decision: 'proposed', reason: 'Canned public transport test, not a model assessment.', proposals: [
    { symbolId: c.node.id, rationale: 'The body rejects values above 60; broader behavior is untested.', confidence: 0.8,
      documentCitation: { startLine: 1, endLine: 1 }, codeCitation: { startLine: c.body.startLine, endLine: c.body.endLine } } ] };
} }; }
`,
};
export async function mappingProject() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-mapping-')), execute = promisify(execFile);
  try {
    for (const [path, text] of Object.entries(mappingFiles)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text); }
    const template = JSON.parse(await readFile(new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    const config = { ...template, repositoryId: 'public/mapping-proposals', semanticSources: ['docs'], approvedIntentSources: ['docs/*.md'], codeRoots: ['src'],
      semantic: { ...template.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity: 'public-mapping-test:1' },
      scip: { ...template.scip, args: ['index', '--no-global-caches'], sourceProject: { include: ['src/observations.ts', 'src/foreign.ts', 'src/ambient.d.ts', 'src/verification.ts', 'src/mock.spec.ts'] } } };
    const configPath = join(root, 'context-graph.config.json'); await writeFile(configPath, JSON.stringify(config));
    const git = async (...args: string[]) => (await execute('git', ['-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root })).stdout.trim();
    const commit = async () => { await git('add', '.'); await git('-c', 'user.name=Public fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public mapping fixture'); };
    await git('init', '--quiet'); await commit();
    const app = await createContextGraphApplication(configPath), hydrated = await app.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    return { root, config, configPath, app, git, commit, snapshot: hydrated.snapshot,
      request: { snapshotId: hydrated.snapshot.manifest.snapshotId, ruleId: 'invariant:freshness', documentPath: 'docs/owner.md', files: ['src/observations.ts'] } };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
