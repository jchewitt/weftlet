// Modified for standalone extraction; see docs/extraction-manifest.json.
import type { ContextGraphConfig } from "../configuration/config.js";
import { scipSourcePatterns } from '../configuration/scip-project.js';
import type {
  ExtractionContext,
  FactExtractor,
  GraphSnapshot,
  GraphDiagnostic,
  InvariantEvaluator,
  RuntimeTraceReference,
  RuntimeEvidenceProvider,
  SnapshotStore,
} from "@weftlet/core";
import type { GitRepository } from "../repository/git.js";
import { contractPatternRoots } from "../repository/glob.js";
import type { OntologyCompiler } from "../extraction/ontology.js";
import type { SemanticHydrator } from "../extraction/semantic.js";
import type { ScipIndexResult, StaticIndexer } from "../extraction/static.js";
import { repositoryFileExtractorIdentity, repositoryContractExtractorIdentity, scipSymbolExtractorIdentity } from '../extraction/static.js';
import { sha256, stableJson } from "../infrastructure/util.js";
import { assembleDocumentCodeBindings } from './document-code-bindings.js';
import { documentCodeBindingIdentity } from '../extraction/document-code-bindings.js';
import { documentLinkerIdentity, linkSemanticDocuments } from "../extraction/document.js";
import { repositoryNodeIdentityVersion } from '../extraction/repository-nodes.js';
import { selectHydrationInputs, classifyHydratedFacts, documentSelectionIdentity } from './hydration-inputs.js';
import { runtimeEvidenceFacts } from "../extraction/runtime-evidence.js";
import { matchesRepositoryGlob } from "../repository/glob.js";
import { RdfEvidenceGraph } from "../graph/rdf.js";
import { extractRoutingDeclarations, routingExtractorIdentity } from '../extraction/routing.js';
import { SemanticProviderError } from '../extraction/semantic-process.js';
import { hydrateSemanticSources, type HydrationProgressEvent } from './semantic-run.js';
export type { HydrationProgressEvent } from './semantic-run.js';
import { graphAssemblyVersion, graphAssemblyIdentity, documentExtractionVersions } from './extraction-identity.js';
import { assertGraphIdentities } from '../graph/identity-preflight.js';
import { measureValidationPhase } from '../graph/validation-progress.js';

export interface HydrationOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: HydrationProgressEvent) => void;
  readonly ref: string;
  readonly headName: string;
  readonly forceSemantic?: boolean;
  readonly snapshotSuffix?: string;
  readonly requireClean?: boolean;
  /** Explicit local diagnostics may disclose repository identities, producers and citations. */
  readonly validationDetails?: boolean;
  readonly semanticSources?: readonly string[];
  readonly runtimeEvidenceRevision?: RuntimeEvidenceRevision;
}

export interface RuntimeEvidenceRevision {
  readonly commitSha: string;
  readonly digest: string;
  readonly references: readonly RuntimeTraceReference[];
}

export interface HydrationResult {
  readonly snapshot: GraphSnapshot;
  readonly semanticExtracted: number;
  readonly semanticReused: number;
}

export interface HydratorDependencies {
  readonly config: ContextGraphConfig;
  readonly repository: GitRepository;
  readonly snapshotStore: SnapshotStore;
  readonly semanticHydrator: SemanticHydrator;
  readonly staticIndexer: StaticIndexer;
  readonly ontologyCompiler: OntologyCompiler;
  readonly runtimeEvidenceProvider: RuntimeEvidenceProvider;
  readonly extractorFactory: (scip: ScipIndexResult) => readonly FactExtractor[];
  readonly invariantEvaluators: readonly InvariantEvaluator[];
}

export class ContextGraphHydrator {
  constructor(private readonly dependencies: HydratorDependencies) {}

  async collectRuntimeEvidence(commitSha: string): Promise<RuntimeEvidenceRevision> {
    const { config, repository } = this.dependencies;
    const context: ExtractionContext = {
      repositoryRoot: repository.root,
      repositoryId: config.repositoryId,
      ref: commitSha,
      commitSha,
      snapshotId: commitSha,
      changedPaths: [],
      deletedPaths: [],
      renamedPaths: {},
    };
    const references = [...(await this.dependencies.runtimeEvidenceProvider.collect(context))]
      .filter((evidence) => evidence.accepted)
      .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
    return {
      commitSha,
      digest: sha256(stableJson(references)),
      references,
    };
  }

