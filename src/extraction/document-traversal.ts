import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import type { GitRepository, GitTreeEntry } from '../repository/git.js';
import { canonicalDocumentLinks, resolveCanonicalDocumentLink, type CanonicalDocumentLink } from './canonical-document-links.js';

export interface DocumentTraversalOptions {
  readonly entryPoints: readonly string[];
  readonly roots?: readonly string[];
  readonly maxReadDocuments?: number;
  readonly maxReadBytes?: number;
  readonly maxDocumentBytes?: number;
  readonly maxDocuments?: number;
  readonly maxSourceBytes?: number;
}
export interface DocumentReachingLink {
  readonly sourcePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly referenceStartLine?: number;
  readonly referenceEndLine?: number;
}
export interface TraversalDocument {
  readonly path: string;
  readonly bytes: number;
  readonly digest?: string;
  readonly status: 'read' | 'unread';
  readonly entryPoint: boolean;
  readonly reachedBy: readonly DocumentReachingLink[];
}
export type DocumentLinkStatus = 'document' | 'non-document' | 'external' | 'fragment' | 'missing' |
  'outside-scope' | 'outside-repository' | 'directory' | 'symlink' | 'submodule' | 'ambiguous' | 'malformed' | 'unsupported';
export interface DocumentTraversalLink extends DocumentReachingLink {
  readonly target?: string;
  readonly path?: string;
  readonly status: DocumentLinkStatus;
  readonly definitions?: CanonicalDocumentLink['definitions'];
}
export interface DocumentTraversalIssue {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly paths: readonly string[];
}
export interface DocumentTraversalReport {
  readonly entryPoints: readonly string[];
  readonly roots: readonly string[];
  readonly documents: readonly TraversalDocument[];
  readonly links: readonly DocumentTraversalLink[];
  readonly issues: readonly DocumentTraversalIssue[];
  readonly coverage: { readonly complete: boolean; readonly unvisited: readonly string[] };
  readonly limits: { readonly maxReadDocuments: number; readonly maxReadBytes: number; readonly maxDocumentBytes: number };
  /** Read counters include attempted reads, charged at committed blob sizes even on failure. */
  readonly counters: { readonly readDocuments: number; readonly readBytes: number; readonly discoveredDocuments: number; readonly links: number };
  /** Prospective extraction comparison; incomplete traversal yields only known lower bounds. */
  readonly budgets: { readonly maxDocuments: number; readonly maxSourceBytes: number; readonly documents: number;
    readonly bytes: number; readonly withinLimits: boolean };
}

const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const supportedDocument = (path: string) => /\.(?:md|mdx|txt)$/i.test(path);
const unsafePath = (path: string) => /[\\:*?\[\]{}\x00-\x1f\x7f-\x9f\uFFFD]/.test(path);
const inside = (path: string, root: string) => root === '.' || path === root || path.startsWith(`${root}/`);

function paths(value: readonly string[], name: string, allowRoot: boolean): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 10_000 ||
      new Set(value).size !== value.length || value.some(path => typeof path !== 'string' || !path ||
        path !== path.trim() || unsafePath(path) || path.length > 4096 || path.endsWith('/') || posix.isAbsolute(path) ||
        path === '..' || path.startsWith('../') || posix.normalize(path) !== path || (!allowRoot && path === '.'))) {
    throw new Error(`${name} must contain unique canonical repository-relative paths without globs or control characters`);
  }
  return [...value].sort(compare);
}

