import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Installed public API creates an actual interrupted owner; installed CLI recovers only its control marker. */
export async function smokeCacheRecovery(project, installedRoot, root, expectedDigest) {
  const module = pathToFileURL(join(installedRoot, 'dist/index.js')).href;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', `
    import { withSnapshotAccess } from ${JSON.stringify(module)};
    await withSnapshotAccess(${JSON.stringify(root)}, async store => {
      await store.readHead('default'); setInterval(() => {}, 1000); process.send('entered'); await new Promise(() => {});
    });`], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
  const closed = new Promise((resolve, reject) => { child.once('close', resolve); child.once('error', reject); });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Recovery smoke child did not enter')), 30_000);
      child.once('message', () => { clearTimeout(timer); resolve(); });
      closed.then(() => { clearTimeout(timer); reject(Error('Recovery smoke child exited before entry')); }, reject);
    });
  } finally { child.kill('SIGKILL'); await closed; }
  const run = async (...args) => JSON.parse((await promisify(execFile)(process.execPath,
    [join(installedRoot, 'dist/cli.js'), 'cache', 'recovery', ...args], { cwd: project, timeout: 60_000, maxBuffer: 4 * 1024 ** 2 })).stdout);
  const plan = await run('plan', '--root', root, '--json'), planPath = join(project, 'recovery-plan.json');
  if (!plan.canApply || plan.actions.length !== 1) throw Error('Installed recovery did not identify the interrupted owner');
  await writeFile(planPath, JSON.stringify(plan));
  const result = await run('apply', '--root', root, '--plan', planPath, '--expect-plan', plan.planId, '--acknowledge-quiescence');
  const { withSnapshotAccess } = await import(module);
  const digest = await withSnapshotAccess(root, async store => (await store.readHead('default'))?.manifest.contentDigest);
  if (result.evidenceFilesRemoved !== 0 || result.replayedDeletions !== 0 || digest !== expectedDigest) throw Error('Installed recovery changed evidence');
  console.log('Installed cache recovery clears an actual killed owner and preserves saved evidence.');
}
