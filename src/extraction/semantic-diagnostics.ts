import type { SemanticSource } from '@weftlet/core';
import { sha256, stableJson } from '../infrastructure/util.js';

export type SemanticHydrationPhase =
  | 'semantic-cache-read' | 'semantic-extract' | 'semantic-validate' | 'semantic-cache-write';

/** Preserve policy distinctions without copying source-specific messages into run reports. */
export class SemanticPolicyError extends Error {
  constructor(readonly code: 'unresolved' | 'low-confidence', message: string) {
    super(message);
    this.name = 'SemanticPolicyError';
  }
}

/** Correlation only: never used as an artifact key or an authorization boundary. */
export function semanticSourceId(repositoryId: string, source: Pick<SemanticSource, 'stableSemanticId'>): string {
  return `source-${sha256(stableJson({ kind: 'weftlet-semantic-source-v1', repositoryId,
    stableSemanticId: source.stableSemanticId }))}`;
}
