import type { CacheObject } from '../inspection/layout.js';
import { isCoordinationObject } from './history-accounting.js';

interface MigrationMember { indexPath: string; snapshotPath: string }

/** Upper bounds for the removal log and one offline recovery's plan, archive and completion receipt. */
export function migrationFitsRecovery(root: string, objects: CacheObject[], members: MigrationMember[]) {
  if (!members.length) return true;
  const controls = objects.filter(o => isCoordinationObject(o.path));
  const existing = controls.reduce((sum, o) => sum + o.logicalBytes, 0);
  const encoded = (s: string) => Buffer.byteLength(JSON.stringify(s));
  // Header, intent, completion and terminal deletion list each name the legacy path.
  const log = members.reduce((sum, m) => sum + 4 * encoded(m.indexPath) + encoded(m.snapshotPath) + 640, 4096 + encoded(root));
  // Recovery inventories control revisions and reports every legacy path with its reconciled state.
  const controlMetadata = controls.reduce((sum, o) => sum + encoded(o.path) + encoded(o.revision) + 256, 0);
  const reconciliation = members.reduce((sum, m) => sum + encoded(m.indexPath) + 128, 0);
  const archive = 32 * 1024 + 4 * encoded(root) + controlMetadata + reconciliation;
  const mib = 1024 ** 2;
  return !controls.some(o => o.logicalBytes > 32 * mib) && controls.length + 10 <= 10_000 && log <= 32 * mib && archive <= 16 * mib &&
    existing + log + archive + reconciliation + 16 * 1024 <= 64 * mib;
}
