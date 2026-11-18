import { withManagedCacheAccess } from '../../storage/coordination/managed-access.js';
import { cacheOperationPaths } from '../cache-operation.js';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { sha256 } from '@weftlet/core';
import { withHeadLock } from '../../storage/head-lock.js';
import { copyTransferFile, requireFreeSpace, transferDirectory } from '../../storage/transfer-files.js';
import { deliveryContext, deliveryState } from './context.js';
import { checkpoint, validateTransferredSnapshot, type TransferControl } from './validation.js';
import { assertBundle, manifestByteLimit, semanticFilename, transferLimit, type SnapshotBundle, type TransferFile } from './contract.js';
import { validateBundleArtifact } from './semantic.js';

export interface ExportSnapshotOptions extends TransferControl {
  readonly snapshotId: string;
  readonly output: string;
  readonly includeSemantic?: boolean;
  readonly maxBytes?: number;
}
export async function exportSnapshot(configPath: string, options: ExportSnapshotOptions) {
  const context = await deliveryContext(configPath), maxBytes = transferLimit(options.maxBytes);
  return withManagedCacheAccess([...cacheOperationPaths(context.repositoryRoot, context.config), options.output],
    () => exportSnapshotOwned(context, options, maxBytes), { signal: options.signal });
}
async function exportSnapshotOwned(context: Awaited<ReturnType<typeof deliveryContext>>, options: ExportSnapshotOptions, maxBytes: number) {
  const output = resolve(options.output), parent = dirname(output);
  await transferDirectory(parent);
  // Bounded lock/staging names also work when the logical snapshot ID is very long.
  return withHeadLock(join(parent, `.weftlet-export-${sha256(output).slice(0, 24)}.lock`), async () => {
    await requireAbsent(output);
    const source = await context.store.file(options.snapshotId);
    if (!source) throw Error('Selected snapshot is absent');
    const size = (await lstat(source)).size;
    if (size > maxBytes) throw Error('Snapshot exceeds transfer byte limit');
    await requireFreeSpace(parent, size + manifestByteLimit);
    const stage = join(parent, `.weftlet-transfer-${randomUUID()}`);
    await mkdir(stage, { mode: 0o700 });
    try {
      checkpoint(options, 'copy-snapshot');
      const copied = await copyTransferFile(source, join(stage, 'snapshot.json'), maxBytes, options.signal);
      const validated = await validateTransferredSnapshot(join(stage, 'snapshot.json'), options);
      if (validated.snapshot.manifest.snapshotId !== options.snapshotId) throw Error('Stored snapshot ID mismatch');
      const evidenceState = await deliveryState(context, validated.snapshot);
      const files: TransferFile[] = [{ name: 'snapshot.json', ...copied }];
      let payloadBytes = copied.bytes;
      if (options.includeSemantic) for (const key of validated.snapshot.manifest.semanticArtifactKeys) {
        checkpoint(options, 'copy-semantic-artifact');
        if (files.length >= 513) throw Error('Bundle supports at most 512 semantic artifacts');
        const artifactPath = await context.artifacts.file(key);
        if (!artifactPath) throw Error('Selected snapshot has a missing semantic artifact; export without --include-semantic or recover it first');
        const name = semanticFilename(key), size = (await lstat(artifactPath)).size;
        await requireFreeSpace(parent, size + manifestByteLimit);
        const entry = await copyTransferFile(artifactPath, join(stage, name), maxBytes - payloadBytes, options.signal);
        await validateBundleArtifact(join(stage, name), key);
        files.push({ name, semanticKey: key, ...entry }); payloadBytes += entry.bytes;
      }
      const bundle: SnapshotBundle = { format: 'weftlet-snapshot-bundle', version: 1,
        createdAt: new Date().toISOString(), snapshot: validated.snapshot.manifest,
        exportingToolkitVersion: JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')).version,
        persistedGraphDigest: validated.persistedGraphDigest, files, payloadBytes };
      assertBundle(bundle, maxBytes);
      const manifest = JSON.stringify(bundle, null, 2) + '\n';
      if (Buffer.byteLength(manifest) > manifestByteLimit) throw Error('Bundle manifest exceeds its byte limit');
      await writeFile(join(stage, 'manifest.json'), manifest, { flag: 'wx', mode: 0o600 });
      checkpoint(options, 'publish-bundle');
      await requireAbsent(output);
      await rename(stage, output);
      return { operation: 'snapshot-export', output, manifestSha256: sha256(manifest),
        snapshotId: options.snapshotId, contentDigest: bundle.snapshot.contentDigest,
        persistedGraphDigest: bundle.persistedGraphDigest, payloadBytes,
        semanticArtifacts: files.length - 1, strictValidation: true, evidenceState,
        producerContentDigest: 'preserved-not-recomputed' as const };
    } finally { await rm(stage, { recursive: true, force: true }); }
  });
}
async function requireAbsent(path: string) {
  try { await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw Error('Snapshot export requires a new output directory');
}