function bound(value: number | undefined, fallback: number, maximum: number, name: string): number {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}`);
  }
  return resolved;
}

type TraversalRepository = Pick<GitRepository, 'listEntriesAt' | 'readFileAt'>;
interface TraversalSettings {
  readonly entryPoints: readonly string[];
  readonly roots: readonly string[];
  readonly limits: DocumentTraversalReport['limits'];
  readonly maxDocuments: number;
  readonly maxSourceBytes: number;
}
interface TraversalState {
  tracked: ReadonlyMap<string, GitTreeEntry>;
  readonly documents: Map<string, TraversalDocument>;
  readonly links: DocumentTraversalLink[];
  readonly issues: DocumentTraversalIssue[];
  readonly queue: string[];
  complete: boolean;
  readDocuments: number;
  readBytes: number;
}

function settings(options: DocumentTraversalOptions): TraversalSettings {
  return {
    entryPoints: paths(options.entryPoints, 'entryPoints', false), roots: paths(options.roots ?? ['.'], 'roots', true),
    limits: {
      maxReadDocuments: bound(options.maxReadDocuments, 1000, 10_000, 'maxReadDocuments'),
      maxReadBytes: bound(options.maxReadBytes, 16 * 1024 * 1024, 64 * 1024 * 1024, 'maxReadBytes'),
      maxDocumentBytes: bound(options.maxDocumentBytes, 1024 * 1024, 4 * 1024 * 1024, 'maxDocumentBytes'),
    },
    maxDocuments: bound(options.maxDocuments, 8, 10_000, 'maxDocuments'),
    maxSourceBytes: bound(options.maxSourceBytes, 65_536, 4 * 1024 * 1024, 'maxSourceBytes'),
  };
}

function issue(state: TraversalState, code: string, message: string, affected: readonly string[], coverage = true): void {
  state.issues.push({ code, severity: 'error', message, paths: affected });
  if (coverage) state.complete = false;
}

function entryBoundary(entry: GitTreeEntry | undefined): 'symlink' | 'submodule' | undefined {
  if (entry?.type === 'commit' || entry?.mode === '160000') return 'submodule';
  return entry?.mode === '120000' ? 'symlink' : undefined;
}

function regularBlob(entry: GitTreeEntry | undefined): boolean {
  return entry?.type === 'blob' && ['100644', '100755'].includes(entry.mode) &&
    Number.isSafeInteger(entry.size) && entry.size! >= 0;
}

function classifyTarget(path: string, tracked: ReadonlyMap<string, GitTreeEntry>, roots: readonly string[]): DocumentLinkStatus {
  if (unsafePath(path)) return 'unsupported';
  const segments = path.split('/');
  for (let count = 1; count < segments.length; count++) {
    const ancestor = tracked.get(segments.slice(0, count).join('/'));
    const boundary = ancestor?.mode === '120000' ? 'symlink' : entryBoundary(ancestor);
    if (boundary) return boundary;
  }
  const entry = tracked.get(path);
  const boundary = entryBoundary(entry);
  if (boundary) return boundary;
  // Roots bound document traversal; an existing regular code/asset link needs no body read.
  const regular = regularBlob(entry);
  if (regular && !supportedDocument(path)) return 'non-document';
  if (!roots.some(root => inside(path, root))) return 'outside-scope';
  if (path === '.' || entry?.type === 'tree') return 'directory';
  if (!entry) return 'missing';
  return regular ? 'document' : 'unsupported';
}

function discover(state: TraversalState, entryPoints: readonly string[], path: string, reaching?: DocumentReachingLink): void {
  const old = state.documents.get(path);
  if (old) {
    if (reaching) state.documents.set(path, { ...old, reachedBy: [...old.reachedBy, reaching] });
    return;
  }
  state.documents.set(path, { path, bytes: state.tracked.get(path)!.size!, status: 'unread',
    entryPoint: entryPoints.includes(path), reachedBy: reaching ? [reaching] : [] });
  state.queue.push(path);
}

function initializeEntries(state: TraversalState, selection: TraversalSettings): void {
  for (const root of selection.roots) if (root !== '.' && !state.tracked.has(root)) {
    issue(state, 'missing-root', 'A configured traversal root is not a committed entry.', [root]);
  }
  for (const path of selection.entryPoints) {
    const status = classifyTarget(path, state.tracked, selection.roots);
    if (status === 'document') discover(state, selection.entryPoints, path);
    else issue(state, `entry-${status}`, 'An entry point is not an in-scope regular document.', [path]);
  }
}

function readLimit(document: TraversalDocument, state: TraversalState, limits: DocumentTraversalReport['limits']): string | undefined {
  if (document.bytes > limits.maxDocumentBytes) return 'document-read-bytes';
  if (state.readDocuments >= limits.maxReadDocuments) return 'document-read-count';
  return state.readBytes + document.bytes > limits.maxReadBytes ? 'total-read-bytes' : undefined;
}

async function readDocumentLinks(repository: TraversalRepository, commitSha: string, document: TraversalDocument,
  state: TraversalState, limits: DocumentTraversalReport['limits']): Promise<
    { readonly digest: string; readonly references: readonly CanonicalDocumentLink[] } | undefined> {
  const blocked = readLimit(document, state, limits);
  if (blocked) {
    issue(state, blocked, 'A discovered document was not read because a traversal safety limit would be exceeded.', [document.path]);
    return;
  }
  state.readDocuments++;
  state.readBytes += document.bytes;
  let content: string;
  try { content = await repository.readFileAt(commitSha, document.path); }
  catch { issue(state, 'document-read-failed', 'A committed document could not be read.', [document.path]); return; }
  // Git's string API cannot prove whether U+FFFD was literal or introduced by lossy UTF-8 decoding.
  if (content.includes('\uFFFD') || content.includes('\0') || Buffer.byteLength(content) !== document.bytes) {
    issue(state, 'unsupported-document-encoding', 'Document bytes cannot be represented unambiguously as supported UTF-8 text.', [document.path]); return;
  }
  try {
    return { references: canonicalDocumentLinks(content), digest: createHash('sha256').update(content).digest('hex') };
  } catch {
    issue(state, 'document-parse-failed', 'Committed Markdown links could not be parsed.', [document.path]); return;
  }
}

function followReference(state: TraversalState, selection: TraversalSettings, path: string, reference: CanonicalDocumentLink): void {
  const citation: DocumentReachingLink = { sourcePath: path, startLine: reference.startLine, endLine: reference.endLine,
    ...(reference.referenceStartLine === undefined ? {} : { referenceStartLine: reference.referenceStartLine,
      referenceEndLine: reference.referenceEndLine }) };
  if (reference.kind === 'ambiguous-reference') {
    state.links.push({ ...citation, status: 'ambiguous', definitions: reference.definitions });
    issue(state, 'ambiguous-reference', 'A used reference has conflicting Markdown definitions.', [path]); return;
  }
  const resolved = resolveCanonicalDocumentLink(path, reference.target!);
  if (resolved.kind !== 'path') {
    state.links.push({ ...citation, target: reference.target, status: resolved.kind });
    if (resolved.kind !== 'external' && resolved.kind !== 'fragment') issue(state, resolved.kind, resolved.reason, [path]);
    return;
  }
  const classified = classifyTarget(resolved.path, state.tracked, selection.roots);
  const status = resolved.directoryHint && ['document', 'non-document'].includes(classified) ? 'unsupported' : classified;
  state.links.push({ ...citation, target: reference.target, path: resolved.path, status });
  if (status === 'document') discover(state, selection.entryPoints, resolved.path, citation);
  else if (status !== 'non-document') issue(state, `link-${status}`, 'A canonical local link could not be traversed as a regular in-scope document.', [path, resolved.path]);
}

async function walkDocuments(repository: TraversalRepository, commitSha: string, state: TraversalState, selection: TraversalSettings): Promise<void> {
  for (let index = 0; index < state.queue.length; index++) {
    const path = state.queue[index]!;
    const read = await readDocumentLinks(repository, commitSha, state.documents.get(path)!, state, selection.limits);
    if (!read) continue;
    state.documents.set(path, { ...state.documents.get(path)!, status: 'read', digest: read.digest });
    for (const reference of read.references) followReference(state, selection, path, reference);
  }
}

function finishReport(state: TraversalState, selection: TraversalSettings, indexReadable: boolean): DocumentTraversalReport {
  const { entryPoints, roots, limits, maxDocuments, maxSourceBytes } = selection;
  const ordered = [...state.documents.values()].sort((a, b) => compare(a.path, b.path));
  const bytes = ordered.reduce((sum, document) => sum + document.bytes, 0);
  const oversized = ordered.filter(document => document.bytes > maxSourceBytes).map(document => document.path);
  if (ordered.length > maxDocuments) issue(state, 'document-budget', 'Known reachable documents exceed the prospective extraction count budget.', ordered.map(document => document.path), false);
  if (oversized.length) issue(state, 'source-byte-budget', 'Known reachable documents exceed the prospective per-source extraction byte budget.', oversized, false);
  return { entryPoints, roots, documents: ordered, links: state.links, issues: state.issues,
    coverage: { complete: state.complete, unvisited: indexReadable ? ordered.filter(document => document.status === 'unread').map(document => document.path) : entryPoints },
    limits, counters: { readDocuments: state.readDocuments, readBytes: state.readBytes, discoveredDocuments: ordered.length, links: state.links.length },
    budgets: { maxDocuments, maxSourceBytes, documents: ordered.length, bytes,
      withinLimits: ordered.length <= maxDocuments && !oversized.length } };
}

/** Prospective committed Markdown closure only: never loads execution adapters or writes evidence. */
export async function traverseDocuments(repository: TraversalRepository,
  commitSha: string, options: DocumentTraversalOptions): Promise<DocumentTraversalReport> {
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(commitSha)) {
    throw new Error('Document traversal requires a resolved immutable commit SHA');
  }
  const selection = settings(options);
  const state: TraversalState = { tracked: new Map(), documents: new Map(), links: [], issues: [], queue: [],
    complete: true, readDocuments: 0, readBytes: 0 };
  let indexReadable = true;
  try { state.tracked = new Map((await repository.listEntriesAt(commitSha)).map(entry => [entry.path, entry])); }
  catch { indexReadable = false; issue(state, 'repository-index-unavailable', 'Committed repository entries could not be read.', selection.entryPoints); }
  if (indexReadable) initializeEntries(state, selection);
  await walkDocuments(repository, commitSha, state, selection);
  return finishReport(state, selection, indexReadable);
}
