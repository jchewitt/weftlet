import type { SemanticArtifact, SemanticSource } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import type { SemanticArtifactStore } from '../storage/storage.js';
import { semanticArtifactKey, semanticArtifactOutputDigest } from './semantic-identity.js';

export type SemanticCacheStatus = 'hit' | 'miss' | 'forced' | 'corrupt' | 'unavailable';
export interface SemanticCacheInspection {
  readonly status: SemanticCacheStatus;
  readonly key?: string;
  readonly reason: string;
  readonly artifact?: SemanticArtifact;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function matchesIdentity(value: Record<string, unknown>, key: string, source: SemanticSource,
  config: ContextGraphConfig['semantic'], modelIdentity: string): boolean {
  return value.key === key && value.stableSemanticId === source.stableSemanticId &&
    value.sourceDigest === source.digest && value.modelIdentity === modelIdentity &&
    ['promptVersion', 'extractorVersion', 'adapterVersion', 'ontologyVersion'].every(
      (field) => value[field] === config[field as keyof typeof config]);
}

function reusableArtifact(value: unknown, key: string, source: SemanticSource,
  config: ContextGraphConfig['semantic'], modelIdentity: string): value is SemanticArtifact {
  if (!record(value) || !matchesIdentity(value, key, source, config, modelIdentity) ||
    !record(value.source) || value.source.digest !== source.digest ||
    typeof value.source.path !== 'string' || typeof value.source.commitSha !== 'string' ||
    !Array.isArray(value.facts) || !Array.isArray(value.diagnostics) || !strings(value.unresolvedMappings) ||
    typeof value.oml !== 'string' || typeof value.rawModelOutput !== 'string' ||
    typeof value.outputDigest !== 'string') return false;
  const lineCount = source.content.split('\n').length;
  const span = (item: unknown) => record(item) && typeof item.path === 'string' &&
    item.digest === source.digest && typeof item.commitSha === 'string' &&
    Number.isInteger(item.startLine) && Number.isInteger(item.endLine) &&
    Number(item.startLine) >= 1 && Number(item.endLine) >= Number(item.startLine) && Number(item.endLine) <= lineCount;
  const node = (item: unknown) => record(item) && typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.kind === 'string' && typeof item.label === 'string';
  if (!span(value.source) || !value.facts.every((fact) => record(fact) && typeof fact.id === 'string' &&
    node(fact.subject) && node(fact.object) && typeof fact.predicate === 'string' && span(fact.provenance) &&
    record(fact.extractor) && fact.extractor.id === modelIdentity && fact.extractor.version === config.extractorVersion &&
    typeof fact.confidence === 'number' && fact.confidence >= config.minimumConfidence && fact.confidence <= 1)) return false;
  if (!value.diagnostics.every((item) => record(item) && typeof item.id === 'string' &&
    typeof item.kind === 'string' && typeof item.reason === 'string' && strings(item.relatedNodeIds) &&
    Array.isArray(item.provenance) && item.provenance.length > 0 && item.provenance.every(span))) return false;
  if (config.failOnUnresolved && (value.unresolvedMappings.length || value.diagnostics.length)) return false;
  return semanticArtifactOutputDigest(value as unknown as SemanticArtifact) === value.outputDigest;
}

/** Read-only; a broken artifact is not an extraction miss or permission to overwrite evidence. */
export async function inspectSemanticCache(store: SemanticArtifactStore, config: ContextGraphConfig['semantic'],
  source: SemanticSource, modelIdentity: string, forceRevision?: string): Promise<SemanticCacheInspection> {
  const key = semanticArtifactKey(config, source, modelIdentity, forceRevision);
  let value: unknown;
  try { value = await store.read(key); }
  catch (error) {
    return error instanceof SyntaxError
      ? { status: 'corrupt', key, reason: 'Cached artifact is not valid JSON; retain it for diagnosis or use an explicit forced refresh.' }
      : { status: 'unavailable', key, reason: 'Cached artifact could not be read; check local storage access before hydrating.' };
  }
  if (value === undefined) return { status: 'miss', key, reason: 'No artifact exists for the current source and extraction contract.' };
  if (!reusableArtifact(value, key, source, config, modelIdentity)) {
    return { status: 'corrupt', key, reason: 'Cached artifact identity, structure or content digest is invalid; retain it for diagnosis or use an explicit forced refresh.' };
  }
  return { status: 'hit', key, reason: 'Readable artifact matches the source and extraction contract; reuse remains subject to unchanged inputs.', artifact: value };
}
