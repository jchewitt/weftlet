import { join, posix } from 'node:path';
import { parseUniqueJson } from '../../infrastructure/unique-json.js';
import type { CacheObject } from '../inspection/layout.js';
import { controlName, digest, readControl, uuid } from './state.js';
import { inspectJson } from '../inspection/read.js';
import { physicalArtifactKey } from '../../infrastructure/artifact-paths.js';
import { previewScipBlob, previewScipReference, sharedScipRoot } from '../shared-scip.js';
import { record, exactKeys, timestamp } from './format.js';
import { removalCandidates, removalEvents } from './journal-events.js';

export interface JournalReconciliation { path: string; journal: string; candidates: { path: string; state: 'retained-matching' | 'absent'; recordedUnlink: boolean }[] }
async function readJournal(root: string, path: string, rootId: string) {
  const marker = parseUniqueJson((await readControl(root, path, 4096)).bytes.toString('utf8'));
  const operationId = path.slice(`${controlName}/removals/`.length, -'.pending'.length);
  if (!record(marker) || !exactKeys(marker, ['schemaVersion', 'operationId', 'planId']) || !uuid.test(operationId) || (marker.schemaVersion !== 1 && marker.schemaVersion !== 2) ||
      marker.operationId !== operationId || typeof marker.planId !== 'string' || !digest.test(marker.planId)) throw Error('Unsupported pending marker');
  const journal = `${controlName}/removals/${operationId}.jsonl`, bytes = (await readControl(root, journal)).bytes.toString('utf8');
  if (!bytes.endsWith('\n')) throw Error('Incomplete removal journal');
  const events = bytes.trimEnd().split('\n').map(parseUniqueJson), first = events.shift();
  validateStarted(first, operationId, marker.planId, rootId, marker.schemaVersion);
  return { journal, events, expected: removalCandidates(first.candidates, marker.schemaVersion === 2), identity: { operationId, planId: marker.planId, journalPath: join(root, journal) } };
}
export function validateStarted(first: unknown, operationId: string, planId: string, rootId: string, version: number): asserts first is Record<string, unknown> {
  if (!record(first) || !exactKeys(first, ['schemaVersion', 'event', 'operationId', 'planId', 'rootId', 'policyDigest', 'startedAt', 'candidates']) ||
      first.schemaVersion !== version || first.event !== 'started' || first.operationId !== operationId || first.planId !== planId || first.rootId !== rootId ||
      typeof first.policyDigest !== 'string' || !digest.test(first.policyDigest) || !timestamp(first.startedAt)) throw Error('Unsupported removal journal');
}
/** Reconcile complete supported logs; partial/missing/malformed logs remain visible blockers. Never replay. */
export async function reconcileJournal(root: string, path: string, rootId: string, objects: CacheObject[], maxBytes = 8 * 1024 ** 3): Promise<JournalReconciliation> {
  const { journal, events, expected, identity } = await readJournal(root, path, rootId);
  const { intents, removed } = removalEvents(events, expected, identity);
  const byPath = new Map(objects.map(o => [o.path, o]));
  const candidates: JournalReconciliation['candidates'] = [];
  const verifiedBlobs = new Set<string>();
  for (const [path, { sha256, replacement }] of expected) {
    const file = byPath.get(path);
    if (file && (file.kind !== 'file' || file.linkCount !== 1 || file.sha256 !== sha256)) throw Error('Journal candidate changed or cannot be verified');
    if (!file && !intents.has(path)) throw Error('Candidate absent without recorded unlink intent');
    if (file && removed.has(path)) throw Error('Recorded removed candidate is present');
    if (replacement) {
      const snapshot = byPath.get(replacement.snapshotPath);
      if (!snapshot || snapshot.sha256 !== replacement.snapshotSha256) throw Error('Replaced index lacks its verified graph');
      await verifyMigrationReference(root, path, snapshot, sha256, maxBytes, verifiedBlobs, intents.has(path));
    }
    candidates.push({ path, state: file ? 'retained-matching' : 'absent', recordedUnlink: removed.has(path) });
  }
  return { path, journal, candidates };
}


async function verifyMigrationReference(root: string, indexPath: string, snapshot: CacheObject, digest: string,
  maxBytes: number, verifiedBlobs: Set<string>, required: boolean) {
  const m = snapshot.metadata;
  if (snapshot.category !== 'snapshot' || snapshot.inspection !== 'json-complete' || snapshot.linkCount !== 1 ||
      !m?.repositoryId || !m.snapshotId || !m.commitSha || m.scipIndexDigest !== digest ||
      ![m.snapshotId, physicalArtifactKey(m.snapshotId)].some(k => posix.join(snapshot.profile, 'scip', k + '.scip') === indexPath)) {
    throw Error('Migration journal does not match the saved generation');
  }
  const profile = join(root, snapshot.profile);
  if (await sharedScipRoot(profile) !== root) throw Error('Migration replacement belongs to another root');
  const { manifest } = await inspectJson(join(root, snapshot.path), { snapshotEncoding: true, manifestOnly: true, maxBytes });
  if (typeof manifest?.contentDigest !== 'string') throw Error('Invalid migration generation');
  if (!(await previewScipReference(profile, { snapshotId: m.snapshotId,
    repositoryId: m.repositoryId, commitSha: m.commitSha, contentDigest: manifest.contentDigest, scipIndexDigest: digest })).exists) {
    if (required) throw Error('Missing verified migration reference');
    return;
  }
  if (!verifiedBlobs.has(digest)) {
    if (!await previewScipBlob(root, digest, maxBytes)) throw Error('Missing verified migration blob');
    verifiedBlobs.add(digest);
  }
}
