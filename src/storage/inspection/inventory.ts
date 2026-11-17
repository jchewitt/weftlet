import { join } from 'node:path';
import { inventoryRoots, walkCache } from './walk.js';
import { inspectCacheObject, linkInventory } from './metadata.js';
import type { CacheObject } from './layout.js';

export interface InventoryOptions {
  roots: readonly string[];
  verify?: boolean;
  maxEntries?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}
function total(entries: CacheObject[]) {
  const unique = new Set<string>();
  let logicalBytes = 0, uniqueLogicalBytes = 0, allocatedKnownBytes = 0, allocatedUnknownEntries = 0;
  for (const entry of entries) {
    logicalBytes += entry.logicalBytes;
    const identity = entry.physicalIdentity ?? join(entry.root, entry.path);
    if (unique.has(identity)) continue;
    unique.add(identity); uniqueLogicalBytes += entry.logicalBytes;
    if (entry.allocatedBytes === null) allocatedUnknownEntries++; else allocatedKnownBytes += entry.allocatedBytes;
  }
  return { entries: entries.length, logicalBytes, uniqueLogicalBytes, allocatedKnownBytes, allocatedUnknownEntries };
}
function group(entries: CacheObject[], key: (entry: CacheObject) => string) {
  const groups = new Map<string, CacheObject[]>();
  for (const entry of entries) { const name = key(entry); const items = groups.get(name) ?? []; items.push(entry); groups.set(name, items); }
  return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([name, items]) => [name, total(items)]));
}
export async function inventoryCache(options: InventoryOptions) {
  const maxEntries = options.maxEntries ?? 100_000, maxBytes = options.maxBytes ?? 8 * 1024 ** 3;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 1_000_000) throw Error('maxEntries must be between 1 and 1000000');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw Error('maxBytes must be a positive safe integer');
  if (!options.roots.length || options.roots.length > 16) throw Error('Choose between 1 and 16 cache roots');
  const roots = inventoryRoots(options.roots), startedAt = new Date().toISOString();
  const walked = await walkCache(roots, maxEntries, options.signal);
  const entries = walked.objects.sort((a, b) => join(a.root, a.path).localeCompare(join(b.root, b.path), 'en'));
  for (const [index, entry] of entries.entries()) {
    options.signal?.throwIfAborted();
    await inspectCacheObject(entry, options.verify ?? false, maxBytes, options.signal);
    options.onProgress?.(index + 1, entries.length);
  }
  const danglingHeads = linkInventory(entries);
  const { repositoryByProfile, byteGroups } = groupIdentities(entries);
  return { schemaVersion: 1, kind: 'cache-usage', startedAt, completedAt: new Date().toISOString(), roots,
    missingRoots: walked.missingRoots, complete: !walked.limited && !walked.issues.length && !entries.some(e => ['changed', 'limited', 'unreadable'].includes(e.inspection)),
    maxEntries, maxInspectionBytesPerFile: maxBytes, truncated: walked.limited, verifyRequested: options.verify ?? false,
    totals: total(entries), byClass: group(entries, entry => entry.category),
    byProfile: group(entries, entry => join(entry.root, entry.profile)),
    byRepository: group(entries, entry => {
      const names = repositoryByProfile.get(join(entry.root, entry.profile));
      return names?.size === 1 ? [...names][0]! : names?.size ? '[ambiguous-profile]' : '[unattributed]';
    }), objects: entries, issues: walked.issues, danglingHeads,
    byteIdenticalGroups: [...byteGroups.values()].filter(paths => paths.length > 1),
    limitations: ['Read-only observation, not an atomic census, retention plan or deletion authorization. Concurrent mutation can require a new scan.',
      'Layout recognition is not ownership proof. Head references are not active-scope registrations or permanent pins.',
      'Pins, archive destinations and active-scope registrations have no supported R2 format; their status is not evaluated. Unknown objects remain protected.',
      'Lease markers report possible activity; PID/age does not prove that an operation is active or abandoned.',
      'Metadata-only snapshots are not integrity-checked. --verify parses complete JSON and hashes bytes, but does not verify SHACL, semantic reuse or the producer content digest.',
      'Unique logical/allocation totals deduplicate observed device/inode identities, not reflinks, filesystem compression or shared extents. Windows allocation is unavailable.',
      'Shared artifacts without a known profile/repository binding remain unattributed; group totals do not invent ownership.',
      'Temporary output is counted as observed. Future peak build requirements and budget reservations are not estimated or enforced.'] };
}

function groupIdentities(entries: CacheObject[]) {
  const repositoryByProfile = new Map<string, Set<string>>();
  for (const entry of entries) if (entry.metadata?.repositoryId) {
    const key = join(entry.root, entry.profile), set = repositoryByProfile.get(key) ?? new Set<string>();
    set.add(entry.metadata.repositoryId); repositoryByProfile.set(key, set);
  }
  const byteGroups = new Map<string, string[]>();
  for (const entry of entries) if (entry.sha256) {
    const key = `${entry.logicalBytes}:${entry.sha256}`, paths = byteGroups.get(key) ?? [];
    paths.push(join(entry.root, entry.path)); byteGroups.set(key, paths);
  }
  return { repositoryByProfile, byteGroups };
}
