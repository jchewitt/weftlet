import type { SemanticArtifact, SemanticSource } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import { sha256, stableJson } from '../infrastructure/util.js';
import { repositoryNodeIdentityVersion } from './repository-nodes.js';

/** Pure identity: inspecting planned work must not load providers or probe credentials. */
export function semanticProviderIdentity(config: ContextGraphConfig['semantic']): string {
  return config.provider === 'codex-cli'
    ? `codex-cli:${config.model}:${config.reasoningEffort}:${config.promptVersion}:contract-v3`
    : `${config.providerIdentity}:${sha256(stableJson(config))}:contract-v2`;
}

/** Preserve the 0.2.1 artifact contract, including identity-policy invalidation. */
export function semanticArtifactKey(config: ContextGraphConfig['semantic'], source: SemanticSource,
  modelIdentity: string, forceRevision?: string): string {
  return sha256(stableJson({
    stableSemanticId: source.stableSemanticId,
    sourceDigest: source.digest,
    promptVersion: config.promptVersion,
    extractorVersion: config.extractorVersion,
    modelIdentity,
    adapterVersion: config.adapterVersion,
    ontologyVersion: config.ontologyVersion,
    minimumConfidence: config.minimumConfidence,
    failOnUnresolved: config.failOnUnresolved,
    forceRevision,
    diagnosticContractVersion: 3,
    repositoryNodeIdentityVersion,
  }));
}

export function semanticArtifactOutputDigest(artifact: Pick<SemanticArtifact,
  'facts' | 'diagnostics' | 'oml' | 'rawModelOutput'>): string {
  return sha256(stableJson({ facts: artifact.facts, diagnostics: artifact.diagnostics ?? [],
    compiledOml: artifact.oml, rawModelOutput: artifact.rawModelOutput }));
}
