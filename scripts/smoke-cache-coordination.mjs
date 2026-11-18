import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Exercise the public installed API and CLI against an existing independently built snapshot. */
export async function smokeCacheCoordination(project, installedRoot, snapshotId) {
  const { withManagedCacheAccess, withSnapshotAccess, managedRootForPath } =
    await import(pathToFileURL(join(installedRoot, 'dist/index.js')).href);
  const root = join(project, '.context-graph');
  const before = await withSnapshotAccess(root, scoped => scoped.withFile(snapshotId, async file => {
    if (!file) throw Error('Managed cache smoke requires the existing public snapshot');
    return readFile(file);
  }));
  const { stdout } = await promisify(execFile)(process.execPath, [join(installedRoot, 'dist/cli.js'),
    'cache', 'coordination', 'enable', '--root', root, '--acknowledge-quiescence'],
    { cwd: project, timeout: 60_000, maxBuffer: 1024 * 1024 });
  const activated = JSON.parse(stdout);
  if (!activated.changed || activated.pruningEnabled || await managedRootForPath(root) !== activated.root) {
    throw Error('Installed managed-root activation failed');
  }
  await withManagedCacheAccess([root], async () => withSnapshotAccess(root, async scoped => {
    if ((await scoped.read(snapshotId))?.manifest.snapshotId !== snapshotId) throw Error('Managed saved read failed');
    await scoped.updateHead('generation-smoke', snapshotId);
    const state = await scoped.readHeadState('generation-smoke');
    if (state?.schemaVersion !== 1 || state.snapshotId !== snapshotId || state.previousSnapshotId !== undefined) {
      throw Error('Installed atomic head state API failed');
    }
    await scoped.updateHead('generation-smoke', snapshotId, { expectedSnapshotId: snapshotId });
    await scoped.withFile(snapshotId, async current => {
      if (!current || !(await readFile(current)).equals(before)) throw Error('Managed access changed immutable snapshot bytes');
    });
  }));
  console.log('Installed managed cache CLI/public helpers preserve saved snapshot bytes.');
}
