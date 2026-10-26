import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExtractionContext, GraphFact, GraphSnapshot, SemanticArtifact } from '@weftlet/core';
import { createContextGraphApplication } from '../src/application/application.js';
import { CG, RdfEvidenceGraph, nodeIri } from '../src/graph/rdf.js';
import { SemanticArtifactStore } from '../src/storage/storage.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';
import { SemanticHydrator, type SemanticOutput } from '../src/extraction/semantic.js';
import type { ContextGraphConfig } from '../src/configuration/config.js';

const execute = promisify(execFile);
const temporaryRoots: string[] = [];
const documentPath = 'docs/completed/workflow.md';
const documentId = `document:${documentPath}`;
const legacyDocumentId = `component:file:${documentPath}`;
const providerIdentity = 'public-document-identity-fixture:1';

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(missingReference = false) {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-document-identity-'));
  temporaryRoots.push(root);
  await Promise.all(['src', 'docs/completed'].map((path) => mkdir(join(root, path), { recursive: true })));
  await writeFile(join(root, '.gitignore'), '.context-graph/\nprovider-calls.log\n');
  await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'public-document-identity-fixture', version: '1.0.0', type: 'module' }));
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true,
  }, include: ['src/**/*.ts'] }));
  await writeFile(join(root, 'src/jobs.ts'), 'export function normalize(job: string): string { return job.trim(); }\n');
  await writeFile(join(root, 'src/queue.ts'), "import { normalize } from './jobs.js';\nexport function enqueue(job: string): string { return normalize(job); }\n");
  await writeFile(join(root, documentPath), '# Completed queue implementation\n\nThe implementation accepts queued jobs.\n');
  await writeFile(join(root, 'docs/owner.md'), [
    '# Queue owner', 'semantic-id: public-owner', '',
    'The Queue capability is described in the [completed implementation](completed/workflow.md).',
    'The operational owner is undecided.',
    ...(missingReference ? ['The migration note is docs/missing.md.'] : []), '',
  ].join('\n'));
  await writeFile(join(root, 'docs/inventory.md'), [
    '# Queue inventory', 'semantic-id: public-inventory', '',
    'The Queue capability is described in the [completed implementation](completed/workflow.md).',
    'The operational owner is undecided.', '',
  ].join('\n'));
  // This deterministic provider reads public prose and deliberately reproduces the two
  // otherwise-valid classifications seen in 0.2.0. It is not a live model quality test.
  await writeFile(join(root, 'provider.mjs'), `
import { appendFile } from 'node:fs/promises';
export function createSemanticExtractor() {
  return {
    identity: '${providerIdentity}',
    async extract(source) {
      await appendFile(new URL('./provider-calls.log', import.meta.url), source.path + '\\n');
      const match = /The (\\w+) capability is described in the \\[completed implementation\\]\\(([^)]+)\\)/.exec(source.content);
      if (!match) throw new Error('Public fixture did not contain the expected cited relationship');
      const target = 'component:file:docs/' + match[2];
      const line = source.content.slice(0, match.index).split('\\n').length;
      const assertions = [{
        subject: { id: 'capability:' + match[1].toLowerCase(), kind: 'Capability', label: match[1] },
        predicate: 'references',
        object: { id: target, kind: source.stableSemanticId === 'public-owner' ? 'Component' : 'Document', label: 'Completed queue implementation' },
        citation: { startLine: line, endLine: line }, confidence: 0.95,
      }];
      const missing = /The migration note is (docs\\/missing\\.md)\\./.exec(source.content);
      if (missing) {
        const missingLine = source.content.slice(0, missing.index).split('\\n').length;
        assertions.push({ subject: assertions[0].subject, predicate: 'references',
          object: { id: 'component:file:' + missing[1], kind: 'Component', label: 'Migration note' },
          citation: { startLine: missingLine, endLine: missingLine }, confidence: 0.95 });
      }
      const diagnostics = [{ kind: 'missingIntent', reason: 'The operational owner is explicitly undecided.',
        citation: { startLine: line + 1, endLine: line + 1 }, relatedNodeIds: [target] }];
      const parsed = { assertions, oml: '', diagnostics };
      return { parsed, rawModelOutput: '  ' + JSON.stringify(parsed, null, 2) + '\\n' };
    },
  };
}
`);
  const config = JSON.parse(await readFile(new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  Object.assign(config, {
    repositoryId: 'public/document-identity-fixture',
    semanticSources: ['docs/owner.md', 'docs/inventory.md'],
    evidenceRoots: [], approvedIntentSources: ['docs/owner.md'],
    semantic: { ...config.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity,
      failOnUnresolved: false, concurrency: 1 },
    scip: { version: '0.4.0', command: 'bundled-scip-typescript', args: ['index', '--no-global-caches', 'tsconfig.json'] },
  });
  const configPath = join(root, 'context-graph.config.json');
  await writeFile(configPath, JSON.stringify(config));
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  await git('init', '--quiet');
  await git('add', '.');
  await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'public document identity fixture');
  return { root, application: await createContextGraphApplication(configPath) };
}

