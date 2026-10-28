import type { ImpactScanRequest } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import type { GitRepository } from '../repository/git.js';
import { sha256, stableJson } from '../infrastructure/util.js';
import { AgentSemanticScopeResolver } from './agent-context.js';

export interface SemanticScope {
  readonly mode: 'configured' | 'agent' | 'traversal';
  readonly selectors: readonly string[];
  readonly digest: string;
  readonly headName: string;
  readonly omittedDocuments: readonly string[];
  readonly ignoredSearchTerms: number;
}

/** Resolve the same committed selection for previews and explicit artifact recovery. */
export async function resolveSemanticScope(config: ContextGraphConfig, repository: GitRepository,
  commitSha: string, request: ImpactScanRequest = {}): Promise<SemanticScope> {
  const agent = config.agentContext
    ? await new AgentSemanticScopeResolver(config, repository).resolve(request, commitSha)
    : undefined;
  const selectors = config.documentTraversal?.entryPoints ?? agent?.semanticSources ?? config.semanticSources;
  return { mode: config.documentTraversal ? 'traversal' : agent ? 'agent' : 'configured', selectors, digest: sha256(stableJson(selectors)),
    headName: agent?.headName ?? 'default', omittedDocuments: agent?.omittedDocuments ?? [],
    ignoredSearchTerms: agent?.ignoredSearchTerms ?? 0 };
}
