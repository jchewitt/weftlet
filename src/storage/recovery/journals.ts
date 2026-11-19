import { join } from 'node:path';
import { parseUniqueJson } from '../../infrastructure/unique-json.js';
import type { CacheObject } from '../inspection/layout.js';
import { controlName, digest, readControl, uuid } from './state.js';
import { record, exactKeys, timestamp } from './format.js';
import { removalCandidates, removalEvents } from './journal-events.js';

export interface JournalReconciliation { path: string; journal: string; candidates: { path: string; state: 'retained-matching' | 'absent'; recordedUnlink: boolean }[] }
async function readJournal(root: string, path: string, rootId: string) {
  const marker = parseUniqueJson((await readControl(root, path, 4096)).bytes.toString('utf8'));
  const operationId = path.slice(`${controlName}/removals/`.length, -'.pending'.length);
  if (!record(marker) || !exactKeys(marker, ['schemaVersion', 'operationId', 'planId']) || !uuid.test(operationId) || marker.schemaVersion !== 1 ||
      marker.operationId !== operationId || typeof marker.planId !== 'string' || !digest.test(marker.planId)) throw Error('Unsupported pending marker');
  const journal = `${controlName}/removals/${operationId}.jsonl`, bytes = (await readControl(root, journal)).bytes.toString('utf8');
  if (!bytes.endsWith('\n')) throw Error('Incomplete removal journal');
  const events = bytes.trimEnd().split('\n').map(parseUniqueJson), first = events.shift();
  validateStarted(first, operationId, marker.planId, rootId);
  return { journal, events, expected: removalCandidates(first.candidates), identity: { operationId, planId: marker.planId, journalPath: join(root, journal) } };
}
function validateStarted(first: unknown, operationId: string, planId: string, rootId: string): asserts first is Record<string, unknown> {
  if (!record(first) || !exactKeys(first, ['schemaVersion', 'event', 'operationId', 'planId', 'rootId', 'policyDigest', 'startedAt', 'candidates']) ||
      first.schemaVersion !== 1 || first.event !== 'started' || first.operationId !== operationId || first.planId !== planId || first.rootId !== rootId ||
      typeof first.policyDigest !== 'string' || !digest.test(first.policyDigest) || !timestamp(first.startedAt)) throw Error('Unsupported removal journal');
}
/** Reconcile complete supported logs; partial/missing/malformed logs remain visible blockers. Never replay. */
export async function reconcileJournal(root: string, path: string, rootId: string, objects: CacheObject[]): Promise<JournalReconciliation> {
  const { journal, events, expected, identity } = await readJournal(root, path, rootId);
  const { intents, removed } = removalEvents(events, expected, identity);
  const byPath = new Map(objects.map(o => [o.path, o]));
  const candidates: JournalReconciliation['candidates'] = [];
  for (const [path, { sha256 }] of expected) {
    const file = byPath.get(path);
    if (file && (file.kind !== 'file' || file.linkCount !== 1 || file.sha256 !== sha256)) throw Error('Journal candidate changed or cannot be verified');
    if (!file && !intents.has(path)) throw Error('Candidate absent without recorded unlink intent');
    if (file && removed.has(path)) throw Error('Recorded removed candidate is present');
    candidates.push({ path, state: file ? 'retained-matching' : 'absent', recordedUnlink: removed.has(path) });
  }
  return { path, journal, candidates };
}
