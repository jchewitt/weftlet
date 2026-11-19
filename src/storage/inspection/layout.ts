export type CacheClass = 'snapshot' | 'head' | 'semantic-artifact' | 'mapping-proposal' | 'scip-index' |
  'comparison-receipt' | 'lease-marker' | 'temporary' | 'unknown';
export function cacheLayout(path: string): { category: CacheClass; profile: string } {
  const patterns: [CacheClass, RegExp][] = [
    ['snapshot', /^(.*\/)?snapshots\/[^/]+\.json$/], ['head', /^(.*\/)?heads\/[^/]+\.json$/],
    ['semantic-artifact', /^(.*\/)?artifacts\/semantic\/[^/]+\.json$/],
    ['mapping-proposal', /^(.*\/)?artifacts\/mapping-proposals\/[^/]+\.json$/],
    ['scip-index', /^(.*\/)?scip\/[^/]+\.scip$/],
    ['comparison-receipt', /^(.*\/)?comparison-receipts\/[^/]+\.json$/],
    ['lease-marker', /^(.*\/)?work\/compare-[^/]+\/lease\.json$/],
    ['lease-marker', /^(.*\/)?\.weftlet-coordination\/(?:gate\.lock|participants\/[^/]+)$/],
    ['temporary', /^(.*\/)?work\/.*$/],
    ['temporary', /^(.*\/)?(?:snapshots|heads|scip|artifacts\/semantic)\/[^/]+\.(?:tmp|lock)$/],
  ];
  for (const [category, pattern] of patterns) {
    const match = pattern.exec(path);
    if (match) return { category, profile: (match[1] ?? '').replace(/\/$/, '') || '.' };
  }
  return { category: 'unknown', profile: '.' };
}
export interface CacheObject {
  root: string;
  path: string;
  category: CacheClass;
  profile: string;
  kind: 'file' | 'directory' | 'link' | 'other';
  logicalBytes: number;
  allocatedBytes: number | null;
  physicalIdentity?: string;
  modifiedAt: string;
  revision: string;
  linkCount: number;
  inspection: 'not-inspected' | 'metadata-only' | 'json-complete' | 'bytes-hashed' | 'invalid' | 'limited' | 'changed' | 'unreadable';
  metadata?: { scipIndexDigest?: string; repositoryId?: string; snapshotId?: string; previousSnapshotId?: string; commitSha?: string; configurationDigest?: string };
  sha256?: string;
  headReferences: string[];
  protection: string[];
  activity: 'unknown' | 'lease-marker-present-unverified';
  pinState: 'not-evaluated';
  archiveState: 'not-evaluated';
}
export const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export function snapshotMetadata(value: unknown) {
  if (!object(value) || !['schemaVersion', 'repositoryId', 'snapshotId', 'commitSha', 'contentDigest'].every(key => Object.hasOwn(value, key)) ||
      value.schemaVersion !== 1 || typeof value.snapshotId !== 'string' ||
      typeof value.repositoryId !== 'string' || typeof value.commitSha !== 'string' || typeof value.contentDigest !== 'string') return;
  return { repositoryId: value.repositoryId, snapshotId: value.snapshotId, commitSha: value.commitSha,
    ...(Object.hasOwn(value, 'scipIndexDigest') && typeof value.scipIndexDigest === 'string' && /^[a-f0-9]{64}$/.test(value.scipIndexDigest) ? { scipIndexDigest: value.scipIndexDigest } : {}),
    configurationDigest: typeof value.configurationDigest === 'string' ? value.configurationDigest : undefined };
}
