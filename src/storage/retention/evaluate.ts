import type { inventoryCache } from '../inspection/inventory.js';
import type { RetentionPolicy } from './policy.js';
import { resolveRetentionReferences } from './references.js';
import { retentionDecision } from './decisions.js';

/** Shared decision rules for observational review and exclusively coordinated preparation. */
export function evaluateRetention(inventory: Awaited<ReturnType<typeof inventoryCache>>, policy: RetentionPolicy, now: number) {
  const references = resolveRetentionReferences(policy, inventory.objects, now);
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
  return { issues, pins: references.pins, objects: inventory.objects.map(entry => retentionDecision(entry, references)) };
}
