import type { CodeInventory } from '@weftlet/core';
import type { GitTreeEntry } from '../repository/git.js';
import type { ScipSourceProject } from '../configuration/scip-project.js';
import type { ScipIndexResult } from './scip-runtime.js';
import { matchesRepositoryGlob } from '../repository/glob.js';
import { sha256, stableJson } from '../infrastructure/util.js';

/** No package contents, dependencies or active checkout are read. Boundary names are physical paths. */
export function buildCodeInventory(entries: readonly GitTreeEntry[], selectedPaths: readonly string[], codeRoots: readonly string[],
  project: ScipSourceProject | undefined, index: ScipIndexResult): CodeInventory {
  const regular = entries.filter(entry => entry.type === 'blob' && ['100644', '100755'].includes(entry.mode));
  const manifests = regular.filter(entry => entry.path === 'package.json' || entry.path.endsWith('/package.json'));
  const roots = new Map(manifests.map(entry => [entry.path === 'package.json' ? '.' : entry.path.slice(0, -'/package.json'.length),
    { path: entry.path, blobId: entry.objectId }]));
  const orderedRoots = [...roots.keys()].filter(root => root !== '.').sort((a, b) => b.length - a.length || a.localeCompare(b));
  const indexed = index.indexedPaths === undefined ? undefined : new Set(index.indexedPaths);
  const selected = new Set(selectedPaths);
  const files = regular.filter(entry => /\.(?:[cm]?ts|tsx)$/.test(entry.path)).map(entry => ({
    path: entry.path, blobId: entry.objectId, projectRoot: orderedRoots.find(root => entry.path.startsWith(`${root}/`)) ?? '.',
    codeRootSelected: selected.has(entry.path),
    requested: project ? project.include.some(pattern => matchesRepositoryGlob(entry.path, pattern)) ? 'included' as const : 'excluded' as const : 'unknown' as const,
    ...(indexed ? { indexed: indexed.has(entry.path) } : {}),
  })).sort((a, b) => a.path.localeCompare(b.path));
  const projects = [...new Set(['.', ...roots.keys()])].sort().map(root => ({ root, ...(roots.has(root) ? { manifest: roots.get(root)! } : {}) }));
  const known = new Set(files.map(file => file.path));
  const plain = { version: 'committed-code-inventory-v1' as const, scipIndexDigest: index.digest,
    selection: project ? 'source-project' as const : 'indexer-command' as const,
    indexObservation: indexed ? 'recorded' as const : 'unavailable' as const, codeRoots: [...codeRoots],
    ...(project ? { includePatterns: [...project.include] } : {}), projects, files,
    ...(indexed ? { otherIndexedFiles: [...indexed].filter(path => !known.has(path)).length } : {}) };
  return { ...plain, digest: sha256(stableJson(plain)) };
}
