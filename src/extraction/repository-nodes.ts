import { repositoryFileNode, type GraphNode } from '@weftlet/core';
import { sha256 } from '../infrastructure/util.js';
import { SemanticProviderError } from './semantic-process.js';
export { repositoryFileNode } from '@weftlet/core';

/** Internal cache contract: changing this policy must also change snapshot assembly identity. */
export const repositoryNodeIdentityVersion = 2;

/** Reserved file IDs have a physical kind independent of their relationship role.
 * Validation never repairs a provider assertion or reclassifies a business concept.
 */
export function isCanonicalRepositoryNode(node: GraphNode): boolean {
  const prefix = /^(component:file:|document:)/.exec(node.id)?.[0];
  if (!prefix) return true;
  const path = node.id.slice(prefix.length);
  if (!path) return false;
  const canonical = repositoryFileNode(path);
  // Document also names logical documents (e.g. document:classification).
  // Only recognized document paths participate in the existing file policy.
  if (prefix === 'document:' && canonical.kind !== 'Document') return true;
  return node.id === canonical.id && node.kind === canonical.kind;
}

/** Retain the established document migration, but never coerce a physical code-file kind. */
export function assertSemanticRepositoryNodes(assertion: { subject: GraphNode; object: GraphNode }, index: number): void {
  for (const side of ['subject', 'object'] as const) {
    const node = assertion[side];
    if (!isCanonicalRepositoryNode(canonicalizeRepositoryDocumentNode(node))) {
      throw new SemanticProviderError('invalid-output',
        `Invalid canonical repository-file identity at assertion[${index}].${side} (node ${sha256(node.id).slice(0, 16)}). ` +
        'Use the repositoryFileNode ID/kind policy; a relationship role does not override physical-file kind. No assertion was rewritten.');
    }
  }
}

/** Normalize only reserved document/file identities, never inferred business concept IDs. */
export function canonicalizeRepositoryDocumentNode(node: GraphNode): GraphNode {
  const match = /^(?:component:file:|document:)(.+)$/.exec(node.id);
  if (!match) return node;
  const canonical = repositoryFileNode(match[1]!);
  if (canonical.kind !== 'Document') return node;
  return { ...node, id: canonical.id, kind: canonical.kind };
}
