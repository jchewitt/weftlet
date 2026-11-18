/** One atomic record binds the current generation to its immediate predecessor. */
export interface SnapshotHead {
  readonly schemaVersion?: 1;
  readonly snapshotId: string;
  readonly previousSnapshotId?: string;
}

const identifier = (value: unknown): value is string => typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(value);

/** Legacy heads have no tracked predecessor; never reconstruct one from file ages. */
export function parseSnapshotHead(value: unknown): SnapshotHead {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid snapshot head');
  const head = value as Record<string, unknown>;
  if (!identifier(head.snapshotId) || (head.schemaVersion !== undefined && head.schemaVersion !== 1) ||
      (head.schemaVersion === 1 && Object.keys(head).some(key => !['schemaVersion', 'snapshotId', 'previousSnapshotId'].includes(key))) ||
      (head.previousSnapshotId !== undefined && (head.schemaVersion !== 1 ||
        !identifier(head.previousSnapshotId) || head.previousSnapshotId === head.snapshotId))) {
    throw Error('Invalid snapshot head generation record');
  }
  return { ...(head.schemaVersion === 1 ? { schemaVersion: 1 as const } : {}), snapshotId: head.snapshotId,
    ...(head.previousSnapshotId !== undefined ? { previousSnapshotId: head.previousSnapshotId as string } : {}) };
}
