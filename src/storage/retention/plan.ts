import { resolve } from 'node:path';
import { persistedJsonDigest } from '@weftlet/core';
import { inventoryCache } from '../inspection/inventory.js';
import { retentionDecision } from './decisions.js';
import { parseRetentionPolicy, type RetentionPolicy } from './policy.js';
import { resolveRetentionReferences } from './references.js';

export interface RetentionPlanOptions {
  root: string; policy: RetentionPolicy; maxEntries?: number; maxBytes?: number; now?: Date;
  signal?: AbortSignal; onProgress?: (done: number, total: number) => void;
}
export async function planRetention(options: RetentionPlanOptions) {
  const policy = parseRetentionPolicy(options.policy), now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw Error('Invalid retention evaluation time');
  const root = resolve(options.root);
  const inventory = await inventoryCache({ roots: [root], verify: true, maxEntries: options.maxEntries,
    maxBytes: options.maxBytes, signal: options.signal, onProgress: options.onProgress });
  const references = resolveRetentionReferences(policy, inventory.objects, now.getTime());
  const issues = [...references.issues, ...inventory.issues.map(i => ({ code: i.code, path: i.path }))];
  if (!inventory.complete || inventory.missingRoots.length) issues.push({ code: 'incomplete-inventory', path: '.' });
  for (const entry of inventory.objects) {
    if (entry.inspection === 'invalid') issues.push({ code: 'invalid-cache-object', path: entry.path });
    if (entry.category === 'lease-marker' || entry.path.endsWith('.lock')) issues.push({ code: 'activity-requires-coordination', path: entry.path });
    if (entry.category === 'snapshot' && references.profiles.has(entry.profile) && entry.metadata?.repositoryId !== references.profiles.get(entry.profile)!.repositoryId) {
      issues.push({ code: 'profile-repository-mismatch', path: entry.path });
    }
  }
  for (const head of inventory.danglingHeads) issues.push({ code: 'dangling-head', path: head });
  const objects = inventory.objects.map(entry => retentionDecision(entry, references));
  const candidates = objects.filter(entry => entry.disposition === 'candidate');
  const body = { schemaVersion: 1, kind: 'retention-review-plan', plannerVersion: 'declared-retention-v1', root,
    limits: { maxEntries: inventory.maxEntries, maxBytes: inventory.maxInspectionBytesPerFile },
    policyDigest: persistedJsonDigest(policy), policy, inventoryDigest: persistedJsonDigest(inventory.objects),
    readyForReview: issues.length === 0, canApply: false,
    issues: issues.sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en')),
    pins: references.pins, totals: { observedLogicalBytes: inventory.totals.logicalBytes,
      observedUniqueLogicalBytes: inventory.totals.uniqueLogicalBytes,
      candidateLogicalBytes: candidates.reduce((n, c) => n + c.logicalBytes, 0), candidateFiles: candidates.length,
      retainedLogicalBytes: objects.filter(o => o.disposition === 'retain').reduce((n, o) => n + o.logicalBytes, 0) },
    objects, limitations: [
      'Review only. No deletion/apply command; coordinated read/write/GC leases and execution-time checks remain R3b.',
      'The policy declares ownership/protection intent, not product authority. Legacy heads remain protected until explicitly released at their exact target ID.',
      'Current/previous/pin protection follows explicit declarations. Previous-generation tracking is manual until coordinated head publication exists.',
      'Semantic artifacts, indexes, receipts, unknown data and temporary work remain retained; this increment proposes only unshared snapshots and explicitly released heads.',
      'Reclaim totals are logical bytes, not guaranteed free-disk recovery. Builds, shared extents, external citations and unregistered readers are not inferred.',
      'Full JSON/hash inspection does not rerun SHACL or prove semantic reuse. Inventory is observational; this plan cannot authorize concurrent deletion.',
    ] };
  return { ...body, evaluatedAt: now.toISOString(), planId: persistedJsonDigest(body) };
}
export type RetentionPlan = Awaited<ReturnType<typeof planRetention>>;

/** A saved report is not an authorization token; check its decision payload before comparing current inputs; evaluation time is informational. */
export async function checkRetentionPlan(saved: unknown, options: RetentionPlanOptions) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw Error('Expected saved retention plan');
  const { evaluatedAt: _time, planId, ...body } = saved as Record<string, unknown>;
  if (body.schemaVersion !== 1 || body.kind !== 'retention-review-plan' || typeof planId !== 'string' || persistedJsonDigest(body) !== planId) throw Error('Saved retention plan is malformed or has been edited');
  const current = await planRetention(options);
  return { schemaVersion: 1, kind: 'retention-plan-check', unchanged: current.planId === planId,
    previousPlanId: planId, currentPlanId: current.planId, readyForReview: current.readyForReview,
    canApply: false, issues: current.issues };
}
