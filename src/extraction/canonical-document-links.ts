import { posix } from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Definition, Nodes } from 'mdast';

export interface CanonicalDocumentDefinition {
  readonly target: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface CanonicalDocumentLink {
  readonly kind: 'link' | 'ambiguous-reference';
  readonly target?: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly identifier?: string;
  readonly definitions?: readonly CanonicalDocumentDefinition[];
  /** Reference uses and their destination declarations can occur on different lines. */
  readonly referenceStartLine?: number;
  readonly referenceEndLine?: number;
}

/** Explicit Markdown links only: this deliberately does not change the graph linker's policy. */
export function canonicalDocumentLinks(content: string): readonly CanonicalDocumentLink[] {
  const tree = fromMarkdown(content);
  const definitions = new Map<string, Definition[]>();
  const collect = (node: Nodes): void => {
    if (node.type === 'definition') {
      const existing = definitions.get(node.identifier) ?? [];
      existing.push(node);
      definitions.set(node.identifier, existing);
    }
    if ('children' in node) for (const child of node.children) collect(child);
  };
  collect(tree);
  const links: CanonicalDocumentLink[] = [];
  const visit = (node: Nodes): void => {
    if (node.type === 'link' && node.position) {
      links.push({ kind: 'link', target: node.url,
        startLine: node.position.start.line, endLine: node.position.end.line });
      return;
    }
    if (node.type === 'linkReference' && node.position) {
      const declared = (definitions.get(node.identifier) ?? []).flatMap(definition => definition.position
        ? [{ target: definition.url, startLine: definition.position.start.line, endLine: definition.position.end.line }]
        : []);
      const first = declared[0];
      if (!first) return;
      const reference = { identifier: node.identifier,
        referenceStartLine: node.position.start.line, referenceEndLine: node.position.end.line };
      if (new Set(declared.map(definition => definition.target)).size > 1) {
        // Never silently choose the first conflicting definition, as normal Markdown rendering does.
        links.push({ kind: 'ambiguous-reference', ...reference,
          startLine: node.position.start.line, endLine: node.position.end.line, definitions: declared });
      } else {
        links.push({ kind: 'link', ...first, ...reference });
      }
      return;
    }
    if (node.type === 'image' || node.type === 'imageReference' || node.type === 'code' ||
        node.type === 'inlineCode' || node.type === 'html' || node.type === 'definition') return;
    if ('children' in node) for (const child of node.children) visit(child);
  };
  visit(tree);
  return links;
}

export type CanonicalDocumentLinkResolution =
  | { readonly kind: 'path'; readonly path: string; readonly directoryHint?: true }
  | { readonly kind: 'external' | 'fragment' | 'malformed' | 'outside-repository'; readonly reason: string };

const unsafeCharacters = /[\\\x00-\x1f\x7f-\x9f]/;
const scheme = /^[a-z][a-z0-9+.-]*:/i;

function isCanonicalDocumentSourcePath(path: string): boolean {
  return path.length > 0 && !unsafeCharacters.test(path) && !posix.isAbsolute(path) &&
    path !== '.' && path !== '..' && !path.startsWith('../') && !path.endsWith('/') &&
    posix.normalize(path) === path;
}

/** Resolve one explicit destination without consulting the checkout, guessing files or fetching URLs. */
export function resolveCanonicalDocumentLink(sourcePath: string, target: string): CanonicalDocumentLinkResolution {
  if (!isCanonicalDocumentSourcePath(sourcePath)) {
    return { kind: 'malformed', reason: 'Source must be a canonical repository-relative file path.' };
  }
  if (unsafeCharacters.test(target)) {
    return { kind: 'malformed', reason: 'Backslashes and control characters are unsupported in link destinations.' };
  }
  if (target.startsWith('//') || scheme.test(target)) {
    return { kind: 'external', reason: 'External destinations are reported without fetching them.' };
  }
  const rawPath = target.split(/[?#]/, 1)[0]!;
  if (!rawPath) return { kind: 'fragment', reason: 'Same-document links do not select another file.' };
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
    // Plain relative ../ is supported. Encoded traversal segments are intentionally not followed.
    if (rawPath.split('/').some(segment => decodeURIComponent(segment).split('/')
      .some(part => (part === '.' || part === '..') && part !== segment))) {
      return { kind: 'malformed', reason: 'Percent-encoded traversal segments are unsupported.' };
    }
  } catch {
    return { kind: 'malformed', reason: 'Link destination contains malformed percent encoding.' };
  }
  if (unsafeCharacters.test(decoded) || decoded.startsWith('//') || scheme.test(decoded)) {
    return { kind: 'malformed', reason: 'Decoded destination is not a supported repository path.' };
  }
  const path = posix.normalize(decoded.startsWith('/') ? decoded.slice(1) : posix.join(posix.dirname(sourcePath), decoded));
  if (path === '..' || path.startsWith('../') || posix.isAbsolute(path)) {
    return { kind: 'outside-repository', reason: 'Link destination escapes the repository root.' };
  }
  return { kind: 'path', path: path.replace(/\/$/, ''), ...(decoded.endsWith('/') ? { directoryHint: true } : {}) };
}
