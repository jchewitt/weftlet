import { smokeCacheRecovery } from './smoke-cache-recovery.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Qualify installed CLI removal only in an isolated public-fixture cache. */
export async function smokeRetentionRemoval(project, installedRoot, snapshotId) {
  const { withSnapshotAccess } = await import(pathToFileURL(join(installedRoot, 'dist/index.js')).href);
  const saved = await withSnapshotAccess(join(project, '.context-graph'), store => store.read(snapshotId));
  if (!saved) throw Error('Retention smoke requires the existing public fixture');
  const root = join(project, 'retention-fixture'); await mkdir(root);
  await withSnapshotAccess(root, async store => {
    for (const id of ['kept', 'disposable']) await store.write({ ...saved, manifest: { ...saved.manifest, snapshotId: id } });
    await store.updateHead('default', 'kept');
  });
  const run = async (...args) => JSON.parse((await promisify(execFile)(process.execPath,
    [join(installedRoot, 'dist/cli.js'), 'cache', ...args], { cwd: project, timeout: 60_000, maxBuffer: 4 * 1024 ** 2 })).stdout);
  await run('coordination', 'enable', '--root', root, '--acknowledge-quiescence');
  const policyPath = join(project, 'retention-policy.json'), planPath = join(project, 'retention-prepared.json');
  await writeFile(policyPath, JSON.stringify({ schemaVersion: 1,
    profiles: [{ path: '.', repositoryId: saved.manifest.repositoryId, owner: 'public-fixture', reason: 'Package smoke' }],
    activeScopes: [{ profile: '.', head: 'default', owner: 'public-fixture', reason: 'Current evidence' }], releasedHeads: [], pins: [] }));
  const plan = await run('retention', 'prepare', '--root', root, '--policy', policyPath, '--json', '--quiet');
  if (!plan.canApply || plan.totals.candidateFiles !== 1) throw Error('Installed retention preparation failed');
  await writeFile(planPath, JSON.stringify(plan));
  const result = await run('retention', 'apply', '--root', root, '--policy', policyPath, '--plan', planPath, '--expect-plan', plan.planId, '--json', '--quiet');
  if (result.status !== 'complete' || result.deleted.length !== 1) throw Error('Installed retention removal failed');
  await withSnapshotAccess(root, async store => {
    if (await store.read('disposable') !== undefined || (await store.readHead('default'))?.manifest.contentDigest !== saved.manifest.contentDigest) throw Error('Installed removal did not preserve current evidence');
  });
  await smokeCacheRecovery(project, installedRoot, root, saved.manifest.contentDigest);
  console.log('Installed retention prepare/apply removes only reviewed public-fixture history.');
}
