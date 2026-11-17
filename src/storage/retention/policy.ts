import { inspectSmallJson } from '../inspection/read.js';

export interface ProfileDeclaration { path: string; repositoryId: string; owner: string; reason: string }
export interface ScopeDeclaration { profile: string; head: string; owner: string; reason: string; previousSnapshotId?: string }
export interface ReleasedHead extends Omit<ScopeDeclaration, 'previousSnapshotId'> { snapshotId: string }
export interface SnapshotPin { profile: string; snapshotId: string; owner: string; reason: string; expiresAt?: string }
export interface RetentionPolicy {
  schemaVersion: 1;
  profiles: ProfileDeclaration[];
  activeScopes: ScopeDeclaration[];
  releasedHeads: ReleasedHead[];
  pins: SnapshotPin[];
}
export const emptyRetentionPolicy = (): RetentionPolicy => ({ schemaVersion: 1, profiles: [], activeScopes: [], releasedHeads: [], pins: [] });
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw Error('Unknown retention policy field');
}
function text(value: unknown, maximum = 1000): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw Error('Retention declarations require bounded nonempty text');
}
function storageId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(value)) throw Error('Unsafe retention storage identifier');
}
function profile(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 1024 || (value !== '.' && (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(value) || value.split('/').some(p => p === '.' || p === '..')))) throw Error('Retention profile must be a contained relative path');
}
function declaration(value: unknown, allowed: string[]): asserts value is Record<string, unknown> {
  if (!object(value)) throw Error('Expected retention declaration object');
  keys(value, allowed); text(value.owner, 200); text(value.reason);
}
export function parseRetentionPolicy(input: unknown): RetentionPolicy {
  if (!object(input) || input.schemaVersion !== 1) throw Error('Expected retention policy schemaVersion 1');
  keys(input, ['schemaVersion', 'profiles', 'activeScopes', 'releasedHeads', 'pins']);
  for (const name of ['profiles', 'activeScopes', 'releasedHeads', 'pins']) {
    if (!Array.isArray(input[name]) || input[name].length > 5000) throw Error('Retention policy arrays must contain at most 5000 declarations');
  }
  const profiles = new Set<string>(), profileAliases = new Set<string>();
  for (const p of input.profiles as unknown[]) {
    declaration(p, ['path', 'repositoryId', 'owner', 'reason']); profile(p.path); text(p.repositoryId, 500);
    if (profileAliases.has(p.path.toLowerCase())) throw Error('Duplicate retention profile');
    profileAliases.add(p.path.toLowerCase()); profiles.add(p.path);
  }
  const heads = new Set<string>(), pins = new Set<string>();
  for (const name of ['activeScopes', 'releasedHeads', 'pins'] as const) {
    for (const item of input[name] as unknown[]) validateReference(name, item, profiles, heads, pins);
  }
  return input as unknown as RetentionPolicy;
}
function validateReference(name: 'activeScopes' | 'releasedHeads' | 'pins', item: unknown,
  profiles: Set<string>, heads: Set<string>, pins: Set<string>) {
  const fields = name === 'activeScopes' ? ['head', 'previousSnapshotId'] : name === 'releasedHeads' ? ['head', 'snapshotId'] : ['snapshotId', 'expiresAt'];
  declaration(item, ['profile', 'owner', 'reason', ...fields]); profile(item.profile);
  if (!profiles.has(item.profile)) throw Error('Retention reference uses an undeclared profile');
  if (name === 'pins') {
    storageId(item.snapshotId);
    const key = `${item.profile}:${item.snapshotId}`.toLowerCase();
    if (pins.has(key)) throw Error('Duplicate snapshot pin'); pins.add(key);
    if (item.expiresAt !== undefined && (typeof item.expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(item.expiresAt) || !Number.isFinite(Date.parse(item.expiresAt)) || new Date(item.expiresAt).toISOString() !== item.expiresAt)) throw Error('Pin expiry must be an exact UTC ISO timestamp');
  } else {
    storageId(item.head);
    const key = `${item.profile}:${item.head}`.toLowerCase();
    if (heads.has(key)) throw Error('A head must have one active or released declaration'); heads.add(key);
    if (name === 'releasedHeads') storageId(item.snapshotId);
    if (item.previousSnapshotId !== undefined) storageId(item.previousSnapshotId);
  }
}
export async function readRetentionPolicy(path: string) { return parseRetentionPolicy(await inspectSmallJson(path, 2 * 1024 ** 2, true)); }
