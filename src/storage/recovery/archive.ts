import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { persistedJsonDigest } from '@weftlet/core';
import type { RecoveryPlan } from './plan.js';
import { barrierName, barrierBytes, controlName, readControl } from './state.js';

export function recoveryResult(plan: RecoveryPlan) {
  const gate = `${controlName}/gate.lock`, prefix = `${controlName}/recovery/${plan.planId}`;
  return { schemaVersion: 1, kind: 'cache-recovery-result', rootId: plan.rootId, planId: plan.planId, status: 'complete',
    cleared: [...plan.actions.filter(p => p !== gate), ...plan.actions.filter(p => p === gate)], evidenceFilesRemoved: 0, replayedDeletions: 0,
    resolvedClaims: plan.interruptedClaims, journalReconciliations: plan.journals,
    receiptPath: join(plan.root, `${prefix}.start.json`), completedAt: new Date().toISOString(),
    next: 'Review reconciled outcomes and update confirmed retirement declarations; prepare a fresh retention plan before any removal.' };
}
/** Reserve inspection capacity for ALL attempt records before creating any of them. Not a graph-size quota. */
export function requireRecoveryCapacity(plan: RecoveryPlan, additions: { paths: string[]; directories: string[]; bytes: number }) {
  const existingBytes = plan.controls.reduce((n, c) => n + c.bytes, 0);
  const entries = plan.controls.length + plan.directories.length - 1 + additions.paths.length + additions.directories.length;
  if (existingBytes + additions.bytes > 64 * 1024 ** 2 || entries > 10_000) throw Error('Recovery bookkeeping would exceed control inventory capacity; no claim or barrier created');
}
export async function prepareRecoveryArchive(plan: RecoveryPlan) {
  const { root, rootId } = plan, directory = `${controlName}/recovery`, prefix = `${directory}/${plan.planId}`;
  const gatePath = `${controlName}/gate.lock`, ownedGate = !plan.controls.some(f => f.path === gatePath);
  const newBarrier = !plan.controls.some(f => f.path === barrierName), newDirectory = !plan.directories.some(d => d.path === directory);
  const originals: { path: string; sha256: string; base64: string }[] = [];
  for (const path of plan.actions) {
    const input = await readControl(root, path, 4096), expectedFile = plan.controls.find(f => f.path === path)!;
    if (persistedJsonDigest(input.file) !== persistedJsonDigest(expectedFile)) throw Error('Recovery marker changed before archival');
    originals.push({ path, sha256: input.file.sha256, base64: input.bytes.toString('base64') });
  }
  const startBytes = JSON.stringify({ schemaVersion: 1, kind: 'cache-recovery-start', rootId, planId: plan.planId,
    originalPlan: plan, originals, startedAt: new Date().toISOString() });
  if (Buffer.byteLength(startBytes) > 16 * 1024 ** 2) throw Error('Recovery archive exceeds 16 MiB; no claim or barrier created');
  const claimBytes = JSON.stringify({ schemaVersion: 1, kind: 'cache-recovery-claim', rootId, planId: plan.planId,
    pid: process.pid, startedAt: new Date().toISOString() });
  const gateBytes = JSON.stringify({ schemaVersion: 1, protocol: 'cache-coordination-v1', operationId: randomUUID(),
    mode: 'maintenance', pid: process.pid, startedAt: new Date().toISOString() });
  const paths = [`${prefix}.claim.json`, `${prefix}.start.json`, `${prefix}.done.json`, ...(newBarrier ? [barrierName] : []), ...(ownedGate ? [gatePath] : [])];
  // Completion timestamp can change, but its ISO encoding has the same length; reserve extra room as well.
  const bytes = [startBytes, claimBytes, JSON.stringify(recoveryResult(plan)), newBarrier ? barrierBytes : '', ownedGate ? gateBytes : '']
    .reduce((n, value) => n + Buffer.byteLength(value), 4096);
  requireRecoveryCapacity(plan, { paths, directories: newDirectory ? [directory] : [], bytes });
  return { directory, prefix, gatePath, ownedGate, newBarrier, newDirectory, startBytes, claimBytes, gateBytes };
}
