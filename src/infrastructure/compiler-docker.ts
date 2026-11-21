import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export async function compilerDockerQuery(args: readonly string[], cwd: string) {
  const result = await promisify(execFile)('docker', args, { cwd, timeout: 10_000, maxBuffer: 64 * 1024, windowsHide: true });
  return result.stdout.trim();
}
