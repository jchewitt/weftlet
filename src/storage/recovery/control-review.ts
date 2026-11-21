import { parseUniqueJson } from '../../infrastructure/unique-json.js';
import type { CacheObject } from '../inspection/layout.js';
import { controlFiles, controlName, barrierName, barrierBytes, uuid, readControl, ownerMayBeLive, type ControlFile } from './state.js';
import { inspectRecoveryReceipts, validClaim } from './receipts.js';
import { reconcileJournal, type JournalReconciliation } from './journals.js';
import { record, exactKeys, timestamp } from './format.js';

type Issue = { path: string; code: string };
interface Review { actions: string[]; journals: JournalReconciliation[]; interruptedClaims: string[]; issues: Issue[] }
function validOwner(value: unknown, gate: boolean): value is Record<string, unknown> {
  if (!record(value) || !exactKeys(value, ['schemaVersion', 'protocol', 'operationId', 'mode', 'pid', 'startedAt'])) return false;
  return value.schemaVersion === 1 && value.protocol === 'cache-coordination-v1' && (gate ? ['admission', 'maintenance'] : ['activity']).includes(String(value.mode)) &&
    typeof value.operationId === 'string' && uuid.test(value.operationId) && Number.isSafeInteger(value.pid) && Number(value.pid) > 0 && timestamp(value.startedAt);
}
async function reviewFile(root: string, rootId: string, path: string, value: unknown, resolved: Set<string>, evidence: CacheObject[], review: Review, maxBytes: number) {
  const tail = path.slice(`${controlName}/`.length), issue = (code: string) => review.issues.push({ path, code });
  if (tail === 'root.json' || path === barrierName) return;
  if (tail === 'gate.lock' || /^participants\/[a-f0-9-]{36}\.json$/.test(tail)) {
    if (!validOwner(value, tail === 'gate.lock')) issue('unknown-owner-marker');
    else if (ownerMayBeLive(Number(value.pid))) issue('owner-may-still-be-live');
    else review.actions.push(path);
  } else if (/^removals\/[a-f0-9-]{36}\.pending$/.test(tail)) {
    try { review.journals.push(await reconcileJournal(root, path, rootId, evidence, maxBytes)); review.actions.push(path); }
    catch { issue('journal-reconciliation-required'); }
  } else if (/^recovery\/[a-f0-9]{64}\.claim\.json$/.test(tail)) {
    if (!validClaim(value, rootId, tail.slice('recovery/'.length, -'.claim.json'.length))) issue('invalid-recovery-claim');
    else if (!resolved.has(String(value.planId))) {
      review.interruptedClaims.push(String(value.planId));
      if (ownerMayBeLive(Number(value.pid))) issue('recovery-owner-may-still-be-live');
    }
  } else if (!/^removals\/[a-f0-9-]{36}\.jsonl$/.test(tail) && !/^recovery\/[a-f0-9]{64}\.(?:start|done)\.json$/.test(tail)) issue('unknown-control-object');
}
export async function reviewControls(root: string, rootId: string, evidence: CacheObject[], exclusions: { files?: string[]; directories?: string[] }, maxBytes: number) {
  const listing = await controlFiles(root), controls: ControlFile[] = [], values = new Map<string, unknown>();
  const review: Review = { actions: [], journals: [], interruptedClaims: [], issues: [] };
  for (const path of listing.paths.filter(p => !exclusions.files?.includes(p))) {
    const input = await readControl(root, path); controls.push(input.file);
    if (path === barrierName) {
      if (input.bytes.toString('utf8') !== barrierBytes) review.issues.push({ path, code: 'unknown-recovery-barrier' });
    } else if (!path.endsWith('.jsonl')) {
      try { values.set(path, parseUniqueJson(input.bytes.toString('utf8'))); }
      catch { review.issues.push({ path, code: 'invalid-control-record' }); }
    }
  }
  const receipts = inspectRecoveryReceipts(values, root, rootId); review.issues.push(...receipts.issues);
  for (const { path } of controls) await reviewFile(root, rootId, path, values.get(path), receipts.resolved, evidence, review, maxBytes);
  for (const dir of listing.directories) if (![controlName, `${controlName}/participants`, `${controlName}/removals`, `${controlName}/recovery`].includes(dir.path)) review.issues.push({ path: dir.path, code: 'unknown-control-directory' });
  if (controls.filter(f => review.actions.includes(f.path)).reduce((n, f) => n + f.bytes, 0) > 8 * 1024 ** 2) review.issues.push({ path: controlName, code: 'marker-archive-exceeds-limit' });
  return { ...review, controls, directories: listing.directories.filter(d => !exclusions.directories?.includes(d.path)) };
}
