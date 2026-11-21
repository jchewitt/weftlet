import { execFileSync } from 'node:child_process';
import { lstat, readdir, statfs } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

/** Measure only regular-file payloads in a private fixture while its cache is idle. */
export async function measureFiles(root: string) {
  const files: { path: string; bytes: number; allocated: number }[] = [];
  async function visit(dir: string) {
    for (const name of (await readdir(dir)).sort()) {
      const file = join(dir, name);
      const stat = await lstat(file, { bigint: true });
      if (stat.isDirectory()) await visit(file);
      else {
        assert.ok(stat.isFile() && stat.nlink === 1n, 'expected an ordinary unshared cache file');
        files.push({ path: relative(root, file).split(sep).join('/'), bytes: Number(stat.size),
          allocated: process.platform === 'win32' ? -1 : Number(stat.blocks * 512n) });
      }
    }
  }
  await visit(root);
  let fileSystem = 'statfs:' + (await statfs(root)).type.toString(16);
  if (process.platform === 'win32') {
    const result = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-File',
      fileURLToPath(new URL('./native-allocation.ps1', import.meta.url))], {
      input: JSON.stringify(files.map(f => join(root, f.path))), encoding: 'utf8', windowsHide: true,
    }));
    assert.equal(result.fileSystem, 'NTFS');
    assert.equal(result.bytes.length, files.length);
    fileSystem = result.fileSystem;
    files.forEach((file, i) => { file.allocated = result.bytes[i]; });
  }
  assert.ok(files.every(f => Number.isSafeInteger(f.allocated) && f.allocated >= 0));
  return { fileSystem, files };
}
