import { parseHistoryPolicy, type HistoryPolicy } from './history-policy.js';
import { inspectSmallJson } from '../inspection/read.js';

export interface ProfileDeclaration { path: string; repositoryId: string; owner: string; reason: string }
export interface ScopeDeclaration {
  profile: string; head: string; owner: string; reason: string; previousSnapshotId?: string;
  additionalOwners?: string[];
  completion?: { snapshotId: string; finishedOwners: string[] };
}
export interface ReleasedHead extends Pick<ScopeDeclaration, 'profile' | 'head' | 'owner' | 'reason'> { snapshotId: string }
export interface SnapshotPin { profile: string; snapshotId: string; owner: string; reason: string; expiresAt?: string }
export interface RetentionPolicy {
  schemaVersion: 1;
  history?: HistoryPolicy;
  retireCompanionIndexes?: boolean;
  historicalCompilerWorkspaces?: { profile: string; directory: string; rootId: string; physicalIdentity: string;
    owner: string; reason: string }[];
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
  if (typeof value !== 'string' || value.length > 1024 || value.toLowerCase().split('/').includes('.weftlet-coordination') || (value !== '.' && (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(value) || value.split('/').some(p => p === '.' || p === '..')))) throw Error('Retention profile must be a contained relative path');
}
function declaration(value: unknown, allowed: string[]): asserts value is Record<string, unknown> {
  if (!object(value)) throw Error('Expected retention declaration object');
  keys(value, allowed); text(value.owner, 200); text(value.reason);
}
export function parseRetentionPolicy(input: unknown): RetentionPolicy {
  if (!object(input) || input.schemaVersion !== 1) throw Error('Expected retention policy schemaVersion 1');
  keys(input, ['schemaVersion', 'profiles', 'activeScopes', 'releasedHeads', 'pins', 'history', 'retireCompanionIndexes', 'historicalCompilerWorkspaces']);
  if (input.retireCompanionIndexes !== undefined && typeof input.retireCompanionIndexes !== 'boolean') throw Error('retireCompanionIndexes must be boolean');
  for (const name of ['profiles', 'activeScopes', 'releasedHeads', 'pins']) {
    if (!Array.isArray(input[name]) || input[name].length > 5000) throw Error('Retention policy arrays must contain at most 5000 declarations');
  }
  const profiles = new Set<string>(), profileAliases = new Set<string>();
  for (const p of input.profiles as unknown[]) {
    declaration(p, ['path', 'repositoryId', 'owner', 'reason']); profile(p.path); text(p.repositoryId, 500);
    if (profileAliases.has(p.path.toLowerCase())) throw Error('Duplicate retention profile');
    profileAliases.add(p.path.toLowerCase()); profiles.add(p.path);
  }
  if (input.historicalCompilerWorkspaces !== undefined) validateWorkspaces(input.historicalCompilerWorkspaces, profiles);
  if (input.history !== undefined) parseHistoryPolicy(input.history, new Set((input.profiles as ProfileDeclaration[]).map(p => p.repositoryId)));
  const heads = new Set<string>(), pins = new Set<string>();
  for (const name of ['activeScopes', 'releasedHeads', 'pins'] as const) {
    for (const item of input[name] as unknown[]) validateReference(name, item, profiles, heads, pins);
  }
  return input as unknown as RetentionPolicy;
}
function validateWorkspaces(value: unknown, profiles: Set<string>) {
  if (!Array.isArray(value) || value.length > 5000) throw Error('Expected at most 5000 historical compiler workspaces');
  const names = new Set<string>();
  for (const item of value) {
    declaration(item, ['profile', 'directory', 'rootId', 'physicalIdentity', 'owner', 'reason']);
    profile(item.profile);
    if (!profiles.has(item.profile)) throw Error('Historical compiler workspace requires a declared profile');
    if (typeof item.directory !== 'string' || item.directory.length > 255 ||
        !/^ontology-[0-9a-f]{7,64}(?:-[A-Za-z0-9._-]+)?$/.test(item.directory)) throw Error('Expected an exact historical compiler directory name');
    if (/^ontology-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item.directory)) {
      throw Error('Use historical declarations only for commit-derived directories');
    }
    if (typeof item.rootId !== 'string' || !/^[a-f0-9-]{36}$/.test(item.rootId) ||
        typeof item.physicalIdentity !== 'string' || !/^\d+:\d+$/.test(item.physicalIdentity)) throw Error('Expected a managed root and physical directory identity');
    const name = item.profile + '/' + item.directory.toLowerCase();
    if (names.has(name)) throw Error('Duplicate historical compiler directory');
    names.add(name);
  }
}

function ownerList(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw Error('Expected 1–100 owner identifiers');
  for (const owner of value) text(owner, 200);
  if (new Set(value).size !== value.length) throw Error('Duplicate owner identifier');
  return value;
}

function validateCompletion(item: Record<string, unknown>) {
  const additional = item.additionalOwners === undefined ? [] : ownerList(item.additionalOwners);
  const owners = new Set([item.owner, ...additional]);
  if (owners.size > 100) throw Error('Expected at most 100 registered owners per scope');
  if (owners.size !== additional.length + 1) throw Error('Duplicate scope owner');
  if (item.completion === undefined) return;
  if (!object(item.completion)) throw Error('Invalid scope completion');
  keys(item.completion, ['snapshotId', 'finishedOwners']);
  storageId(item.completion.snapshotId);
  for (const owner of ownerList(item.completion.finishedOwners)) {
    if (!owners.has(owner)) throw Error('Completion requires a registered scope owner');
  }
}

function validateReference(name: 'activeScopes' | 'releasedHeads' | 'pins', item: unknown,
  profiles: Set<string>, heads: Set<string>, pins: Set<string>) {
  const fields = name === 'activeScopes' ? ['head', 'previousSnapshotId', 'additionalOwners', 'completion'] : name === 'releasedHeads' ? ['head', 'snapshotId'] : ['snapshotId', 'expiresAt'];
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
    if (name === 'activeScopes') validateCompletion(item);
    if (name === 'releasedHeads') storageId(item.snapshotId);
    if (item.previousSnapshotId !== undefined) storageId(item.previousSnapshotId);
  }
}
export async function readRetentionPolicy(path: string) { return parseRetentionPolicy(await inspectSmallJson(path, 2 * 1024 ** 2, true)); }