  async hydrate(options: HydrationOptions): Promise<HydrationResult> {
    const checkpoint = () => {
      if (options.signal?.aborted) throw new SemanticProviderError('cancelled', 'Hydration cancelled');
    };
    checkpoint();
    options.onProgress?.({ phase: 'resolve-committed-sources' });
    const { config, repository, snapshotStore } = this.dependencies;
    const commitSha = await repository.resolveRef(options.ref);
    if (options.requireClean === true) await repository.requireExactCleanCommit(commitSha);
    if (config.documentTraversal && options.semanticSources !== undefined) {
      throw new Error('Traversal hydration does not accept a direct semanticSources override');
    }
    const selection = await selectHydrationInputs(repository, commitSha, config, options.semanticSources);
    const selectedSemanticSources = selection.documentSelection?.semanticPaths ?? options.semanticSources ?? config.semanticSources;
    const scopePaths = selection.documentSelection?.documentPaths ?? selectedSemanticSources;
    if (selection.documentSelection?.complete === false || selection.issues.some((issue) => issue.severity === 'error')) {
      throw new Error(config.documentTraversal
        ? 'Traversal hydration blocked: run hydrate --plan --json to review coverage, roles and budgets before retrying.'
        : selection.issues.map((issue) => issue.message).join('\n'));
    }
    const { sources } = selection;
    await this.dependencies.ontologyCompiler.checkReady?.();
    const prior = await snapshotStore.readHead(options.headName);
    const baseSha =
      prior?.manifest.commitSha === commitSha
        ? prior.manifest.baseSha
        : (prior?.manifest.commitSha ?? (await repository.firstParent(commitSha)));
    const allRoots = [
      ...new Set([
        ...scopePaths,
        ...config.codeRoots,
        ...config.evidenceRoots,
        ...contractPatternRoots(config.contractPatterns),
        ...contractPatternRoots(scipSourcePatterns(config.scip.sourceProject)),
        ...(config.routingSources ?? []),
      ]),
    ];
    const delta = await repository.delta(baseSha, commitSha, allRoots);
    const forceRevision = options.forceSemantic
      ? `${commitSha}:${new Date().toISOString()}:${process.pid}`
      : undefined;
    const baseSuffix =
      options.snapshotSuffix ??
      (forceRevision ? `semantic-${sha256(forceRevision).slice(0, 12)}` : undefined);
    const runtimeRevision =
      options.runtimeEvidenceRevision ?? (await this.collectRuntimeEvidence(commitSha));
    if (runtimeRevision.commitSha !== commitSha) {
      throw new Error('Runtime evidence revision does not match the hydration commit');
    }
    const runtimeSuffix =
      config.runtimeEvidence.length > 0
        ? `runtime-${runtimeRevision.digest.slice(0, 12)}`
        : undefined;
    const configurationDigest = sha256(stableJson(config));
    const scopeDigest = sha256(stableJson(scopePaths)).slice(0, 12);
    const effectiveSuffix = [`graph-v${graphAssemblyVersion}`, `links-${documentLinkerIdentity.version}`, `files-${repositoryFileExtractorIdentity.version}`,
      `contracts-${repositoryContractExtractorIdentity.version}`,
      `symbols-${scipSymbolExtractorIdentity.version}`,
      ...(config.routingSources?.length ? [`routes-${routingExtractorIdentity.version}`] : []),
      ...(selection.documentSelection ? [documentSelectionIdentity, selection.documentSelection.digest.slice(0, 16)] : []),
      configurationDigest.slice(0, 16), scopeDigest, baseSuffix, runtimeSuffix].filter(Boolean).join('-');
    const snapshotId = effectiveSuffix ? `${commitSha}-${effectiveSuffix}` : commitSha;
    const context: ExtractionContext = {
      repositoryRoot: repository.root,
      repositoryId: config.repositoryId,
      ref: options.ref,
      commitSha,
      baseSha,
      snapshotId,
      changedPaths: delta.changedPaths,
      deletedPaths: delta.deletedPaths,
      renamedPaths: delta.renamedPaths,
      semanticPaths: selectedSemanticSources,
    };
    // Validate committed routing inputs before invoking any provider or indexer.
    const routing = await extractRoutingDeclarations(repository, context, config.routingSources ?? []);
    const { hydrated, semanticExtracted, semanticReused } = await hydrateSemanticSources({
      sources, context, config: config.semantic, configurationDigest,
      hydrator: this.dependencies.semanticHydrator, forceRevision,
      signal: options.signal, onProgress: options.onProgress,
    });
    const artifacts = hydrated.map((result) => result.artifact);
    const diagnostics: GraphDiagnostic[] = hydrated.flatMap(({ source, artifact }) =>
      (artifact.diagnostics ?? []).map((item) => ({
        ...item,
        id: sha256(stableJson({ artifact: artifact.key, diagnostic: item.id, path: source.path })),
        provenance: item.provenance.map((span) => ({
          ...span,
          path: source.path,
          digest: source.digest,
          commitSha,
        })),
      })),
    );
    const semanticFacts = classifyHydratedFacts(hydrated.flatMap(({ source, artifact }) =>
      artifact.facts.map((fact) => ({
        ...fact,
        id: sha256(stableJson({ artifact: artifact.key, fact: fact.id, path: source.path })),
        provenance: {
          ...fact.provenance,
          path: source.path,
          digest: source.digest,
          commitSha,
        },
        snapshotId,
        authority: 'inferred' as const,
        extractionReview: 'unreviewed' as const,
        sourceAuthority: (config.approvedIntentSources?.some((pattern) =>
          matchesRepositoryGlob(source.path, pattern)) ? 'declared' : 'inferred') as 'declared' | 'inferred',
      })),
    ), selection.documentEvidence);
    checkpoint();
    options.onProgress?.({ phase: 'index-typescript' });
    const scip = await this.dependencies.staticIndexer.index(context);
    const extractorFacts = (
      await Promise.all(
        this.dependencies.extractorFactory(scip).map((extractor) => extractor.extract(context)),
      )
    ).flat();
    const trackedPaths = await repository.listAllFilesAt(commitSha);
    const tracked = new Set(trackedPaths);
    for (const fact of semanticFacts) {
      for (const node of [fact.subject, fact.object]) {
        const path = /^(?:component:file:|document:)(.+)$/.exec(node.id)?.[1];
        if (path && !tracked.has(path)) diagnostics.push({
          id: sha256(stableJson({ fact: fact.id, missing: path })),
          kind: 'implementationGaps',
          reason: `Cited implementation path ${path} is absent from the committed repository.`,
          relatedNodeIds: [node.id], provenance: [fact.provenance], evidenceScope: 'snapshot-query',
        });
      }
    }
    const documents = linkSemanticDocuments(context, hydrated, trackedPaths,
      sources.filter((source) => config.approvedIntentSources?.some((pattern) =>
        matchesRepositoryGlob(source.path, pattern))).map((source) => source.path),
      { canonicalReferences: !config.documentTraversal });
    const bindings = await assembleDocumentCodeBindings(repository, context, selection, config, extractorFacts,
      [...semanticFacts, ...extractorFacts, ...routing.facts]);
    diagnostics.push(...documents.diagnostics, ...bindings.diagnostics);
    diagnostics.push(...routing.diagnostics, ...(selection.documentEvidence?.diagnostics ?? []));
    checkpoint();
    const runtimeEvidence = runtimeRevision.references;
    const runtimeFacts = runtimeEvidenceFacts(context, runtimeEvidence);
    const structuralFacts = selection.documentEvidence?.facts.map(fact => ({ ...fact, snapshotId })) ?? [];
    const facts = [...semanticFacts, ...classifyHydratedFacts(documents.facts, selection.documentEvidence),
      ...structuralFacts, ...extractorFacts, ...bindings.facts, ...routing.facts, ...runtimeFacts].sort(
      (left, right) => left.id.localeCompare(right.id),
    );
    const validationCounts: { factCount: number; nodeCount?: number } = { factCount: facts.length };
    await measureValidationPhase('validate-identities', validationCounts, options.onProgress, () => {
      const report = assertGraphIdentities(facts, {
        repositoryId: config.repositoryId, includeDetails: options.validationDetails,
      });
      validationCounts.nodeCount = report.nodeCount;
    });
    checkpoint();
    options.onProgress?.({ phase: 'compile-semantic-rdf' });
    const ontology = await this.dependencies.ontologyCompiler.compile(snapshotId, artifacts, context);
    const invariants = (
      await Promise.all(
        this.dependencies.invariantEvaluators.map((evaluator) =>
          evaluator.evaluate(snapshotId, facts),
        ),
      )
    ).flat();
    const failures = invariants.filter((invariant) => invariant.status === 'fail');
    if (failures.length > 0) {
      throw new Error(
        `Invariant validation failed: ${failures.map((failure) => failure.invariantId).join(', ')}`,
      );
    }
    const unresolved = [
      ...new Set([
        ...artifacts.flatMap((artifact) => artifact.unresolvedMappings),
        ...invariants
          .filter((invariant) => invariant.status === 'unknown')
          .map((invariant) => invariant.message),
      ]),
    ].sort();
    const logical = {
      repositoryId: config.repositoryId,
      commitSha,
      ontologyVersion: config.semantic.ontologyVersion,
      semanticArtifactKeys: artifacts.map((artifact) => artifact.key).sort(),
      scipIndexDigest: scip.digest,
      rdfDigest: ontology.digest,
      facts: facts.map(({ snapshotId: _snapshotId, ...fact }) => fact),
      invariants,
      runtimeEvidence,
      unresolved,
      diagnostics,
      semanticSources: selectedSemanticSources,
      ...(selection.documentSelection ? { documentSelection: selection.documentSelection } : {}),
    };
    const contentDigest = sha256(stableJson(logical));
    const snapshot: GraphSnapshot = {
      manifest: {
        schemaVersion: 1,
        repositoryId: config.repositoryId,
        ref: options.ref,
        commitSha,
        baseSha,
        snapshotId,
        configurationDigest,
        scope: scopePaths,
        ...(selection.documentSelection ? { documentSelection: selection.documentSelection } : {}),
        ontologyVersion: config.semantic.ontologyVersion,
        extractorVersions: {
          assembly: graphAssemblyIdentity,
          ...documentExtractionVersions(config),
          [repositoryContractExtractorIdentity.id]: repositoryContractExtractorIdentity.version,
          [scipSymbolExtractorIdentity.id]: scipSymbolExtractorIdentity.version,
          'repository-node-identity': String(repositoryNodeIdentityVersion),
          [documentLinkerIdentity.id]: documentLinkerIdentity.version,
          [documentCodeBindingIdentity.id]: documentCodeBindingIdentity.version,
          ...(config.routingSources?.length ? { [routingExtractorIdentity.id]: routingExtractorIdentity.version } : {}),
          semantic: config.semantic.extractorVersion,
          scip: scip.version,
          ontology: config.ontology.toolVersion,
          ...Object.fromEntries(
            this.dependencies
              .extractorFactory(scip)
              .map((extractor) => [extractor.identity.id, extractor.identity.version]),
          ),
        },
        semanticModel: config.semantic.model,
        semanticPromptVersion: config.semantic.promptVersion,
        generatedAt: new Date().toISOString(),
        contentDigest,
        runtimeEvidenceDigest: runtimeRevision.digest,
        semanticArtifactKeys: artifacts.map((artifact) => artifact.key).sort(),
        scipIndexDigest: scip.digest,
        rdfDigest: ontology.digest,
      },
      facts,
      invariants,
      runtimeEvidence,
      unresolved,
      diagnostics,
    };
    checkpoint();
    const graph = await measureValidationPhase('build-rdf-evidence', validationCounts, options.onProgress,
      () => new RdfEvidenceGraph(snapshot));
    const validation = await graph.validate({ onProgress: (event) =>
      options.onProgress?.({ ...event, nodeCount: validationCounts.nodeCount }) });
    if (!validation.conforms) {
      throw new Error(`Graph extraction failed SHACL validation: ${JSON.stringify(validation.issues)}`);
    }
    checkpoint();
    options.onProgress?.({ phase: 'publish-snapshot' });
    await snapshotStore.write(snapshot);
    await snapshotStore.updateHead(options.headName, snapshotId);
    return { snapshot, semanticExtracted, semanticReused };
  }

  async compareClean(options: Omit<HydrationOptions, 'snapshotSuffix'>): Promise<HydrationResult> {
    const current = await this.dependencies.snapshotStore.readHead(options.headName);
    if (!current) throw new Error('No incremental snapshot exists to compare');
    const clean = await this.hydrate({
      ...options,
      headName: `${options.headName}-clean`,
      snapshotSuffix: `clean-${Date.now()}`,
    });
    if (clean.snapshot.manifest.contentDigest !== current.manifest.contentDigest) {
      throw new Error(
        `Clean hydration drift: ${current.manifest.contentDigest} != ${clean.snapshot.manifest.contentDigest}`,
      );
    }
    return clean;
  }
}
