import type { GraphNode } from '@weftlet/core';

/** Internal cache contract: changing this policy must also change snapshot assembly identity. */
export const repositoryNodeIdentityVersion = 1;

function isDocumentPath(path: string): boolean {
  return /\.(?:md|mdx|txt)$/i.test(path);
}

/** Physical file identity; this does not establish existence, intent, ownership or approval. */
export function repositoryFileNode(path: string): GraphNode {
  if (isDocumentPath(path)) return { id: `document:${path}`, kind: 'Document', label: path };
  return { id: `component:file:${path}`, label: path,
    kind: /\.(spec|test)\.[^.]+$/i.test(path) ? 'Evidence' : 'Component' };
}

/** Normalize only reserved document/file identities, never inferred business concept IDs. */
export function canonicalizeRepositoryDocumentNode(node: GraphNode): GraphNode {
  const match = /^(?:component:file:|document:)(.+)$/.exec(node.id);
  if (!match || !isDocumentPath(match[1]!)) return node;
  const canonical = repositoryFileNode(match[1]!);
  return { ...node, id: canonical.id, kind: canonical.kind };
}
