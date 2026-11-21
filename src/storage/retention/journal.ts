import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { safeTransferPath, transferDirectory } from '../transfer-files.js';
import type { PreparedRetentionPlan } from './prepared.js';

export function removalJournal(plan: PreparedRetentionPlan, verify: () => Promise<void>) {
  return openRemovalJournal(plan, plan.objects.filter(o => o.disposition === 'candidate'), verify);
}

/** Durable intent precedes every unlink. Incomplete journal state remains a visible blocker. */
export interface JournalCandidate {
  path: string; sha256: string | null; logicalBytes: number;
  replacement?: { snapshotPath: string; snapshotSha256: string };
}

export async function openRemovalJournal(plan: Pick<PreparedRetentionPlan, 'root' | 'rootId' | 'planId' | 'policyDigest'>, candidates: readonly JournalCandidate[], verify: () => Promise<void>) {
  const directory = join(plan.root, '.weftlet-coordination/removals');
  await verify(); await transferDirectory(directory);
  const operationId = randomUUID(), path = join(directory, `${operationId}.jsonl`), pending = join(directory, `${operationId}.pending`);
  const schemaVersion = candidates.some(c => c.replacement) ? 2 : 1;
  const markerBytes = JSON.stringify({ schemaVersion, operationId, planId: plan.planId });
  let identity: Awaited<ReturnType<typeof lstat>>;
  const createPending = async () => {
    const marker = await open(pending, 'wx', 0o600);
    try { await marker.writeFile(markerBytes); await marker.sync(); identity = await marker.stat(); }
    finally { await marker.close(); }
  };
  if (schemaVersion === 1) await createPending();
  const handle = await open(path, 'wx', 0o600);
  let recorded = await handle.stat({ bigint: true });
  const append = async (event: unknown) => {
    await verify(); await safeTransferPath(path);
    const named = await lstat(path, { bigint: true });
    if (named.dev !== recorded.dev || named.ino !== recorded.ino || named.size !== recorded.size ||
      named.mtimeNs !== recorded.mtimeNs || named.ctimeNs !== recorded.ctimeNs) throw Error('Removal journal changed');
    await handle.writeFile(JSON.stringify(event) + '\n'); await handle.sync();
    recorded = await handle.stat({ bigint: true });
    const after = await lstat(path, { bigint: true });
    if (after.dev !== recorded.dev || after.ino !== recorded.ino || after.size !== recorded.size || recorded.nlink !== 1n) throw Error('Removal journal changed');
  };
  try {
    await append({ schemaVersion, event: 'started', operationId, planId: plan.planId, rootId: plan.rootId,
      policyDigest: plan.policyDigest, startedAt: new Date().toISOString(),
      candidates: candidates.map(o => ({ path: o.path, sha256: o.sha256, logicalBytes: o.logicalBytes, ...(o.replacement ? { replacement: o.replacement } : {}) })) });
    if (schemaVersion === 2) await createPending();
  } catch (error) { await handle.close(); throw error; }
  return { path, operationId, append, close: () => handle.close(), async finish(result: unknown) {
    await append({ event: 'finished', result, completedAt: new Date().toISOString() });
    await verify(); await safeTransferPath(pending);
    const named = await lstat(pending);
    if (named.ino !== identity.ino || named.dev !== identity.dev || await readFile(pending, 'utf8') !== markerBytes) throw Error('Removal journal ownership changed');
    await unlink(pending);
  } };
}
