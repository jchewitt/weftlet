import { relative } from 'node:path';
import { selectHistory } from './history-selection.js';
import type { inventoryCache } from '../inspection/inventory.js';
import type { RetentionPolicy } from './policy.js';
import { resolveRetentionReferences } from './references.js';
import { retentionDecision } from './decisions.js';

/** Shared decision rules for observational review and exclusively coordinated preparation. */
export function evaluateRetention(inventory: Awaited<ReturnType<typeof inventoryCache>>, policy: RetentionPolicy, now: number, reservedControlBytes = 0, idleScratch: ReadonlySet<string> = new Set()) {
  const references = resolveRetentionReferences(policy, inventory.objects, now);
  const issues = [...references.issues, ...inventory.issues.map(i => ({ code: i.code, path: i.path }))];
  if (!inventory.complete || inventory.missingRoots.length) issues.push({ code: 'incomplete-inventory', path: '.' });
  for (const entry of inventory.objects) {
    if (entry.inspection === 'invalid') issues.push({ code: 'invalid-cache-object', path: entry.path });
    if (entry.category === 'lease-marker' || (entry.path.toLowerCase().endsWith('.lock') && !idleScratch.has(entry.path))) issues.push({ code: 'activity-requires-coordination', path: entry.path });
    if (entry.category === 'snapshot' && references.profiles.has(entry.profile) && entry.metadata?.repositoryId !== references.profiles.get(entry.profile)!.repositoryId) {
      issues.push({ code: 'profile-repository-mismatch', path: entry.path });
    }
  }
  for (const head of inventory.danglingHeads) issues.push({ code: 'dangling-head', path: head });
  const decisions = inventory.objects.map(entry => {
    const decision = retentionDecision(entry, references);
    if (idleScratch.has(entry.path)) decision.reasons.unshift('verified-idle-gradle-scratch');
    return decision;
  });
  const selected = selectHistory(inventory.objects, decisions, policy, reservedControlBytes, references.completedHeads);
  const paths = new Set(references.completions.flatMap(c => c.snapshotPaths));
  const snapshotHeads = new Map<string, string[]>();
  if (paths.size) {
    for (const entry of inventory.objects) if (paths.has(entry.path)) {
      snapshotHeads.set(entry.path, entry.headReferences.map(h => relative(entry.root, h).replaceAll('\\', '/')));
    }
  }
  const byPath = new Map(references.completions.length ? selected.objects.map(o => [o.path, o] as const) : []);
  const completions = references.completions.map(({ snapshotPaths, ...record }) => {
    const decision = record.path ? byPath.get(record.path) : undefined;
    const snapshots = snapshotPaths.map(path => {
      const snapshot = byPath.get(path)!;
      const retainedHeads = snapshotHeads.get(path)!.filter(h => byPath.get(h)?.disposition === 'retain');
      return { path, logicalBytes: snapshot.logicalBytes, disposition: snapshot.disposition, reasons: snapshot.reasons, retainedHeads };
    });
    return { ...record, disposition: decision?.disposition ?? 'retain', logicalHeadBytes: decision?.logicalBytes ?? 0, snapshots };
  });
  return { issues, pins: references.pins, completions, ...selected };
}
