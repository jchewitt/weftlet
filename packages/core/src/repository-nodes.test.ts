import { describe, expect, it } from 'vitest';
import { repositoryFileNode } from './index.js';

describe('public canonical physical-file nodes', () => {
  it.each(['src/worker.spec.ts', 'src/worker.test.tsx', 'src/worker.SPEC.JS', 'src/worker.TEST.MJS'])(
    'classifies the existing test/spec convention as Evidence: %s', (path) => {
      expect(repositoryFileNode(path)).toEqual({ id: `component:file:${path}`, kind: 'Evidence', label: path });
    },
  );

  it.each(['src/worker.ts', 'src/domain.prisma', 'src/config.json', 'tests/worker.ts', 'test.ts', 'src/worker.test.d.ts'])(
    'retains Component without inventing broader test detection: %s', (path) => {
      expect(repositoryFileNode(path)).toEqual({ id: `component:file:${path}`, kind: 'Component', label: path });
    },
  );

  it.each(['docs/owner.md', 'docs/guide.mdx', 'docs/notes.txt', 'Docs/OWNER.MD', 'docs/owner.spec.md'])(
    'preserves document identity, including precedence over test suffixes: %s', (path) => {
      expect(repositoryFileNode(path)).toEqual({ id: `document:${path}`, kind: 'Document', label: path });
    },
  );

  it('preserves exact caller path spelling without resolution or authority claims', () => {
    const path = 'Src/../Shared/Missing Worker.test.TS';
    const node = repositoryFileNode(path);
    expect(node).toEqual({ id: `component:file:${path}`, kind: 'Evidence', label: path });
    expect(repositoryFileNode(path)).not.toBe(node);
    expect(Object.keys(node).sort()).toEqual(['id', 'kind', 'label']);
  });
});
