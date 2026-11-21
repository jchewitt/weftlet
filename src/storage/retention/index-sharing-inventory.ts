import { inventoryLimits } from '../inspection/inventory.js';
import { inspectCacheObject, linkInventory } from '../inspection/metadata.js';
import { walkCache } from '../inspection/walk.js';
import type { RetentionPlanOptions } from './plan.js';

/** Enumerate the root for aliases but open graph, head and legacy index files only in declared profiles. */
export async function indexSharingInventory(root: string, options: RetentionPlanOptions) {
  const { maxEntries, maxBytes } = inventoryLimits(options);
  const profiles = new Set(options.policy.profiles.map(p => p.path));
  const { objects, issues, limited, missingRoots } = await walkCache([root], maxEntries, options.signal);
  if (objects.some(o => o.path.toLowerCase().endsWith('/.weftlet-coordination/root.json'))) {
    throw Error('Index sharing requires one coordinated cache owner without nested managed roots');
  }
  const contentDigests = new Map<string, string>();
  for (const [i, entry] of objects.entries()) {
    options.signal?.throwIfAborted();
    if (profiles.has(entry.profile) && ['head', 'snapshot', 'scip-index'].includes(entry.category)) {
      const digest = await inspectCacheObject(entry, true, maxBytes, options.signal);
      if (digest) contentDigests.set(entry.path, digest);
    }
    options.onProgress?.(i + 1, objects.length);
  }
  options.signal?.throwIfAborted();
  const danglingHeads = linkInventory(objects);
  const complete = !limited && !issues.length && !missingRoots.length &&
    !objects.some(o => ['limited', 'unreadable', 'changed'].includes(o.inspection));
  return { objects, issues, complete, danglingHeads, contentDigests, maxBytes };
}
