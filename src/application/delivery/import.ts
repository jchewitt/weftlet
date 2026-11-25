import { createReadStream } from 'node:fs';
import { compactWritesEnabled, writeCompactSnapshot } from '../../storage/compact-snapshot.js';
import { storedJsonDigest } from './stored-json.js';
import { withManagedCacheAccess } from '../../storage/coordination/managed-access.js';
import { cacheOperationPaths } from '../cache-operation.js';
import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { readBundleManifest, assertBundleSnapshot } from './read-bundle.js';
import { fileDigest, copyTransferFile, requireFreeSpace, safeTransferPath, transferDirectory } from '../../storage/transfer-files.js';
import { snapshotPath, semanticArtifactPath } from '../../storage/storage.js';
import { activationHead, deliveryContext, deliveryState } from './context.js';
import { manifestByteLimit, transferLimit, type TransferFile } from './contract.js';
import { checkpoint, sameValue, validateTransferredSnapshot, type TransferControl } from './validation.js';
import { validateBundleArtifact } from './semantic.js';

export interface ImportSnapshotOptions extends TransferControl {
  readonly input: string;
  readonly expectDigest: string;
  readonly includeSemantic?: boolean;
  readonly activate?: boolean;
  /** null means no head must exist. Required when activating. */
  readonly expectHead?: string | null;
  readonly dryRun?: boolean;
  readonly maxBytes?: number;
}
export async function importSnapshot(configPath: string, options: ImportSnapshotOptions) {
  const context = await deliveryContext(configPath);
  return withManagedCacheAccess([...cacheOperationPaths(context.repositoryRoot, context.config), options.input],
    () => importSnapshotOwned(context, options), { signal: options.signal });
}
async function importSnapshotOwned(context: Awaited<ReturnType<typeof deliveryContext>>, options: ImportSnapshotOptions) {
  if (options.activate !== (options.expectHead !== undefined) && (options.activate || options.expectHead !== undefined)) {
    throw Error('--activate requires --expect-head <id|none>; --expect-head requires --activate');
  }
  const maxBytes = transferLimit(options.maxBytes), input = resolve(options.input);
  const bundle = await readBundleManifest(input, options.expectDigest, maxBytes);
  if (bundle.snapshot.repositoryId !== context.config.repositoryId) throw Error('Bundle belongs to a different repository identity');
  await transferDirectory(context.storageRoot);
  await requireFreeSpace(context.storageRoot, bundle.payloadBytes + manifestByteLimit);
  const transfers = join(context.storageRoot, 'transfers');
  await transferDirectory(transfers);
  const stage = join(transfers, `import-${randomUUID()}`);
  await mkdir(stage, { mode: 0o700 });
  try {
    await writeFile(join(stage, 'lease.json'), JSON.stringify({ kind: 'snapshot-import', pid: process.pid,
      startedAt: new Date().toISOString(), reservedPayloadBytes: bundle.payloadBytes }), { flag: 'wx', mode: 0o600 });
    for (const entry of bundle.files) {
      checkpoint(options, 'verify-payload');
      const copied = await copyTransferFile(join(input, entry.name), join(stage, entry.name), entry.bytes, options.signal);
      if (!sameValue(copied, { bytes: entry.bytes, sha256: entry.sha256 })) throw Error('Bundle payload integrity mismatch');
    }
    const validated = await validateTransferredSnapshot(join(stage, 'snapshot.json'), options);
    const { snapshot } = validated;
    assertBundleSnapshot(bundle, validated);
    const evidenceState = await deliveryState(context, snapshot);
    const headName = options.activate ? activationHead(context, snapshot) : undefined;
    if (options.activate && (!evidenceState.configurationMatches || !evidenceState.extractionCompatible)) {
      throw Error('Mismatched configuration or extractors: import by ID without --activate to inspect historical evidence');
    }
    if (headName && (await context.store.headId(headName) ?? null) !== options.expectHead) throw Error('Snapshot head changed; inspect it before activation');
    const installs: { entry: TransferFile; destination: string }[] = [{ entry: bundle.files[0]!,
      destination: await context.store.file(snapshot.manifest.snapshotId) ?? snapshotPath(context.storageRoot, snapshot.manifest.snapshotId) }];
    if (options.includeSemantic && bundle.files.length - 1 !== snapshot.manifest.semanticArtifactKeys.length) throw Error('Bundle does not include the requested semantic artifacts');
    for (const entry of bundle.files.slice(1)) {
      checkpoint(options, 'validate-semantic-artifact');
      // Even excluded cache payloads must be intact. Adoption additionally checks local Git/config.
      await validateBundleArtifact(join(stage, entry.name), entry.semanticKey!, options.includeSemantic ? context : undefined);
      if (options.includeSemantic) installs.push({ entry, destination: await context.artifacts.file(entry.semanticKey!) ??
        semanticArtifactPath(context.semanticRoots.primary, entry.semanticKey!) });
    }
    // Check every collision before installing anything; concurrent winners are rechecked below.
    for (const item of installs) await existingMatches(item.destination, item.entry);
    if (!options.dryRun) {
      for (const { entry, destination } of installs) {
        checkpoint(options, 'install-verified-evidence');
        await transferDirectory(dirname(destination));
        if (await existingMatches(destination, entry)) continue;
        let installFile = join(stage, entry.name);
        if (entry.name === 'snapshot.json' && compactWritesEnabled()) {
          const encoded = join(stage, 'compact');
          await requireFreeSpace(stage, entry.bytes + Math.ceil(entry.bytes / 1024 ** 2) * 4096 + 80);
          await writeCompactSnapshot(encoded, createReadStream(installFile, { signal: options.signal }));
          await existingMatches(encoded, entry);
          installFile = encoded;
        }
        options.signal?.throwIfAborted();
        try { await link(installFile, destination); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        // Remove our staging link before the regular-file boundary check (nlink === 1).
        await rm(installFile);
        if (!(await existingMatches(destination, entry))) throw Error('Imported evidence disappeared before publication');
      }
      checkpoint(options, 'activate-snapshot');
      if (headName) {
        await safeTransferPath(join(context.storageRoot, 'heads'), true, true);
        await context.store.updateHead(headName, snapshot.manifest.snapshotId, { expectedSnapshotId: options.expectHead! });
      }
    }
    return { operation: 'snapshot-import', dryRun: options.dryRun ?? false, snapshotId: snapshot.manifest.snapshotId,
      manifestSha256: options.expectDigest, contentDigest: snapshot.manifest.contentDigest,
      persistedGraphDigest: validated.persistedGraphDigest, payloadBytes: bundle.payloadBytes,
      semanticArtifacts: options.includeSemantic ? installs.length - 1 : 0,
      activated: Boolean(headName && !options.dryRun), ...(headName ? { headName } : {}),
      strictValidation: true, evidenceState, producerContentDigest: 'preserved-not-recomputed' as const };
  } finally { await rm(stage, { recursive: true, force: true }); }
}
async function existingMatches(path: string, entry: TransferFile): Promise<boolean> {
  try {
    await safeTransferPath(path);
    if (entry.name === 'snapshot.json') {
      const actual = await storedJsonDigest(path, entry.bytes);
      if (!sameValue(actual, { bytes: entry.bytes, sha256: entry.sha256 })) throw Error('Immutable evidence collision: existing bytes differ');
      return true;
    }
    if ((await lstat(path)).size !== entry.bytes) throw Error('Immutable evidence collision: existing byte length differs; nothing was overwritten');
    const actual = await fileDigest(path, entry.bytes);
    if (!sameValue(actual, { bytes: entry.bytes, sha256: entry.sha256 })) throw Error('Immutable evidence collision: existing bytes differ; nothing was overwritten');
    return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
