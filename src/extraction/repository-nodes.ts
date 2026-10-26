import { repositoryFileNode, type GraphNode } from '@weftlet/core';
export { repositoryFileNode } from '@weftlet/core';

/** Internal cache contract: changing this policy must also change snapshot assembly identity. */
export const repositoryNodeIdentityVersion = 1;

/** Normalize only reserved document/file identities, never inferred business concept IDs. */
export function canonicalizeRepositoryDocumentNode(node: GraphNode): GraphNode {
  const match = /^(?:component:file:|document:)(.+)$/.exec(node.id);
  if (!match) return node;
  const canonical = repositoryFileNode(match[1]!);
  if (canonical.kind !== 'Document') return node;
  return { ...node, id: canonical.id, kind: canonical.kind };
}
