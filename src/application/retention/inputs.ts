import { isAbsolute, relative, resolve, sep } from 'node:path';
import { realpath } from 'node:fs/promises';
import { safeTransferPath } from '../../storage/transfer-files.js';

export async function retentionInputs(directory: string, files: readonly string[]) {
  await safeTransferPath(resolve(directory), true);
  const root = await realpath(directory);
  for (const file of files) {
    const local = relative(root, await realpath(file));
    if (!local || (!isAbsolute(local) && local !== '..' && !local.startsWith(`..${sep}`))) throw Error('Keep retention policy and plan files outside the managed cache');
  }
  return root;
}
