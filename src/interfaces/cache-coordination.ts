import { resolve } from 'node:path';
import { enableCacheCoordination, managedRootForPath } from '../storage/coordination/managed-root.js';

/** Explicit operational migration, independent of project configuration and Git. */
export async function runCacheCoordination(args: readonly string[]): Promise<boolean> {
  if (args[0] !== 'cache' || args[1] !== 'coordination') return false;
  const operation = args[2];
  let root: string | undefined, acknowledged = false;
  if (!['enable', 'status'].includes(operation ?? '')) throw Error('cache coordination requires enable or status');
  for (let i = 3; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--root' && root === undefined && args[i + 1] && !args[i + 1]!.startsWith('--')) root = resolve(args[++i]!);
    else if (flag === '--acknowledge-quiescence' && operation === 'enable' && !acknowledged) acknowledged = true;
    else throw Error(`Invalid cache coordination argument: ${flag}`);
  }
  if (!root) throw Error('cache coordination requires an explicit --root <directory>');
  const result = operation === 'enable'
    ? await enableCacheCoordination(root, { acknowledgeQuiescence: acknowledged })
    : { path: root, managedRoot: await managedRootForPath(root) ?? null, pruningEnabled: false };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return true;
}
