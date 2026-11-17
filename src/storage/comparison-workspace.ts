import { randomUUID } from 'node:crypto';
import { link, lstat, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { safeTransferPath, transferDirectory } from './transfer-files.js';

/** No scavenging: each operation owns only its uniquely created directory. */
export async function createComparisonWorkspace(storageRoot: string) {
  const parent = join(storageRoot, 'work');
  await transferDirectory(parent);
  const root = await mkdtemp(join(parent, 'compare-'));
  const identity = await lstat(root);
  const operationId = randomUUID();
  const leasePath = join(root, 'lease.json');
  const leaseBytes = JSON.stringify({ schemaVersion: 1, operationId, pid: process.pid, startedAt: new Date().toISOString() });
  let lease;
  try { lease = await open(leasePath, 'wx', 0o600); await lease.writeFile(leaseBytes); }
  catch (error) { await lease?.close(); await rm(root, { recursive: true, force: true }); throw error; }
  return {
    root, operationId,
    async dispose() {
      await lease.close();
      await safeTransferPath(root, true);
      const named = await lstat(root);
      await safeTransferPath(leasePath);
      if (named.dev !== identity.dev || named.ino !== identity.ino || await readFile(leasePath, 'utf8') !== leaseBytes) {
        throw Error('Clean-comparison workspace ownership changed; refusing cleanup. Inspect the operation lease locally.');
      }
      // rm does not follow child symlinks. Never inspect/delete siblings or old workspaces.
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}

/** Compact receipts publish atomically, separately from graph/head storage. */
export async function writeComparisonReceipt(storageRoot: string, operationId: string, receipt: unknown) {
  if (!/^[a-f0-9-]{36}$/.test(operationId)) throw Error('Invalid comparison operation ID');
  const bytes = JSON.stringify(receipt, null, 2) + '\n';
  if (Buffer.byteLength(bytes) > 256 * 1024) throw Error('Clean-comparison receipt exceeds 256 KiB');
  const directory = join(storageRoot, 'comparison-receipts');
  await transferDirectory(directory);
  const path = join(directory, `${operationId}.json`), temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await link(temporary, path);
  } finally { await rm(temporary, { force: true }); }
  return path;
}
