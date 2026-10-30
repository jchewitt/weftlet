import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ContextGraphConfig } from "../configuration/config.js";
import { scipSourcePatterns } from '../configuration/scip-project.js';
import type { ExtractionContext, GraphSnapshot } from "@weftlet/core";
import { GitRepository } from "../repository/git.js";
import { withCommittedTree } from "../repository/committed-tree.js";
import { FileSnapshotStore } from "../storage/storage.js";
import { RepositoryContractExtractor, RepositoryFileExtractor, ScipSymbolExtractor, ScipTypeScriptIndexer,
  repositoryFileExtractorIdentity, repositoryContractExtractorIdentity, scipSymbolExtractorIdentity } from "../extraction/static.js";
import { sha256, stableJson } from "../infrastructure/util.js";
import { contextPackEvidenceAuthority } from "../graph/query.js";
import { inWorkingScope, readWorkingContent } from "../repository/working-content.js";
import { extractRoutingDeclarations, routingExtractorIdentity } from '../extraction/routing.js';
import { RdfEvidenceGraph } from '../graph/rdf.js';
import { graphAssemblyIdentity, documentExtractionVersions } from './extraction-identity.js';
import { assertGraphIdentities } from '../graph/identity-preflight.js';
import { selectHydrationInputs, documentSelectionIdentity } from './hydration-inputs.js';
import { retainOverlayDocumentFact, overlayDocumentRoots, overlayDocumentManifest, overlayDocumentNotes } from './document-overlay.js';
import { assembleDocumentCodeBindings } from './document-code-bindings.js';
import { documentCodeBindingIdentity } from '../extraction/document-code-bindings.js';
import { draftFacts } from './draft-facts.js';
import { staticCallIdentity } from '../extraction/static-calls.js';
import { extractEvidence } from './extractor-results.js';
import { documentEvidenceExtractorIdentity } from '../extraction/document-evidence.js';

const execute = promisify(execFile);
const implementationExtractors = new Set([
  'repository-file-extractor', 'repository-contract-extractor', 'scip-symbol-extractor',
  routingExtractorIdentity.id, documentCodeBindingIdentity.id, staticCallIdentity.id,
]);

