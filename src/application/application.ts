// Modified for standalone extraction; see docs/extraction-manifest.json.
import { SavedGraphExplorationService } from "./saved-exploration.js";
import { SnapshotGraphExplorationService } from "../graph/neighborhood.js";
import { SnapshotGraphPathService } from '../graph/paths.js';
import { SavedGraphPathService } from './saved-paths.js';
import { SnapshotContractCompatibilityService } from '../graph/compatibility.js';
import { SavedContractCompatibilityService } from './saved-compatibility.js';
import { SavedEvidenceQueryService } from "./saved-evidence.js";
import { sha256, stableJson } from "../infrastructure/util.js";
import { AgentSemanticScopeResolver, PreparedImpactQueryService } from "./agent-context.js";
import { resolveStorageRoot } from "../configuration/cache.js";
import { loadConfig } from "../configuration/config.js";
import type {
  ContextGraphAdapter,
  ContextGraphAdapterModule,
  ContextGraphRepository,
} from "@weftlet/core";
import { GitRepository } from "../repository/git.js";
import { ContextGraphHydrator } from "./hydrator.js";
import { OpenCaesarOntologyCompiler, DirectRdfOntologyCompiler } from "../extraction/ontology.js";
import { SnapshotImpactQueryService } from "../graph/query.js";
import { SemanticHydrator } from "../extraction/semantic.js";
import { createSemanticExtractor } from "../extraction/providers.js";
import { FileSnapshotStore } from "../storage/storage.js";
import { createSemanticArtifactStore } from './semantic-artifact-store.js';
import {
  RepositoryContractExtractor,
  RepositoryFileExtractor,
  type ScipIndexResult,
  ScipSymbolExtractor,
  ScipTypeScriptIndexer,
} from "../extraction/static.js";
import { OtlpJsonRuntimeEvidenceProvider } from "../extraction/telemetry.js";
import { SnapshotChecks } from "./snapshot-checks.js";
import { resolveConsumerModule } from "../infrastructure/module-resolution.js";
import { requiredSnapshotExtractorVersions } from './extraction-identity.js';

const emptyAdapter: ContextGraphAdapter = {
  factExtractors: [],
  invariantEvaluators: [],
};

export async function loadContextGraphAdapterModule(
  moduleSpecifier: string | undefined,
  repository: ContextGraphRepository,
  repositoryRoot = process.cwd(),
): Promise<ContextGraphAdapter> {
  if (!moduleSpecifier) return emptyAdapter;
  let candidate: Partial<ContextGraphAdapterModule>;
  try {
    candidate = (await import(resolveConsumerModule(moduleSpecifier, repositoryRoot))) as Partial<ContextGraphAdapterModule>;
  } catch (error) {
    throw new Error(`Unable to load context graph adapter ${moduleSpecifier}`, { cause: error });
  }
  if (typeof candidate.createContextGraphAdapter !== 'function') {
    throw new Error(
      `Context graph adapter ${moduleSpecifier} must export createContextGraphAdapter(repository)`,
    );
  }
  const adapter = candidate.createContextGraphAdapter(repository);
  if (!Array.isArray(adapter.factExtractors) || !Array.isArray(adapter.invariantEvaluators)) {
    throw new Error(`Context graph adapter ${moduleSpecifier} returned an invalid adapter`);
  }
  return adapter;
}

export async function createContextGraphApplication(configPath: string) {
  const loaded = await loadConfig(configPath);
  const { config, repositoryRoot } = loaded;
  const storageRoot = resolveStorageRoot(repositoryRoot, config);
  const repository = new GitRepository(repositoryRoot);
  const adapter = await loadContextGraphAdapterModule(config.adapter, repository, repositoryRoot);
  const snapshotStore = new FileSnapshotStore(storageRoot);
  const artifactStore = createSemanticArtifactStore(repositoryRoot, config);
  const semanticExtractor = createSemanticExtractor(config.semantic, repositoryRoot);
  const semanticHydrator = new SemanticHydrator(config.semantic, artifactStore, semanticExtractor);
  const staticIndexer = new ScipTypeScriptIndexer(config.scip, storageRoot);
  const ontologyCompiler = config.ontology.backend === 'opencaesar' ? new OpenCaesarOntologyCompiler(
    config.ontology,
    repositoryRoot,
    storageRoot,
  ) : new DirectRdfOntologyCompiler(storageRoot);
  const runtimeEvidenceProvider = new OtlpJsonRuntimeEvidenceProvider(
    config.runtimeEvidence,
    config.runtimeEvidencePolicy,
  );
  const extractorFactory = (scip: ScipIndexResult) => [
    new RepositoryFileExtractor(repository, config.codeRoots, scip.digest),
    new RepositoryContractExtractor(
      repository,
      config.contractPatterns,
      config.contractConsumerRoots ?? config.codeRoots,
      config.contractAliases,
    ),
    new ScipSymbolExtractor(repository, scip),
    ...adapter.factExtractors,
  ];
  const hydrator = new ContextGraphHydrator({
    config,
    repository,
    snapshotStore,
    semanticHydrator,
    staticIndexer,
    ontologyCompiler,
    runtimeEvidenceProvider,
    extractorFactory,
    invariantEvaluators: adapter.invariantEvaluators,
  });
  const headName = 'default';
  const scopeResolver = config.agentContext
    ? new AgentSemanticScopeResolver(config, repository)
    : undefined;
  const rawQueryService = scopeResolver
    ? new PreparedImpactQueryService(snapshotStore, hydrator, scopeResolver)
    : new SnapshotImpactQueryService(snapshotStore, headName);
  const expectedExtractors = requiredSnapshotExtractorVersions(config);
  const queryService = new SavedEvidenceQueryService(rawQueryService, repository, sha256(stableJson(config)), expectedExtractors);
  return {
    ...loaded,
    storageRoot,
    repository,
    snapshotStore,
    ontologyCompiler,
    hydrator,
    queryService,
    explorationService: new SavedGraphExplorationService(new SnapshotGraphExplorationService(snapshotStore),
      repository, sha256(stableJson(config)), expectedExtractors),
    pathService: new SavedGraphPathService(new SnapshotGraphPathService(snapshotStore),
      repository, sha256(stableJson(config)), expectedExtractors),
    compatibilityService: new SavedContractCompatibilityService(new SnapshotContractCompatibilityService(snapshotStore),
      repository, sha256(stableJson(config)), expectedExtractors),
    snapshotChecks: new SnapshotChecks(snapshotStore, repository, hydrator, scopeResolver, sha256(stableJson(config)), expectedExtractors),
    scopeResolver,
    headName,
  };
}
