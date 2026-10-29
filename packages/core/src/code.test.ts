import { describe, expect, it } from 'vitest';
import { codeSymbolNode, sourceLocation, type CodeSymbolDescriptor } from './code.js';

const descriptor: CodeSymbolDescriptor = { schemaVersion: 1, provider: 'public-indexer', repositoryId: 'example/public',
  nativeSymbol: 'public/functions/normalize', identityScope: 'repository', resolution: 'indexed-definition' };

describe('neutral code identity', () => {
  it('binds repository and producer identities while keeping evidence and labels out of the key', () => {
    const first = codeSymbolNode(descriptor, 'normalize');
    expect(codeSymbolNode({ ...descriptor, resolution: 'no-indexed-definition' }, 'unresolved').id).toBe(first.id);
    expect(codeSymbolNode({ ...descriptor, repositoryId: 'other/repository' }, 'normalize').id).not.toBe(first.id);
    expect(codeSymbolNode({ ...descriptor, provider: 'other' }, 'normalize').id).not.toBe(first.id);
    expect(first.kind).toBe('CodeSymbol');
  });
  it('scopes reused local ordinals to their document and exact index', () => {
    const local = { ...descriptor, nativeSymbol: 'local 0', identityScope: 'index-document' as const,
      documentPath: 'src/one.ts', indexDigest: 'first-index' };
    const first = codeSymbolNode(local, 'value');
    expect(codeSymbolNode({ ...local, documentPath: 'src/two.ts' }, 'value').id).not.toBe(first.id);
    expect(codeSymbolNode({ ...local, indexDigest: 'second-index' }, 'value').id).not.toBe(first.id);
    expect(codeSymbolNode(local, 'value')).toEqual(first);
  });
  it('rejects incomplete and escaping local identities', () => {
    expect(() => codeSymbolNode({ ...descriptor, indexDigest: 'unexpected' }, 'name')).toThrow();
    for (const documentPath of ['', '/root.ts', '../file.ts', 'src/../file.ts', 'C:/file.ts', 'src\\file.ts']) {
      expect(() => codeSymbolNode({ ...descriptor, identityScope: 'index-document', documentPath, indexDigest: 'index' }, 'name')).toThrow();
    }
  });
  it('renders columns only when source evidence provides them', () => {
    const span = { path: 'src/x.ts', startLine: 12, endLine: 12, commitSha: 'a', digest: 'd' };
    expect(sourceLocation(span)).toBe('src/x.ts:12');
    expect(sourceLocation({ ...span, startColumn: 9, endColumn: 15, columnEncoding: 'utf-16' })).toBe('src/x.ts:12:9');
  });
});