/** Conservative code overlay: reindex implementation; invalidate changed prose, never synthesize intent. */
export async function buildWorkingOverlay(
  repository: GitRepository,
  config: ContextGraphConfig,
  store: FileSnapshotStore,
  storageRoot: string,
  baseSnapshotId: string,
  agent = 'default',
  options: { readonly validationDetails?: boolean } = {},
): Promise<GraphSnapshot> {
  const base = await store.read(baseSnapshotId);
  if (!base || base.manifest.overlayDigest) throw new Error('Overlay requires a committed base snapshot');
  if (base.manifest.configurationDigest !== sha256(stableJson(config))) {
    throw new Error('Overlay configuration must match its base snapshot');
  }
  const head = await repository.resolveRef('HEAD');
  if (head !== base.manifest.commitSha) throw new Error('Overlay base must match checkout HEAD');
  const changed = await repository.workingChanges();
  if (changed.length > 500) throw new Error('Overlay exceeds the 500 changed-path bound');
  const captured: { path: string; content: Buffer | null }[] = [];
  const routingSources = config.routingSources ?? [];
  const baseRouting = await extractRoutingDeclarations(repository, {
    repositoryRoot: repository.root, repositoryId: config.repositoryId, ref: head,
    commitSha: head, snapshotId: baseSnapshotId, changedPaths: [], deletedPaths: [], renamedPaths: {},
  }, routingSources, { allowMissingSources: true });
  const roots = [...config.codeRoots, ...config.semanticSources, ...config.evidenceRoots,
    ...overlayDocumentRoots(config),
    ...config.contractPatterns, ...scipSourcePatterns(config.scip.sourceProject),
    ...routingSources, ...baseRouting.referencedPaths];
  const excluded: string[] = [];
  for (const path of changed) {
    if (!inWorkingScope(path, roots)) {
      excluded.push(path);
      continue;
    }
    const content = await readWorkingContent(repository.root, path);
    captured.push({ path, content });
  }
  const overlayCapture = {
    files: captured.map(({ path, content }) => ({ path, digest: content === null ? null : sha256(content) })),
    sourcePatterns: roots, excludedPaths: excluded,
  };
  const overlayDigest = sha256(stableJson({ version: 2, ...overlayCapture }));
  // Capture identity describes the same working bytes across extractor upgrades. Publication
  // identity also binds the extractor so rebuilding an old base cannot replace an old overlay.
  const snapshotId = `${head}-overlay-${sha256(stableJson({
    baseContentDigest: base.manifest.contentDigest, overlayDigest,
    assembly: graphAssemblyIdentity,
    repositoryFileExtractor: repositoryFileExtractorIdentity,
    repositoryContractExtractor: repositoryContractExtractorIdentity,
    scipSymbolExtractor: scipSymbolExtractorIdentity,
    ...(routingSources.length ? { routingExtractor: routingExtractorIdentity } : {}),
    ...(config.documentTraversal ? { documentSelection: documentSelectionIdentity,
      documentEvidence: documentEvidenceExtractorIdentity } : {}),
  })).slice(0, 32)}`;
  const affected = new Set(captured.map((file) => file.path));
  const extracted = await withCommittedTree(repository.root, head, async (root) => {
    for (const file of captured) {
      const target = join(root, file.path);
      if (file.content === null) await rm(target, { force: true });
      else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.content);
      }
    }
    const git = (...args: string[]) => execute('git', args, { cwd: root });
    await git('init', '--quiet');
    // The archive already contains only committed files plus explicitly captured changes.
    // Preserve tracked inputs even when their repository .gitignore also matches them.
    await git('add', '--force', '.');
    await git('-c', 'user.name=Context Graph Draft', '-c', 'user.email=draft@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Isolated overlay input');
    const draftRepository = new GitRepository(root);
    const context: ExtractionContext = {
      repositoryRoot: root, repositoryId: config.repositoryId, ref: 'HEAD',
      commitSha: await draftRepository.resolveRef('HEAD'), snapshotId,
      changedPaths: captured.filter((f) => f.content !== null).map((f) => f.path),
      deletedPaths: captured.filter((f) => f.content === null).map((f) => f.path),
      renamedPaths: {},
    };
    const documents = await selectHydrationInputs(draftRepository, context.commitSha, config);
    const documentSelection = documents?.documentSelection ? {
      ...documents.documentSelection,
      // Temporary Git commit timestamps are not evidence identity. Bind drafts to captured bytes.
      digest: sha256(stableJson({ ...documents.documentSelection, digest: undefined, baseSha: head, overlayDigest })),
    } : undefined;
    const scip = await new ScipTypeScriptIndexer(config.scip, storageRoot).index(context);
    const routing = await extractRoutingDeclarations(draftRepository, context, routingSources,
      { allowMissingSources: true });
    const uncapturedEndpoints = routing.referencedPaths.filter((path) => !inWorkingScope(path, roots));
    if (uncapturedEndpoints.length) {
      throw new Error(`Draft routing endpoints are outside captured source scope; add them to configured source scope before rebuilding: ${uncapturedEndpoints.join(', ')}`);
    }
    const extractors = [
      new RepositoryFileExtractor(draftRepository, config.codeRoots, scip.digest),
      new RepositoryContractExtractor(draftRepository, config.contractPatterns,
        config.contractConsumerRoots ?? config.codeRoots, config.contractAliases),
      new ScipSymbolExtractor(draftRepository, scip),
    ];
    const extraction = await extractEvidence(extractors, context);
    const codeFacts = extraction.facts;
    const retainedSubjects = base.facts.filter(fact =>
      retainOverlayDocumentFact(fact, documents, affected) &&
      !implementationExtractors.has(fact.extractor.id) &&
      contextPackEvidenceAuthority(fact) !== 'implemented' &&
      fact.extractor.id !== 'otlp-runtime-evidence' && !affected.has(fact.provenance.path) &&
      ![fact.subject, fact.object].some(node => [...affected].some(path =>
        node.id === `component:file:${path}` || node.id === `document:${path}` || node.label === path)));
    const bindings = await assembleDocumentCodeBindings(draftRepository, context, documents, config, codeFacts, [...retainedSubjects, ...codeFacts, ...routing.facts]);
    const facts = draftFacts([...codeFacts, ...routing.facts, ...(documents.documentEvidence?.facts ?? []), ...bindings.facts], snapshotId, head);
    const diagnostics = [...extraction.diagnostics, ...bindings.diagnostics, ...routing.diagnostics, ...(documents?.documentEvidence?.diagnostics ?? [])].map(({ id: _id, ...item }) => {
      const draft = { ...item, provenance: item.provenance.map((span) => ({ ...span, commitSha: head })) };
      return { ...draft, id: sha256(stableJson(draft)) };
    }).sort((a, b) => a.id.localeCompare(b.id));
    return { facts, diagnostics, documents, documentSelection, retainedSubjects };
  });
  const retained = extracted.retainedSubjects.map(fact => ({ ...fact, snapshotId }));
  const allFacts = [...retained, ...extracted.facts].sort((a, b) => a.id.localeCompare(b.id));
  assertGraphIdentities(allFacts, { repositoryId: config.repositoryId, includeDetails: options.validationDetails });
  const overlay: GraphSnapshot = {
    ...base,
    manifest: {
      ...base.manifest, snapshotId, baseSha: head, overlayDigest, overlayCapture,
      ...overlayDocumentManifest(extracted.documentSelection),
      extractorVersions: { ...base.manifest.extractorVersions,
        assembly: graphAssemblyIdentity,
        [documentCodeBindingIdentity.id]: documentCodeBindingIdentity.version,
        ...documentExtractionVersions(config),
        [repositoryFileExtractorIdentity.id]: repositoryFileExtractorIdentity.version,
        [repositoryContractExtractorIdentity.id]: repositoryContractExtractorIdentity.version,
        [scipSymbolExtractorIdentity.id]: scipSymbolExtractorIdentity.version,
        [staticCallIdentity.id]: staticCallIdentity.version,
        ...(routingSources.length ? { [routingExtractorIdentity.id]: routingExtractorIdentity.version } : {}) },
      generatedAt: new Date().toISOString(), contentDigest: sha256(stableJson(routingSources.length || config.documentTraversal
        ? { facts: allFacts, diagnostics: extracted.diagnostics,
          ...(extracted.documentSelection ? { documentSelection: extracted.documentSelection } : {}) } : allFacts)),
    },
    facts: allFacts,
    invariants: base.invariants.map((rule) => ({
      ...rule, status: 'unknown', message: `Draft overlay requires revalidation: ${rule.invariantId}`,
    })),
    runtimeEvidence: [],
    unresolved: [
      'Draft implementation overlay: changed semantic documents require explicit re-extraction.',
      ...overlayDocumentNotes(config),
      `Changes outside configured source scope are excluded: ${excluded.join(', ') || '(none)'}`,
    ],
    diagnostics: extracted.diagnostics,
  };
  if (!(await new RdfEvidenceGraph(overlay).validate()).conforms) {
    throw new Error('Draft overlay failed SHACL validation; saved evidence was preserved');
  }
  if (await repository.resolveRef('HEAD') !== head) throw new Error('HEAD changed during overlay capture; retry');
  await store.write(overlay);
  await store.updateHead(`overlay-${sha256(`${resolve(repository.root)}:${agent}`).slice(0, 24)}`, snapshotId);
  return overlay;
}
