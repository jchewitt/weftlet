import { witnessRemoval, type SharedEntry } from './shared-index-witness.js';
import { persistedJsonDigest } from '@weftlet/core';
import { lstat, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { inspectFileDigest } from '../inspection/read.js';
import { safeTransferPath } from '../transfer-files.js';
import type { PreparedRetentionOptions, PreparedRetentionPlan } from './prepared.js';
import type { CacheMaintenanceScope } from '../coordination/access.js';
import { openRemovalJournal, type JournalCandidate } from './journal.js';

type RemovalObject = JournalCandidate & Pick<PreparedRetentionPlan['objects'][number], 'path' | 'category' | 'sha256' | 'revision' | 'logicalBytes' | 'removeBefore'>;
type RemovalAuthority = Pick<PreparedRetentionPlan, 'root' | 'rootId' | 'planId' | 'policyDigest' | 'limits'>;
async function verifyCandidate(root: string, entry: RemovalObject, maxBytes: number, signal?: AbortSignal) {
  const path = join(root, entry.path), local = relative(root, path);
  if (isAbsolute(entry.path) || !local || local === '..' || local.startsWith(`..${sep}`) ||
    entry.path.includes('\\') || !['head', 'snapshot', 'scip-index'].includes(entry.category) || !entry.sha256) throw Error('Unsafe removal candidate');
  await safeTransferPath(path);
  const revision = async () => {
    const s = await lstat(path, { bigint: true });
    if (!s.isFile() || s.nlink !== 1n) throw Error('Removal candidate is no longer an unshared ordinary file');
    return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs, s.nlink].join(':');
  };
  if (await revision() !== entry.revision) throw Error('Removal candidate changed');
  const result = await inspectFileDigest(path, maxBytes, signal);
  if (result.sha256 !== entry.sha256 || await revision() !== entry.revision) throw Error('Removal candidate bytes changed');
  return { path, async verifyRevision() {
    await safeTransferPath(path);
    if (await revision() !== entry.revision) throw Error('Removal candidate changed after intent');
  } };
}
async function verifyPolicy(current: RemovalAuthority, options: PreparedRetentionOptions) {
  if (persistedJsonDigest(await options.readPolicy?.() ?? options.policy) !== current.policyDigest) throw Error('Retention policy changed during removal');
}
/** Internal executor: caller must own exclusive maintenance and supply its freshly authorized canonical plan. */
export async function executeRetentionOwned(current: PreparedRetentionPlan, options: PreparedRetentionOptions, scope: CacheMaintenanceScope) {
  const selected = current.objects.filter(o => o.disposition === 'candidate');
  const indexes = selected.filter(o => o.category === 'scip-index');
  const companions = new Map(indexes.map(index => [index.removeBefore[0], index]));
  // Release heads first. Finish each snapshot and its companion together, with a durable intent per file.
  const candidates = selected.filter(o => o.category !== 'scip-index')
    .sort((a, b) => Number(a.category !== 'head') - Number(b.category !== 'head') || a.path.localeCompare(b.path, 'en'))
    .flatMap(o => {
      const index = companions.get(o.path);
      return index && o.category === 'snapshot' ? [o, index] : [o];
    });
  if (candidates.length !== selected.length || (indexes.length && !current.policy.retireCompanionIndexes)) {
    throw Error('Invalid companion index selection');
  }
  return executeJournaledRemoval(current, candidates, options, scope, undefined, current.policy.retireCompanionIndexes);
}

/** The caller recomputes authorization under this exclusive scope. A migration verifies its replacement before unlink. */
export async function executeJournaledRemoval(current: RemovalAuthority, candidates: RemovalObject[], options: PreparedRetentionOptions,
  scope: CacheMaintenanceScope, installReplacement?: (entry: RemovalObject) => Promise<() => Promise<void>>, captureShared = false) {
  const root = current.root;
  options.signal?.throwIfAborted(); await scope.verify();
  await verifyPolicy(current, options);
  if (candidates.length === 0) return { schemaVersion: 1, kind: 'retention-removal-result', planId: current.planId,
    operationId: null, journalPath: null, status: 'complete' as const, deleted: [] as string[], deletedLogicalBytes: 0,
    candidateFiles: 0, remainingCandidates: 0 };
  const verifiedBlobs = new Map<string,SharedEntry>();
  const journal = await openRemovalJournal(current, candidates, scope.verify);
  const deleted: string[] = []; let deletedLogicalBytes = 0;
  let status: 'complete' | 'partial' = 'complete', failure: string | undefined;
  try {
    for (const entry of candidates) {
      options.signal?.throwIfAborted(); await scope.verify();
      if (entry.removeBefore.some(head => !deleted.includes(head))) throw Error('Removal prerequisite was not completed');
      const candidate = await verifyCandidate(root, entry, current.limits.maxBytes, options.signal);
      const verifyReplacement = await installReplacement?.(entry);
      const witness = captureShared && entry.category === 'snapshot'
        ? await witnessRemoval(root, current.rootId, journal.operationId, entry.path, entry.sha256!, current.limits.maxBytes,verifiedBlobs) : undefined;
      await journal.append({ event: 'unlink-intent', path: entry.path, sha256: entry.sha256, ...(witness ? {witness} : {}) });
      options.signal?.throwIfAborted(); await scope.verify();
      await verifyPolicy(current, options);
      await verifyReplacement?.();
      options.signal?.throwIfAborted(); await scope.verify();
      await candidate.verifyRevision();
      await unlink(candidate.path);
      deleted.push(entry.path); deletedLogicalBytes += entry.logicalBytes;
      await journal.append({ event: 'unlinked', path: entry.path });
    }
  } catch (error) {
    status = 'partial'; failure = options.signal?.aborted ? 'cancelled' : (error as NodeJS.ErrnoException).code ?? 'removal-stopped';
  }
  const result = { schemaVersion: 1, kind: 'retention-removal-result', planId: current.planId, operationId: journal.operationId,
    status, deleted, deletedLogicalBytes, candidateFiles: candidates.length, journalPath: journal.path,
    ...(failure ? { failure } : {}), remainingCandidates: candidates.length - deleted.length };
  try { await journal.finish(result); }
  catch (error) { throw new Error(`Removal journal finalization failed; outcome requires inspection at ${journal.path}`, { cause: error }); }
  finally { await journal.close(); }
  return result;
}
