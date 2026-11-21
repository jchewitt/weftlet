import { persistedJsonDigest } from '@weftlet/core';
import { inventoryCache, type InventoryOptions } from '../inspection/inventory.js';
import { controlName, barrierName, recoveryRoot } from './state.js';
import { reviewControls } from './control-review.js';
import { record } from './format.js';

export interface RecoveryOptions extends Omit<InventoryOptions, 'roots' | 'verify'> { root: string }
interface InternalExclusions { files?: string[]; directories?: string[] }
/** Read-only plan. Quiescence is an operator obligation, not inferred from PID/age or this scan. */
export async function planRecovery(options: RecoveryOptions, exclusions: InternalExclusions = {}) {
  const scope = await recoveryRoot(options.root), { root, rootId } = scope;
  const inventory = await inventoryCache({ ...options, roots: [root], verify: true });
  const issues: { path: string; code: string }[] = [];
  if (!inventory.complete || inventory.missingRoots.length) issues.push({ path: '.', code: 'incomplete-inventory' });
  const evidence = inventory.objects.filter(o => o.path !== controlName && !o.path.startsWith(`${controlName}/`))
    .map(o => o.kind === 'directory' ? { ...o, revision: o.physicalIdentity ?? 'unknown', modifiedAt: '', allocatedBytes: null, linkCount: 0 } : o);
  for (const o of evidence) {
    if (o.inspection === 'invalid' || o.kind === 'link' || o.kind === 'other') issues.push({ path: o.path, code: 'unverified-evidence-object' });
    if (o.path.endsWith(`/${controlName}/root.json`)) issues.push({ path: o.path, code: 'nested-managed-root' });
  }
  for (const path of inventory.danglingHeads) issues.push({ path, code: 'dangling-head' });
  const review = await reviewControls(root, rootId, evidence, exclusions, inventory.maxInspectionBytesPerFile); issues.push(...review.issues);
  const { controls, actions, journals, interruptedClaims, directories } = review;
  await scope.verify();
  const body = { schemaVersion: 1, kind: 'cache-recovery-plan', recoveryVersion: 'offline-recovery-v1', root, rootId,
    limits: { maxEntries: inventory.maxEntries, maxBytes: inventory.maxInspectionBytesPerFile },
    evidenceStateDigest: persistedJsonDigest(evidence), evidenceFiles: evidence.filter(o => o.kind === 'file').length,
    controls, directories,
    actions: actions.sort(), journals, interruptedClaims: interruptedClaims.sort(),
    issues: issues.sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en')),
    canApply: issues.length === 0 && (actions.length > 0 || interruptedClaims.length > 0 || controls.some(o => o.path === barrierName)),
    limitations: ['Stop every cache client and recovery process before applying; PID absence is not proof of quiescence.',
      'Only reviewed control blockers are cleared. Graphs, indexes, artifacts, original journals and receipts are never removed or replayed.',
      'Malformed/incomplete journals, changed candidates, unknown control objects and dangling heads require separate investigation.',
      'Local cooperating filesystems only. Full JSON/hash inspection is not SHACL, runtime acceptance or power-loss qualification.'] };
  if (Buffer.byteLength(JSON.stringify(body)) > 16 * 1024 ** 2) throw Error('Recovery plan exceeds 16 MiB; no recovery attempted');
  return { ...body, planId: persistedJsonDigest(body) };
}
export type RecoveryPlan = Awaited<ReturnType<typeof planRecovery>>;
export function assertRecoveryPlan(saved: unknown, expected: string): asserts saved is RecoveryPlan {
  if (!record(saved)) throw Error('Expected recovery plan');
  const { planId, ...body } = saved;
  if (body.kind !== 'cache-recovery-plan' || body.schemaVersion !== 1 || body.recoveryVersion !== 'offline-recovery-v1' ||
      planId !== expected || persistedJsonDigest(body) !== planId) throw Error('Recovery plan is unsupported, edited or does not match --expect-plan');
}
