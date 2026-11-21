import { digest, controlName } from './state.js';
import { record, exactKeys, timestamp } from './format.js';
import { posix } from 'node:path';

interface Candidate { sha256: string; bytes: number; replacement?: { snapshotPath: string; snapshotSha256: string } }
export function removalCandidates(input: unknown, migration = false) {
  if (!Array.isArray(input) || input.length > 10_000) throw Error('Invalid journal candidates');
  const expected = new Map<string, Candidate>();
  for (const item of input) {
    if (!record(item) || !exactKeys(item, migration ? ['path', 'sha256', 'logicalBytes', 'replacement'] : ['path', 'sha256', 'logicalBytes']) || !candidatePath(item.path) ||
        typeof item.sha256 !== 'string' || !digest.test(item.sha256) || !Number.isSafeInteger(item.logicalBytes) || Number(item.logicalBytes) < 0 || expected.has(item.path)) throw Error('Invalid journal candidate');
    const candidate: Candidate = { sha256: item.sha256, bytes: Number(item.logicalBytes) };
    if (migration) candidate.replacement = migrationReplacement(item.replacement, item.path);
    expected.set(item.path, candidate);
  }
  return expected;
}
function migrationReplacement(r: unknown, path: string) {
  if (!record(r) || !exactKeys(r, ['snapshotPath', 'snapshotSha256']) || !candidatePath(r.snapshotPath) ||
      !r.snapshotPath.endsWith('.json') || !path.endsWith('.scip') || typeof r.snapshotSha256 !== 'string' ||
      !digest.test(r.snapshotSha256)) throw Error('Invalid replacement record');
  return { snapshotPath: r.snapshotPath, snapshotSha256: r.snapshotSha256 };
}
function candidatePath(path: unknown): path is string {
  return typeof path === 'string' && path === posix.normalize(path) && !path.startsWith('../') && !path.startsWith('/') &&
    !path.split('/').some(part => part.toLowerCase() === controlName) &&
    /^(?:[A-Za-z0-9._-]+\/)*(?:(?:heads|snapshots)\/(?:[A-Za-z0-9][A-Za-z0-9._-]{0,255}|~[a-f0-9]{64})\.json|scip\/(?:[A-Za-z0-9][A-Za-z0-9._-]{0,255}|~[a-f0-9]{64})\.scip)$/.test(path);
}
interface JournalIdentity { operationId: string; planId: string; journalPath: string }
function terminalHeader(result: unknown, identity: JournalIdentity): asserts result is Record<string, unknown> {
  if (!record(result)) throw Error('Invalid terminal removal result');
  const fields = ['schemaVersion', 'kind', 'planId', 'operationId', 'status', 'deleted', 'deletedLogicalBytes', 'candidateFiles', 'journalPath', 'remainingCandidates'];
  if (result.status === 'partial') fields.push('failure');
  if (!exactKeys(result, fields) || result.schemaVersion !== 1 || result.kind !== 'retention-removal-result' ||
      result.planId !== identity.planId || result.operationId !== identity.operationId || result.journalPath !== identity.journalPath ||
      !['complete', 'partial'].includes(String(result.status)) || (result.status === 'partial' && typeof result.failure !== 'string')) throw Error('Invalid terminal removal result');
}
function terminalDeletions(result: Record<string, unknown>, expected: Map<string, Candidate>, intents: Set<string>, removed: Set<string>) {
  const deleted = result.deleted;
  if (!Array.isArray(deleted) || new Set(deleted).size !== deleted.length || deleted.some(p => typeof p !== 'string' || !intents.has(p)) ||
      [...removed].some(p => !deleted.includes(p)) || result.candidateFiles !== expected.size || result.remainingCandidates !== expected.size - deleted.length ||
      result.deletedLogicalBytes !== deleted.reduce((sum: number, p) => sum + expected.get(String(p))!.bytes, 0) ||
      (result.status === 'complete' && deleted.length !== expected.size)) throw Error('Contradictory terminal removal result');
  for (const path of deleted) removed.add(String(path));
}
/** Terminal deleted includes an unlink whose per-file completion append failed. */
export function removalEvents(events: unknown[], expected: Map<string, Candidate>, identity: JournalIdentity) {
  const intents = new Set<string>(), removed = new Set<string>(); let finished = false;
  for (const event of events) {
    if (!record(event) || finished) throw Error('Invalid journal event sequence');
    if (event.event === 'finished') {
      if (!exactKeys(event, ['event', 'result', 'completedAt']) || !timestamp(event.completedAt)) throw Error('Invalid terminal event');
      terminalHeader(event.result, identity); terminalDeletions(event.result, expected, intents, removed); finished = true; continue;
    }
    if (typeof event.path !== 'string' || !expected.has(event.path)) throw Error('Unknown journal target');
    if (event.event === 'unlink-intent') {
      if (!exactKeys(event, ['event', 'path', 'sha256']) || event.sha256 !== expected.get(event.path)!.sha256 || intents.has(event.path)) throw Error('Invalid unlink intent');
      intents.add(event.path);
    } else if (event.event === 'unlinked' && exactKeys(event, ['event', 'path']) && intents.has(event.path) && !removed.has(event.path)) removed.add(event.path);
    else throw Error('Invalid journal event');
  }
  return { intents, removed };
}
