import type { GraphNode } from './core.js';

/**
 * Canonical physical-file identity, shared by toolkit extractors and repository adapters.
 * The caller supplies a repository-relative path with its intended spelling. This pure
 * mapping does not resolve paths or establish existence, intent, ownership or approval.
 */
export function repositoryFileNode(path: string): GraphNode {
  if (/\.(?:md|mdx|txt)$/i.test(path)) return { id: `document:${path}`, kind: 'Document', label: path };
  return { id: `component:file:${path}`, label: path,
    kind: /\.(spec|test)\.[^.]+$/i.test(path) ? 'Evidence' : 'Component' };
}
