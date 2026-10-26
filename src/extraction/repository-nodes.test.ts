import { describe, expect, it } from 'vitest';
import type { GraphNode } from '@weftlet/core';
import { canonicalizeRepositoryDocumentNode, repositoryFileNode } from './repository-nodes.js';

describe('repository document identity', () => {
  it('joins both reserved namespaces without changing case, labels or attributes', () => {
    for (const path of ['docs/owner.md', 'docs/guide.mdx', 'docs/notes.txt', 'Docs/OWNER.MD']) {
      for (const prefix of ['component:file:', 'document:']) {
        const original: GraphNode = { id: `${prefix}${path}`, kind: 'Component',
          label: 'Cited implementation guide', attributes: { source: 'unreviewed' } };
        const normalized = canonicalizeRepositoryDocumentNode(original);
        expect(normalized).toEqual({ ...original, id: `document:${path}`, kind: 'Document' });
        expect(normalized.id).toBe(repositoryFileNode(path).id);
        expect(original.kind).toBe('Component');
      }
    }
  });

  it('leaves business concepts and non-document file evidence unchanged', () => {
    for (const node of [
      { id: 'contract:docs/rule.md', kind: 'Contract', label: 'Retention contract' },
      { id: 'component:service.md', kind: 'Component', label: 'Named service' },
      { id: 'component:file:src/worker.test.ts', kind: 'Evidence', label: 'Worker test' },
    ] satisfies GraphNode[]) expect(canonicalizeRepositoryDocumentNode(node)).toBe(node);
  });
});
