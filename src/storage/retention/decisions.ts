import { relative } from 'node:path';
import type { CacheObject } from '../inspection/layout.js';
import { valid, type resolveRetentionReferences } from './references.js';

export type RetentionDecision = ReturnType<typeof retentionDecision>;

type References = ReturnType<typeof resolveRetentionReferences>;
export function retentionDecision(entry: CacheObject, references: References) {
  const base = { path: entry.path, category: entry.category, profile: entry.profile,
    logicalBytes: entry.logicalBytes, allocatedBytes: entry.allocatedBytes,
    sha256: entry.sha256 ?? null, revision: entry.revision };
  const retain = (reason: string, extra: string[] = []) => ({ ...base, disposition: 'retain' as const,
    reasons: [reason, ...extra], removeBefore: [] as string[], recovery: 'retained; no recovery action proposed' });
  if (entry.kind !== 'file') return retain(entry.kind === 'link' ? 'link-not-followed' : 'not-an-ordinary-file');
  if (entry.linkCount !== 1) return retain('shared-file-links');
  if (entry.activity !== 'unknown') return retain('operation-lease-marker');
  if (!references.profiles.has(entry.profile)) return retain('profile-not-managed');
  if (!valid(entry)) return retain('unverified-or-unsupported-object', [entry.inspection]);
  if (entry.category === 'head') {
    if (!references.releasedHeads.has(entry.path)) return retain(references.declaredHeads.has(entry.path) ? 'active-or-blocked-head' : 'legacy-head-needs-explicit-disposition');
    return { ...base, disposition: 'candidate' as const, reasons: ['explicitly-released-head'], removeBefore: [],
      recovery: 'restore this exact head identity from the reviewed policy/plan; snapshot retention is evaluated separately' };
  }
  if (entry.category !== 'snapshot') return retain('artifact-retention-not-enabled');
  if (!entry.sha256 || entry.metadata?.repositoryId !== references.profiles.get(entry.profile)!.repositoryId) return retain('snapshot-ownership-or-integrity-unconfirmed');
  const protectedReasons = references.protectedSnapshots.get(entry.path);
  if (protectedReasons) return retain('declared-snapshot-protection', protectedReasons);
  const heads = entry.headReferences.map(path => relative(entry.root, path).replaceAll('\\', '/'));
  if (heads.some(path => !references.releasedHeads.has(path))) return retain('retained-head-reference', heads);
  return { ...base, disposition: 'candidate' as const, reasons: ['managed-unpinned-superseded-snapshot'], removeBefore: heads.sort(),
    recovery: 'requires exact Git source/tools and validated semantic artifacts; exact reproduction and cache reuse are not established by this plan; no automatic model calls' };
}
