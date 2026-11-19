import { persistedJsonDigest } from '@weftlet/core';
import { lstat, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { inspectFileDigest } from '../inspection/read.js';
import { safeTransferPath } from '../transfer-files.js';
import { assertPreparedPlan, prepareRetentionOwned, withRetentionMaintenance, type PreparedRetentionOptions } from './prepared.js';
import { removalJournal } from './journal.js';

type RemovalObject = Awaited<ReturnType<typeof prepareRetentionOwned>>['objects'][number];
async function verifyCandidate(root: string, entry: RemovalObject, maxBytes: number, signal?: AbortSignal) {
  const path = join(root, entry.path), local = relative(root, path);
  if (isAbsolute(entry.path) || !local || local === '..' || local.startsWith(`..${sep}`) ||
    entry.path.includes('\\') || !['head', 'snapshot'].includes(entry.category) || !entry.sha256) throw Error('Unsafe removal candidate');
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
/** Never applies observational reports. Every decision is recomputed before the first destructive action. */
export async function applyRetention(saved: unknown, expected: string, options: PreparedRetentionOptions) {
  assertPreparedPlan(saved, expected);
  return withRetentionMaintenance({ ...options, maxEntries: saved.limits.maxEntries, maxBytes: saved.limits.maxBytes }, async (root, rootId, scope) => {
    const current = await prepareRetentionOwned({ ...options, maxEntries: saved.limits.maxEntries, maxBytes: saved.limits.maxBytes }, root, rootId);
    if (!current.canApply || current.planId !== saved.planId) throw Error('Prepared retention plan is stale or blocked; prepare and review a new plan');
    const candidates = current.objects.filter(o => o.disposition === 'candidate')
      .sort((a, b) => Number(a.category !== 'head') - Number(b.category !== 'head') || a.path.localeCompare(b.path, 'en'));
    options.signal?.throwIfAborted(); await scope.verify();
    if (candidates.length === 0) return { schemaVersion: 1, kind: 'retention-removal-result', planId: current.planId,
      operationId: null, journalPath: null, status: 'complete' as const, deleted: [] as string[], deletedLogicalBytes: 0,
      candidateFiles: 0, remainingCandidates: 0 };
    const journal = await removalJournal(current, scope.verify);
    const deleted: string[] = []; let deletedLogicalBytes = 0;
    let status: 'complete' | 'partial' = 'complete', failure: string | undefined;
    try {
      for (const entry of candidates) {
        options.signal?.throwIfAborted(); await scope.verify();
        if (entry.removeBefore.some(head => !deleted.includes(head))) throw Error('Head retirement prerequisite was not completed');
        const candidate = await verifyCandidate(root, entry, current.limits.maxBytes, options.signal);
        await journal.append({ event: 'unlink-intent', path: entry.path, sha256: entry.sha256 });
        options.signal?.throwIfAborted(); await scope.verify();
        if (persistedJsonDigest(await options.readPolicy?.() ?? options.policy) !== current.policyDigest) throw Error('Retention policy changed during removal');
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
  });
}
