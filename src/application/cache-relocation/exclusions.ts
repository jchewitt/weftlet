import { posix } from 'node:path';
import type { CacheObject } from '../../storage/inspection/layout.js';

/** Report omitted classes and sizes without disclosing paths outside selected profiles. */
export function archiveExclusions(objects: readonly CacheObject[], files: ReadonlyMap<string, unknown>) {
  const omitted = new Map<string, { category: string; count: number; bytes: number }>();
  const selectedDirs = new Set<string>();
  for (const path of files.keys())
    for (let dir = posix.dirname(path); dir !== '.'; dir = posix.dirname(dir)) selectedDirs.add(dir);
  for (const o of objects) {
    if (files.has(o.path) || selectedDirs.has(o.path)) continue;
    const name = o.path.toLowerCase();
    const parts = name.split('/');
    let category: string = o.category;
    if (name.startsWith('.weftlet-coordination/') && name !== o.path) category = 'coordination-state';
    else if (name.startsWith('.weftlet-coordination/')) {
      if (
        o.kind === 'directory' ||
        [
          '.weftlet-coordination/gate.lock',
          '.weftlet-coordination/maintenance.json',
          '.weftlet-coordination/root.json',
        ].includes(name)
      )
        continue;
      if (
        /^\.weftlet-coordination\/(?:removals\/[a-f0-9-]+\.jsonl|recovery\/[a-f0-9]+\.(?:claim|start|done)\.json)$/.test(
          name,
        )
      )
        category = 'source-audit-history';
      else category = 'coordination-state';
    } else if (
      parts.includes('refs-v1') ||
      parts.includes('scip-blobs-v1') ||
      parts.includes('scip-retirements-v1') ||
      parts.includes('scip-retirement-staging-v1') ||
      parts.includes('compiler-operations-v1')
    ) {
      if (
        o.kind === 'directory' &&
        [
          'compiler-operations-v1',
          'refs-v1',
          'scip-blobs-v1',
          'scip-retirements-v1',
          'scip-retirement-staging-v1',
        ].includes(parts.at(-1)!)
      )
        continue;
      category = 'unreconciled-lifecycle';
    } else if (o.kind === 'directory') continue;
    const group = omitted.get(category) ?? { category, count: 0, bytes: 0 };
    group.count++;
    group.bytes += o.logicalBytes;
    omitted.set(category, group);
  }
  return [...omitted.values()].sort((a, b) => a.category.localeCompare(b.category, 'en'));
}
