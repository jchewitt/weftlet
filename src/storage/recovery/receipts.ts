import { persistedJsonDigest, sha256 } from '@weftlet/core';
import { join } from 'node:path';
import { controlName, digest } from './state.js';
import { record, exactKeys, timestamp } from './format.js';

export function validClaim(value: unknown, rootId: string, id: string): value is Record<string, unknown> {
  return record(value) && exactKeys(value, ['schemaVersion', 'kind', 'rootId', 'planId', 'pid', 'startedAt']) &&
    value.schemaVersion === 1 && value.kind === 'cache-recovery-claim' && value.rootId === rootId && value.planId === id &&
    digest.test(id) && Number.isSafeInteger(value.pid) && Number(value.pid) > 0 && timestamp(value.startedAt);
}
function validStart(value: unknown, rootId: string, id: string): value is Record<string, unknown> {
  return record(value) && exactKeys(value, ['schemaVersion', 'kind', 'rootId', 'planId', 'originalPlan', 'originals', 'startedAt']) &&
    value.schemaVersion === 1 && value.kind === 'cache-recovery-start' && value.rootId === rootId && value.planId === id && timestamp(value.startedAt);
}
function archivedPlan(value: unknown, root: string, rootId: string, id: string) {
  if (!record(value)) return;
  const { planId, ...body } = value;
  if (planId !== id || persistedJsonDigest(body) !== id || body.kind !== 'cache-recovery-plan' || body.schemaVersion !== 1 ||
      body.recoveryVersion !== 'offline-recovery-v1' || body.root !== root || body.rootId !== rootId || body.canApply !== true ||
      !Array.isArray(body.actions) || !Array.isArray(body.controls) || !Array.isArray(body.journals) || !Array.isArray(body.interruptedClaims)) return;
  return body as typeof body & { actions: string[]; controls: unknown[]; journals: unknown[]; interruptedClaims: string[] };
}
function validOriginal(original: unknown, path: string, controls: unknown[]) {
  if (!record(original) || !exactKeys(original, ['path', 'sha256', 'base64']) || original.path !== path ||
      typeof original.base64 !== 'string' || typeof original.sha256 !== 'string' || !digest.test(original.sha256)) return false;
  const bytes = Buffer.from(original.base64, 'base64');
  if (bytes.length > 4096 || bytes.toString('base64') !== original.base64 || sha256(bytes) !== original.sha256) return false;
  const source = controls.find(c => record(c) && c.path === path);
  return record(source) && source.sha256 === original.sha256 && source.bytes === bytes.length;
}
function startPlan(value: unknown, root: string, rootId: string, id: string) {
  if (!validStart(value, rootId, id)) return;
  const body = archivedPlan(value.originalPlan, root, rootId, id);
  if (!body || !Array.isArray(value.originals) || value.originals.length !== body.actions.length || body.actions.length > 10_000) return;
  if (!value.originals.every((original, index) => validOriginal(original, body.actions[index]!, body.controls))) return;
  return body;
}
function validResult(value: unknown, rootId: string, id: string): value is Record<string, unknown> {
  return record(value) && exactKeys(value, ['schemaVersion', 'kind', 'rootId', 'planId', 'status', 'cleared', 'evidenceFilesRemoved', 'replayedDeletions', 'resolvedClaims', 'journalReconciliations', 'receiptPath', 'completedAt', 'next']) &&
    value.schemaVersion === 1 && value.kind === 'cache-recovery-result' && value.status === 'complete' && value.rootId === rootId && value.planId === id &&
    value.evidenceFilesRemoved === 0 && value.replayedDeletions === 0 && timestamp(value.completedAt) && typeof value.next === 'string';
}
function resultMatchesPlan(value: Record<string, unknown>, plan: NonNullable<ReturnType<typeof startPlan>>, root: string, prefix: string) {
  return value.receiptPath === join(root, `${prefix}.start.json`) && Array.isArray(value.resolvedClaims) &&
    value.resolvedClaims.every(v => typeof v === 'string' && digest.test(v)) &&
    persistedJsonDigest(value.resolvedClaims) === persistedJsonDigest(plan.interruptedClaims) &&
    persistedJsonDigest(value.journalReconciliations) === persistedJsonDigest(plan.journals) && Array.isArray(value.cleared) &&
    persistedJsonDigest([...value.cleared].sort()) === persistedJsonDigest([...plan.actions].sort());
}
/** A completed receipt cannot suppress a live-owner veto unless its entire archived attempt agrees. */
export function inspectRecoveryReceipts(values: Map<string, unknown>, root: string, rootId: string) {
  const resolved = new Set<string>(), issues: { path: string; code: string }[] = [];
  for (const [path, value] of values) {
    const match = /^\.weftlet-coordination\/recovery\/([a-f0-9]{64})\.(start|done)\.json$/.exec(path);
    if (!match) continue;
    const id = match[1]!, prefix = `${controlName}/recovery/${id}`, claim = values.get(`${prefix}.claim.json`);
    const plan = startPlan(values.get(`${prefix}.start.json`), root, rootId, id);
    if (!validClaim(claim, rootId, id) || !plan) { issues.push({ path, code: 'invalid-recovery-receipt' }); continue; }
    if (match[2] === 'start') continue;
    if (!validResult(value, rootId, id) || !resultMatchesPlan(value, plan, root, prefix)) {
      issues.push({ path, code: 'invalid-recovery-result' }); continue;
    }
    resolved.add(id); for (const old of plan.interruptedClaims) resolved.add(old);
  }
  return { resolved, issues };
}
