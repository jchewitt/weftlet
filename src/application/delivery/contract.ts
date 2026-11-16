import { sha256, stableJsonDigest, type SnapshotManifest } from '@weftlet/core';

export const defaultTransferBytes = 2 * 1024 ** 3;
export const manifestByteLimit = 1024 ** 2;
export interface TransferFile {
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly semanticKey?: string;
}
export interface SnapshotBundle {
  readonly format: 'weftlet-snapshot-bundle';
  readonly version: 1;
  readonly createdAt: string;
  readonly exportingToolkitVersion: string;
  readonly snapshot: SnapshotManifest;
  /** Canonical persisted JSON, distinct from the producer's pre-persistence content digest. */
  readonly persistedGraphDigest: string;
  readonly files: readonly TransferFile[];
  readonly payloadBytes: number;
}
export const semanticFilename = (key: string) => `semantic-${sha256(key)}.json`;
export const validDigest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function transferLimit(value = defaultTransferBytes): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 16 * 1024 ** 3) throw Error('maxBytes must be an integer between 1 and 17179869184');
  return value;
}
export function assertBundle(value: unknown, maxBytes: number): asserts value is SnapshotBundle {
  const b = value as SnapshotBundle;
  if (!b || b.format !== 'weftlet-snapshot-bundle' || b.version !== 1 ||
      typeof b.exportingToolkitVersion !== 'string' || !b.exportingToolkitVersion ||
      !validDigest(b.persistedGraphDigest) || !b.snapshot || !Array.isArray(b.files) ||
      b.files.length < 1 || b.files.length > 513 || !Number.isSafeInteger(b.payloadBytes) ||
      b.payloadBytes < 1 || b.payloadBytes > maxBytes) throw Error('Invalid or oversized snapshot bundle manifest');
  const names = new Set<string>(), keys = new Set<string>();
  for (const [index, file] of b.files.entries()) {
    if (!file || !validDigest(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 ||
        (index === 0 ? file.name !== 'snapshot.json' || file.semanticKey !== undefined
          : typeof file.semanticKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(file.semanticKey) ||
            file.name !== semanticFilename(file.semanticKey) || keys.has(file.semanticKey)) || names.has(file.name)) {
      throw Error('Invalid, duplicate or unsafe bundle payload entry');
    }
    names.add(file.name);
    if (file.semanticKey) keys.add(file.semanticKey);
  }
  if (b.files.reduce((sum, file) => sum + file.bytes, 0) !== b.payloadBytes) throw Error('Bundle payload byte total does not match');
  if (b.files.length > 1 && stableJsonDigest([...keys].sort()) !== stableJsonDigest(b.snapshot.semanticArtifactKeys)) {
    throw Error('Bundled semantic keys do not match the snapshot');
  }
}
