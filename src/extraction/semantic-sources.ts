import type { SemanticSource } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import type { GitRepository } from '../repository/git.js';

export interface SemanticSelection {
  readonly selector: string;
  readonly paths: readonly string[];
  readonly excludedPaths: readonly string[];
  readonly status: 'matched' | 'no-documents' | 'missing';
}
export interface SemanticInputIssue {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly paths: readonly string[];
}

/** Git path selection, source bytes and limits are shared by preview and execution. */
export async function selectSemanticInputs(repository: GitRepository, commitSha: string,
  selectors: readonly string[], config: ContextGraphConfig['semantic']) {
  const selections: SemanticSelection[] = [];
  for (const selector of [...new Set(selectors)]) {
    const files = await repository.listFilesAt(commitSha, [selector]);
    const paths = files.filter((path) => /\.(?:md|mdx|txt)$/i.test(path));
    selections.push({ selector, paths, excludedPaths: files.filter((path) => !paths.includes(path)),
      status: paths.length ? 'matched' : files.length ? 'no-documents' : 'missing' });
  }
  const sources: readonly SemanticSource[] = await repository.semanticSources({ commitSha }, selectors);
  const budgets = { maxDocuments: config.maxDocuments ?? 8, maxSourceBytes: config.maxSourceBytes ?? 65_536,
    selectedDocuments: sources.length, totalSourceBytes: sources.reduce((sum, source) => sum + Buffer.byteLength(source.content), 0) };
  const issues: SemanticInputIssue[] = selections.filter((item) => item.status !== 'matched').map((item) => ({
    code: item.status === 'missing' ? 'missing-source' : 'unsupported-source', severity: 'warning',
    message: item.status === 'missing' ? `Semantic selector ${item.selector} matches no committed files.`
      : `Semantic selector ${item.selector} matches no supported Markdown/text documents.`, paths: [item.selector],
  }));
  if (sources.length > budgets.maxDocuments) issues.push({ code: 'document-budget', severity: 'error',
    message: `Semantic source budget exceeded: ${sources.length} documents exceed maxDocuments ${budgets.maxDocuments}.`,
    paths: sources.map((source) => source.path) });
  const oversized = sources.filter((source) => Buffer.byteLength(source.content) > budgets.maxSourceBytes);
  if (oversized.length) issues.push({ code: 'source-byte-budget', severity: 'error',
    message: `Semantic source budget exceeded: ${oversized.length} documents exceed the per-document maxSourceBytes ${budgets.maxSourceBytes}.`,
    paths: oversized.map((source) => source.path) });
  const byId = new Map<string, string[]>();
  for (const source of sources) byId.set(source.stableSemanticId, [...(byId.get(source.stableSemanticId) ?? []), source.path]);
  for (const [id, paths] of byId) if (paths.length > 1) issues.push({ code: 'duplicate-semantic-id', severity: 'error',
    message: `Duplicate stable semantic ID: ${id}`, paths });
  return { sources, selections, budgets, issues };
}
