import { lstat, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { persistedJsonDigest } from '@weftlet/core';
import { safeTransferPath, transferDirectory } from '../transfer-files.js';
import { prepareRecoveryArchive, recoveryResult } from './archive.js';
import { assertRecoveryPlan, planRecovery, type RecoveryOptions } from './plan.js';
import { barrierBytes, barrierName, controlFiles, controlName, readControl, recoveryRoot, revision, type ControlFile } from './state.js';

async function writeSynced(root: string, path: string, bytes: string) {
  await safeTransferPath(join(root, path), false, true);
  const handle = await open(join(root, path), 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function assertControlState(root: string, files: Map<string, ControlFile>, directories: { path: string; identity: string }[]) {
  const current = await controlFiles(root);
  if (persistedJsonDigest(current.directories) !== persistedJsonDigest(directories) ||
      current.paths.join('\n') !== [...files.keys()].sort().join('\n')) throw Error('Recovery control membership or directory identity changed');
  for (const [path, expected] of files) {
    await safeTransferPath(join(root, path));
    if (revision(await lstat(join(root, path), { bigint: true })) !== expected.revision) throw Error('Recovery control file changed');
  }
}
/** Offline recovery clears only reviewed controls. Pre-release failures retain the barrier; a final receipt failure may follow admission reopening. */
export async function applyRecovery(saved: unknown, expected: string, options: RecoveryOptions & { acknowledgeQuiescence: boolean }) {
  if (options.acknowledgeQuiescence !== true) throw Error('Stop all cache clients and recovery processes, then explicitly acknowledge quiescence');
  assertRecoveryPlan(saved, expected);
  const scope = await recoveryRoot(options.root), { root, rootId } = scope;
  const common = { ...options, root, maxEntries: saved.limits.maxEntries, maxBytes: saved.limits.maxBytes };
  const original = await planRecovery(common);
  if (!original.canApply || original.planId !== saved.planId) throw Error('Recovery plan is stale or blocked; inspect and review again');
  options.signal?.throwIfAborted(); await scope.verify();
  const archive = await prepareRecoveryArchive(saved);
  const { directory, prefix, gatePath, ownedGate } = archive;
  const excludedFiles: string[] = [], excludedDirectories = archive.newDirectory ? [directory] : [];
  await transferDirectory(join(root, directory));
  // Permanent per-plan exclusive claim: never steal/reuse it, including after interruption.
  const claimPath = `${prefix}.claim.json`;
  await writeSynced(root, claimPath, archive.claimBytes); excludedFiles.push(claimPath);
  if (archive.newBarrier) {
    try { await writeSynced(root, barrierName, barrierBytes); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    if ((await readControl(root, barrierName, 4096)).bytes.toString('utf8') !== barrierBytes) throw Error('Recovery barrier changed');
    excludedFiles.push(barrierName);
  }
  if (ownedGate) { await writeSynced(root, gatePath, archive.gateBytes); excludedFiles.push(gatePath); }
  const checked = await planRecovery(common, { files: excludedFiles, directories: excludedDirectories });
  if (checked.planId !== saved.planId || !checked.canApply) throw Error('Recovery state changed during admission; barrier retained');
  const files = new Map<string, ControlFile>(saved.controls.map(f => [f.path, f]));
  for (const path of excludedFiles) files.set(path, (await readControl(root, path)).file);
  const directories = [...saved.directories];
  for (const path of excludedDirectories) {
    const stat = await lstat(join(root, path), { bigint: true }); directories.push({ path, identity: `${stat.dev}:${stat.ino}` });
  }
  directories.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const verify = async () => { options.signal?.throwIfAborted(); await scope.verify(); await assertControlState(root, files, directories); };
  await verify();
  // This immutable, synced receipt preserves original control bytes before the first unlink.
  await verify();
  await writeSynced(root, `${prefix}.start.json`, archive.startBytes);
  files.set(`${prefix}.start.json`, (await readControl(root, `${prefix}.start.json`)).file);
  const clear = async (path: string) => {
    await verify();
    const actual = await readControl(root, path, 4096);
    if (persistedJsonDigest(actual.file) !== persistedJsonDigest(files.get(path))) throw Error('Recovery control bytes changed');
    await unlink(join(root, path)); files.delete(path);
  };
  for (const path of saved.actions.filter(p => p !== gatePath)) await clear(path);
  if (saved.actions.includes(gatePath) || ownedGate) await clear(gatePath);
  // Keep the live claim unresolved until admission is released. Another recovery must veto it.
  await clear(barrierName);
  const result = recoveryResult(saved);
  await scope.verify(); await writeSynced(root, `${prefix}.done.json`, JSON.stringify(result));
  return result;
}