describe('cross-document repository identities', () => {
  it('preserves both cited assertions, joins deterministic links, and refreshes incompatible artifacts without mutating historical evidence', async () => {
    const { root, application } = await fixture();
    const { config, repository, storageRoot, snapshotStore } = application;
    const commitSha = await repository.resolveRef('HEAD');
    const context: ExtractionContext = { repositoryRoot: root, repositoryId: config.repositoryId,
      ref: 'HEAD', commitSha, snapshotId: 'legacy', changedPaths: [], deletedPaths: [], renamedPaths: {} };
    const sources = await repository.semanticSources(context, config.semanticSources);
    expect(sources).toHaveLength(2);
    const store = new SemanticArtifactStore(storageRoot);
    // Pin the released 0.2.0 module-provider/cache contract, rather than deriving old
    // keys through the new hydrator, so migration coverage cannot follow the fix.
    const oldModelIdentity = `${providerIdentity}:${sha256(stableJson(config.semantic))}:contract-v2`;
    const oldArtifacts = await Promise.all(sources.map(async (source): Promise<SemanticArtifact> => {
      const key = sha256(stableJson({ stableSemanticId: source.stableSemanticId, sourceDigest: source.digest,
        promptVersion: config.semantic.promptVersion, extractorVersion: config.semantic.extractorVersion,
        modelIdentity: oldModelIdentity, adapterVersion: config.semantic.adapterVersion,
        ontologyVersion: config.semantic.ontologyVersion, minimumConfidence: config.semantic.minimumConfidence,
        failOnUnresolved: config.semantic.failOnUnresolved, forceRevision: undefined, diagnosticContractVersion: 3 }));
      const fact: Omit<GraphFact, 'snapshotId'> = {
        id: sha256(`legacy:${source.path}`), subject: { id: 'capability:queue', kind: 'Capability', label: 'Queue' },
        predicate: 'references', object: { id: legacyDocumentId,
          kind: source.stableSemanticId === 'public-owner' ? 'Component' : 'Document', label: 'Completed queue implementation' },
        provenance: { path: source.path, startLine: 4, endLine: 4, digest: source.digest, commitSha },
        extractor: { id: oldModelIdentity, version: config.semantic.extractorVersion }, confidence: 0.95,
      };
      const artifact: SemanticArtifact = { key, stableSemanticId: source.stableSemanticId,
        source: { ...fact.provenance, startLine: 1, endLine: source.content.split('\n').length },
        sourceDigest: source.digest, promptVersion: config.semantic.promptVersion,
        extractorVersion: config.semantic.extractorVersion, modelIdentity: oldModelIdentity,
        adapterVersion: config.semantic.adapterVersion, ontologyVersion: config.semantic.ontologyVersion,
        facts: [fact], oml: 'legacy fixture artifact', unresolvedMappings: [], diagnostics: [],
        rawModelOutput: JSON.stringify({ legacyFixture: source.path }), outputDigest: sha256(stableJson(fact)) };
      await store.write(artifact);
      return artifact;
    }));
    const oldArtifactBytes = await Promise.all(oldArtifacts.map((artifact) =>
      readFile(join(storageRoot, 'artifacts/semantic', `${artifact.key}.json`), 'utf8')));
    const oldSnapshotId = [commitSha, 'graph-v4', 'links-2.0.0', 'files-2.0.0',
      sha256(stableJson(config)).slice(0, 16), sha256(stableJson(config.semanticSources)).slice(0, 12)].join('-');
    const oldSnapshot: GraphSnapshot = {
      manifest: { schemaVersion: 1, repositoryId: config.repositoryId, ref: 'HEAD', commitSha,
        snapshotId: oldSnapshotId, configurationDigest: sha256(stableJson(config)), scope: config.semanticSources,
        ontologyVersion: config.semantic.ontologyVersion, extractorVersions: { assembly: 'standalone-graph-v4' },
        semanticModel: config.semantic.model, semanticPromptVersion: config.semantic.promptVersion,
        generatedAt: '2026-01-01T00:00:00.000Z', contentDigest: sha256('public historical graph'),
        semanticArtifactKeys: [oldArtifacts[0]!.key], scipIndexDigest: 'historical-scip', rdfDigest: 'historical-rdf' },
      // A historical graph containing only one classification was valid. Preserve it;
      // the later two-source conflict was never a successfully published snapshot.
      facts: [{ ...oldArtifacts[0]!.facts[0]!, snapshotId: oldSnapshotId, authority: 'inferred', extractionReview: 'unreviewed' }],
      invariants: [], runtimeEvidence: [], unresolved: [],
    };
    expect((await new RdfEvidenceGraph(oldSnapshot).validate()).conforms).toBe(true);
    await snapshotStore.write(oldSnapshot);
    await snapshotStore.updateHead('default', oldSnapshotId);
    const oldSnapshotBytes = await readFile(join(storageRoot, 'snapshots', `${oldSnapshotId}.json`), 'utf8');
    const invalid = new RdfEvidenceGraph({ ...oldSnapshot,
      facts: oldArtifacts.flatMap((artifact) => artifact.facts.map((fact) => ({ ...fact, snapshotId: oldSnapshotId }))) });
    const priorVerdict = await invalid.validate();
    expect(priorVerdict.conforms).toBe(false);
    expect(priorVerdict.issues.some((issue) => issue.path === `${CG}kind`)).toBe(true);

    const first = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(first.semanticExtracted).toBe(2);
    expect(first.semanticReused).toBe(0);
    expect(first.snapshot.manifest.snapshotId).not.toBe(oldSnapshotId);
    expect(first.snapshot.manifest.semanticArtifactKeys.every((key) => !oldArtifacts.some((artifact) => artifact.key === key))).toBe(true);
    const semanticFacts = first.snapshot.facts.filter((fact) => fact.extractor.id.startsWith(`${providerIdentity}:`));
    expect(semanticFacts).toHaveLength(2);
    expect(new Set(semanticFacts.map((fact) => fact.id)).size).toBe(2);
    for (const source of sources) {
      const fact = semanticFacts.find((candidate) => candidate.provenance.path === source.path);
      expect(fact).toMatchObject({ subject: { id: 'capability:queue', kind: 'Capability' },
        predicate: 'references', object: { id: documentId, kind: 'Document', label: 'Completed queue implementation' },
        provenance: { path: source.path, startLine: 4, endLine: 4, digest: source.digest, commitSha },
        confidence: 0.95, authority: 'inferred', extractionReview: 'unreviewed',
        sourceAuthority: source.path === 'docs/owner.md' ? 'declared' : 'inferred' });
    }
    const references = first.snapshot.facts.filter((fact) => fact.extractor.id === 'document-linker' &&
      fact.predicate === 'references' && fact.object.id === documentId);
    expect(references).toHaveLength(2);
    expect(references.every((fact) => fact.object.kind === 'Document' && fact.extractionReview === 'deterministic')).toBe(true);
    expect(first.snapshot.facts.flatMap((fact) => [fact.subject.id, fact.object.id])).not.toContain(legacyDocumentId);
    expect(first.snapshot.facts.some((fact) => fact.extractor.id === 'scip-symbol-extractor')).toBe(true);
    const semanticDiagnostics = first.snapshot.diagnostics?.filter((item) => item.reason === 'The operational owner is explicitly undecided.');
    expect(semanticDiagnostics).toHaveLength(2);
    expect(semanticDiagnostics?.every((item) => stableJson(item.relatedNodeIds) === stableJson([documentId]))).toBe(true);
    const graph = new RdfEvidenceGraph(first.snapshot);
    expect((await graph.validate()).conforms).toBe(true);
    expect(await graph.facts()).toEqual(first.snapshot.facts);
    const incoming = await graph.select(`SELECT ?record WHERE {
      GRAPH ?fact { ?source <${CG}references> <${nodeIri(documentId)}> }
      ?fact <${CG}record> ?record
    }`);
    expect(incoming.rows).toHaveLength(4);
    const artifacts = await Promise.all(first.snapshot.manifest.semanticArtifactKeys.map((key) => store.read(key)));
    for (const artifact of artifacts) {
      expect(artifact).toBeDefined();
      const output = JSON.parse(artifact!.rawModelOutput);
      expect(output.assertions[0].object.id).toBe(legacyDocumentId);
      expect(output.assertions[0].object.kind).toBe(artifact!.source.path === 'docs/owner.md' ? 'Component' : 'Document');
      expect(output.diagnostics[0].relatedNodeIds).toEqual([legacyDocumentId]);
      expect(artifact!.rawModelOutput).toBe(`  ${JSON.stringify(output, null, 2)}\n`);
      expect(artifact!.oml).toContain(`instance n_${sha256(documentId).slice(0, 16)} : cg:OwnerDocument`);
      expect(artifact!.oml).not.toContain(`n_${sha256(legacyDocumentId).slice(0, 16)}`);
    }
    const repeated = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeated.semanticExtracted).toBe(0);
    expect(repeated.semanticReused).toBe(2);
    expect(repeated.snapshot.manifest.snapshotId).toBe(first.snapshot.manifest.snapshotId);
    expect(repeated.snapshot.manifest.contentDigest).toBe(first.snapshot.manifest.contentDigest);
    expect(repeated.snapshot.facts).toEqual(first.snapshot.facts);
    expect((await readFile(join(root, 'provider-calls.log'), 'utf8')).trim().split('\n').sort()).toEqual(sources.map((source) => source.path).sort());
    expect(await Promise.all(oldArtifacts.map((artifact) => readFile(join(storageRoot, 'artifacts/semantic', `${artifact.key}.json`), 'utf8')))).toEqual(oldArtifactBytes);
    expect(await readFile(join(storageRoot, 'snapshots', `${oldSnapshotId}.json`), 'utf8')).toBe(oldSnapshotBytes);
    expect(await snapshotStore.read(oldSnapshotId)).toEqual(oldSnapshot);
    expect((await snapshotStore.readHead('default'))?.manifest.snapshotId).toBe(first.snapshot.manifest.snapshotId);
  });

  it('canonicalizes document subjects while preserving unrelated concept conflicts for SHACL rejection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'weftlet-subject-identity-'));
    temporaryRoots.push(root);
    const config: ContextGraphConfig = JSON.parse(await readFile(new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    const content = '# Queue owner\nThe queue is a capability.\nThe queue is classified as a contract.\n';
    const source = { stableSemanticId: 'public-subject-identity', path: 'docs/owner.mdx', content, digest: sha256(content) };
    const context: ExtractionContext = { repositoryRoot: root, repositoryId: 'public/subject-identity',
      ref: 'HEAD', commitSha: 'public-commit', snapshotId: 'public-subject-identity',
      changedPaths: [], deletedPaths: [], renamedPaths: {} };
    const parsed: SemanticOutput = { assertions: [
      { subject: { id: 'component:file:docs/owner.mdx', kind: 'Component', label: 'Queue owner' },
        predicate: 'references', object: { id: 'capability:queue', kind: 'Capability', label: 'Queue' },
        citation: { startLine: 2, endLine: 2 }, confidence: 0.95 },
      { subject: { id: 'document:docs/owner.mdx', kind: 'Document', label: 'Queue owner' },
        predicate: 'references', object: { id: 'capability:queue', kind: 'Contract', label: 'Queue' },
        citation: { startLine: 3, endLine: 3 }, confidence: 0.95 },
    ], oml: '' };
    const rawModelOutput = `  ${JSON.stringify(parsed, null, 2)}\n`;
    const hydrator = new SemanticHydrator(config.semantic, new SemanticArtifactStore(root), {
      identity: 'public-subject-provider:1', extract: async () => ({ parsed, rawModelOutput }),
    });
    const { artifact } = await hydrator.hydrate(source, context);
    expect(artifact.facts).toHaveLength(2);
    expect(artifact.facts.map((fact) => fact.subject)).toEqual([
      { id: 'document:docs/owner.mdx', kind: 'Document', label: 'Queue owner' },
      { id: 'document:docs/owner.mdx', kind: 'Document', label: 'Queue owner' },
    ]);
    expect(artifact.facts.map((fact) => fact.object)).toEqual(parsed.assertions.map((assertion) => assertion.object));
    expect(artifact.facts.map((fact) => fact.provenance.startLine)).toEqual([2, 3]);
    expect(parsed.assertions[0]!.subject).toEqual({ id: 'component:file:docs/owner.mdx', kind: 'Component', label: 'Queue owner' });
    expect(artifact.rawModelOutput).toBe(rawModelOutput);
    const snapshot: GraphSnapshot = {
      manifest: { schemaVersion: 1, repositoryId: context.repositoryId, ref: context.ref, commitSha: context.commitSha,
        snapshotId: context.snapshotId, ontologyVersion: config.semantic.ontologyVersion, extractorVersions: {},
        semanticModel: config.semantic.model, semanticPromptVersion: config.semantic.promptVersion,
        generatedAt: '2026-01-01T00:00:00.000Z', contentDigest: artifact.outputDigest,
        semanticArtifactKeys: [artifact.key], scipIndexDigest: 'not-indexed', rdfDigest: 'not-compiled' },
      facts: artifact.facts.map((fact) => ({ ...fact, snapshotId: context.snapshotId,
        authority: 'inferred', extractionReview: 'unreviewed' })), invariants: [], runtimeEvidence: [], unresolved: [],
    };
    const verdict = await new RdfEvidenceGraph(snapshot).validate();
    expect(verdict.conforms).toBe(false);
    expect(verdict.issues.some((issue) => issue.path === `${CG}kind` && issue.focus === nodeIri('capability:queue'))).toBe(true);
    expect(verdict.issues.some((issue) => issue.focus === nodeIri('document:docs/owner.mdx'))).toBe(false);
  });

  it('reports missing committed document paths after canonicalization even without a Markdown link', async () => {
    const { application } = await fixture(true);
    const { snapshot } = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    const missingId = 'document:docs/missing.md';
    const semanticFacts = snapshot.facts.filter((fact) => fact.extractor.id.startsWith(`${providerIdentity}:`));
    expect(semanticFacts).toHaveLength(3);
    expect(semanticFacts.find((fact) => fact.object.id === missingId)).toMatchObject({
      object: { kind: 'Document' }, provenance: { path: 'docs/owner.md', startLine: 6, endLine: 6 },
      authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed',
    });
    expect(snapshot.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({
      kind: 'implementationGaps', relatedNodeIds: [missingId], evidenceScope: 'snapshot-query',
      provenance: [expect.objectContaining({ path: 'docs/owner.md', startLine: 6, endLine: 6 })],
      reason: expect.stringContaining('docs/missing.md'),
    })]));
    // The linker deliberately ignores missing bare paths. This verifies the semantic
    // existence check survives the identity migration independently of link diagnostics.
    expect(snapshot.diagnostics?.some((item) => item.evidenceScope === 'source' && item.relatedNodeIds.includes(missingId))).toBe(false);
    expect((await new RdfEvidenceGraph(snapshot).validate()).conforms).toBe(true);
  });
});
