import type { GraphNode, SourceSpan } from './core.js';
import { sha256, stableJson } from './util.js';

import type { CodeSymbolDescriptor } from './code-types.js';
export type { CodeRange, CodeResolution, CodeSymbolDescriptor, CodeOccurrence } from './code-types.js';

export interface CodeSymbolNode extends GraphNode {
  readonly kind: 'CodeSymbol';
  readonly codeSymbol: CodeSymbolDescriptor;
}

/** Producer-neutral identity. Labels/resolution are evidence, never identity inputs. */
export function codeSymbolNode(descriptor: CodeSymbolDescriptor, label: string): CodeSymbolNode {
  if (descriptor.schemaVersion !== 1 || !descriptor.provider || !descriptor.repositoryId ||
      !descriptor.nativeSymbol || !label || !['repository', 'index-document'].includes(descriptor.identityScope) ||
      !['indexed-definition', 'declaration-only', 'no-indexed-definition'].includes(descriptor.resolution)) {
    throw new Error('Invalid code symbol descriptor');
  }
  if (descriptor.identityScope === 'index-document') {
    const path = descriptor.documentPath;
    if (!path || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path) ||
        path.split('/').some(part => !part || part === '.' || part === '..') || !descriptor.indexDigest) {
      throw new Error('Local code identity requires a repository-relative path and index digest');
    }
  } else if (descriptor.documentPath !== undefined || descriptor.indexDigest !== undefined) {
    throw new Error('Repository code identity cannot carry local identity inputs');
  }
  const { resolution: _resolution, ...identity } = descriptor;
  return { id: `code:symbol:v1:${sha256(stableJson(identity))}`, kind: 'CodeSymbol', label,
    codeSymbol: { ...descriptor } };
}

export function sourceLocation(span: SourceSpan): string {
  return `${span.path}:${span.startLine}${span.startColumn === undefined ? '' : `:${span.startColumn}`}`;
}
