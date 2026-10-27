import { describe, expect, it } from 'vitest';
import { canonicalDocumentLinks, resolveCanonicalDocumentLink } from './canonical-document-links.js';
import { documentReferences } from './document-references.js';

describe('canonical Markdown document links', () => {
  it('finds direct and used reference links with declaration and use citations inside nested Markdown', () => {
    const content = [
      '# Public owner',
      '> See [rules](./Rules%20%C3%A9.md#limits).',
      '',
      '- A task uses **[its contract][Contract]**.',
      '- Repeated [contract][] and [Contract] references remain cited.',
      '',
      '[contract]: ../contracts/owner.md',
      '  "Owner contract"',
      '[unused]: unused.md',
    ].join('\r\n');
    const links = canonicalDocumentLinks(content);
    expect(links).toHaveLength(4);
    expect(links[0]).toEqual({ kind: 'link', target: './Rules%20%C3%A9.md#limits', startLine: 2, endLine: 2 });
    expect(links.slice(1)).toEqual([
      { kind: 'link', target: '../contracts/owner.md', startLine: 7, endLine: 8,
        identifier: 'contract', referenceStartLine: 4, referenceEndLine: 4 },
      { kind: 'link', target: '../contracts/owner.md', startLine: 7, endLine: 8,
        identifier: 'contract', referenceStartLine: 5, referenceEndLine: 5 },
      { kind: 'link', target: '../contracts/owner.md', startLine: 7, endLine: 8,
        identifier: 'contract', referenceStartLine: 5, referenceEndLine: 5 },
    ]);
  });

  it('reports every conflicting definition for a used reference without adopting Markdown first-wins behavior', () => {
    const content = '[Owner][Owner   rules]\n\n[owner rules]: first.md\n[OWNER RULES]: second.md\n[owner rules]: first.md\n';
    expect(canonicalDocumentLinks(content)).toEqual([{
      kind: 'ambiguous-reference', identifier: 'owner rules', startLine: 1, endLine: 1,
      referenceStartLine: 1, referenceEndLine: 1,
      definitions: [
        { target: 'first.md', startLine: 3, endLine: 3 },
        { target: 'second.md', startLine: 4, endLine: 4 },
        { target: 'first.md', startLine: 5, endLine: 5 },
      ],
    }]);
    // The pre-existing graph linker keeps its original behavior; traversal has a separate policy.
    expect(documentReferences(content)[0]?.target).toBe('first.md');
  });

  it('accepts identical destination definitions while retaining a real destination citation', () => {
    expect(canonicalDocumentLinks('[Owner][x]\n\n[x]: owner.md\n[x]: owner.md "different title"\n')).toEqual([{
      kind: 'link', target: 'owner.md', startLine: 3, endLine: 3, identifier: 'x',
      referenceStartLine: 1, referenceEndLine: 1,
    }]);
  });

  it('ignores bare/code paths, images, HTML and unused definitions rather than expanding examples', () => {
    const content = [
      'docs/owner.md and `docs/owner.md` are examples.',
      '![owner](image.md) and ![owner][image]',
      '',
      '[image]: image-reference.md',
      '[unused]: first.md',
      '[unused]: second.md',
      '',
      '```md',
      '[owner](code.md)',
      '```',
      '',
      '    [owner](indented-code.md)',
      '',
      '<!-- [owner](comment.md) -->',
      '<a href="html.md">owner</a>',
    ].join('\n');
    expect(canonicalDocumentLinks(content)).toEqual([]);
  });

  it('retains explicit external, self and code-file links for classification by the caller', () => {
    expect(canonicalDocumentLinks('[outside](https://example.test/owner.md) [here](#rule) [implementation](../src/worker.ts)')
      .map(link => link.target)).toEqual(['https://example.test/owner.md', '#rule', '../src/worker.ts']);
  });
});

describe('canonical link resolution', () => {
  it.each([
    ['./owner.md#rule', 'docs/owner.md'],
    ['../contracts/Owner.md?view=all#rule', 'contracts/Owner.md'],
    ['/sot/Owner.md', 'sot/Owner.md'],
    ['Parts/../owner.md', 'docs/owner.md'],
    ['../docs/R%C3%A8gles%20du%20produit.md', 'docs/Règles du produit.md'],
    ['hash%23name%3F.md#section', 'docs/hash#name?.md'],
    ['folder%2Fowner.md', 'docs/folder/owner.md'],
    ['encoded%2520name.md', 'docs/encoded%20name.md'],
    ['folder%20name/../owner.md', 'docs/owner.md'],
  ])('resolves %s exactly without file lookup', (target, path) => {
    expect(resolveCanonicalDocumentLink('docs/source.md', target)).toEqual({ kind: 'path', path });
  });

  it.each([
    ['../docs/', 'docs'], ['../docs%2F', 'docs'], ['owner.md/', 'docs/owner.md'], ['/', '.'],
  ])('preserves directory intent for %s while returning a canonical entry path', (target, path) => {
    expect(resolveCanonicalDocumentLink('docs/source.md', target)).toEqual({ kind: 'path', path, directoryHint: true });
  });

  it.each(['', '#section', '?view=all', '?view=all#section'])('classifies %s as a same-document destination', target => {
    expect(resolveCanonicalDocumentLink('docs/source.md', target).kind).toBe('fragment');
  });

  it.each(['https://example.test/doc.md', 'mailto:owner@example.test', '//example.test/docs/owner.md', 'git+ssh://example.test/repo'])
    ('classifies %s as external without following it', target => {
      expect(resolveCanonicalDocumentLink('docs/source.md', target).kind).toBe('external');
    });

  it.each(['../../outside.md', '/../../outside.md', '../../../'])('rejects escaping destination %s', target => {
    expect(resolveCanonicalDocumentLink('docs/source.md', target).kind).toBe('outside-repository');
  });

  it.each(['%XX.md', '%E9.md', '..%2F..%2Foutside.md', '%2e%2e/owner.md', '%2E/owner.md',
    'folder/%2e%2e/owner.md', '../%5cowner.md', '../\\owner.md', 'owner%00.md', 'owner%0A.md',
    'owner%7f.md', 'owner%C2%85.md', '%2f%2fexample.test/owner.md', 'https%3A%2F%2Fexample.test/owner.md'])
    ('reports malformed destination %s', target => {
      expect(resolveCanonicalDocumentLink('docs/source.md', target).kind).toBe('malformed');
    });

  it.each(['', '/docs/source.md', '../source.md', 'docs/../source.md', 'docs\\source.md', 'docs/source\n.md', 'docs/source.md/'])
    ('rejects a noncanonical source path %s', source => {
      expect(resolveCanonicalDocumentLink(source, 'owner.md').kind).toBe('malformed');
    });
});
