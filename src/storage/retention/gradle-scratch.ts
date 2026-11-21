import { execFile } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type { CacheObject } from '../inspection/layout.js';
import { safeTransferPath } from '../transfer-files.js';
import type { RetentionPolicy } from './policy.js';

import { compilerLockClassifier } from './compiler-lock-layout.js';

// A separate handle opened with FileShare.None is incompatible even with a shared
// Gradle read handle on local NTFS. Open existing, read-only, and never unlink a lock.
// stdin carries UTF-8 JSON paths as data. stdout has one probe status character per request.
const windowsProbe = String.raw`
$ErrorActionPreference = 'Stop'
$reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.UTF8Encoding]::new($false, $true))
try { $paths = ConvertFrom-Json -InputObject ($reader.ReadToEnd()) } finally { $reader.Dispose() }
foreach ($path in $paths) {
  $idle = '0'
  try {
    if ($path -notmatch '^[A-Za-z]:\\') { throw 'local drive path required' }
    $driveRoot = $path.Substring(0, 3)
    $drive = [IO.DriveInfo]::new($driveRoot)
    if ($drive.DriveType -eq 'Fixed' -and $drive.DriveFormat -eq 'NTFS') {
      $extended = '\\?\' + $path
      $item = $path
      while ($true) {
        if ([IO.File]::GetAttributes('\\?\' + $item) -band [IO.FileAttributes]::ReparsePoint) { throw 'reparse point' }
        if ($item.Length -le $driveRoot.Length) { break }
        $item = $item.Substring(0, [Math]::Max($driveRoot.Length, $item.LastIndexOf('\')))
      }
      try {
        $handle = [IO.File]::Open($extended, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
        $handle.Dispose()
        $idle = '1'
      } catch {
        $code = $_.Exception.GetBaseException().HResult -band 65535
        if ($code -eq 32 -or $code -eq 33) { $idle = 'H' }
      }
    }
  } catch { $idle = '0' }
  [Console]::Write($idle)
}`;

function probeBatch(shell: string, paths: string[], signal?: AbortSignal): Promise<string> {
  return new Promise(resolve => {
    const child = execFile(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', windowsProbe], {
      cwd: dirname(shell), windowsHide: true, timeout: 30_000, signal, maxBuffer: 65536, encoding: 'utf8',
    }, (error, stdout) => resolve(!error && stdout.length === paths.length && /^[01H]+$/.test(stdout) ? stdout : ''));
    child.stdin?.on('error', () => resolve(''));
    child.stdin?.end(JSON.stringify(paths));
  });
}

async function sameFile(entry: CacheObject) {
  const path = join(entry.root, entry.path);
  try {
    await safeTransferPath(path);
    const s = await lstat(path, { bigint: true });
    return s.isFile() && s.nlink === 1n && [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs, s.nlink].join(':') === entry.revision;
  } catch { return false; }
}

/** Called after coordinated admission drains. Unresolved and changed objects stay blocking. */
export async function probeGradleScratch(objects: readonly CacheObject[], policy: RetentionPolicy, rootId: string, signal?: AbortSignal) {
  const idle = new Set<string>();
  const blockers = new Map<string, string>();
  const classify = compilerLockClassifier(objects, policy, rootId);
  const candidates: CacheObject[] = [];
  const systemRoot = process.env.SystemRoot;
  const shell = process.platform === 'win32' && systemRoot && isAbsolute(systemRoot)
    ? join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : undefined;
  for (const entry of objects) {
    if (!entry.path.toLowerCase().endsWith('.lock')) continue;
    const reason = classify(entry);
    if (reason !== 'recognized') blockers.set(entry.path, reason);
    else if (!shell) blockers.set(entry.path, 'exclusive-probe-unavailable');
    else candidates.push(entry);
  }
  if (!shell) return { idle, blockers };
  for (let start = 0; start < candidates.length; start += 256) {
    signal?.throwIfAborted();
    const batch: CacheObject[] = [];
    for (const entry of candidates.slice(start, start + 256)) {
      if (await sameFile(entry)) batch.push(entry);
      else blockers.set(entry.path, 'lock-revision-unverified');
    }
    if (!batch.length) continue;
    const result = await probeBatch(shell, batch.map(e => join(e.root, e.path)), signal);
    signal?.throwIfAborted();
    for (const [i, entry] of batch.entries()) {
      if (!await sameFile(entry)) blockers.set(entry.path, 'lock-revision-unverified');
      else if (result[i] === '1') idle.add(entry.path);
      else blockers.set(entry.path, result[i] === 'H' ? 'lock-held' : 'exclusive-probe-inconclusive');
    }
  }
  return { idle, blockers };
}
