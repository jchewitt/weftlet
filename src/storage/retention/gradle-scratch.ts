import { execFile } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type { CacheObject } from '../inspection/layout.js';
import { safeTransferPath } from '../transfer-files.js';
import type { RetentionPolicy } from './policy.js';

// The optional compiler allocates work/ontology-<randomUUID> per invocation.
// Only the four Gradle 8.10.2 locations verified in the legacy-cache report qualify.
const scratchLock = /^work\/ontology-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/\.gradle\/(?:8\.10\.2\/(?:checksums\/checksums|executionHistory\/executionHistory|fileHashes\/fileHashes)|buildOutputCleanup\/buildOutputCleanup)\.lock$/;

function recognized(entry: CacheObject, owners: ReadonlyMap<string, string | null>) {
  if (entry.category !== 'temporary' || entry.kind !== 'file' || entry.linkCount !== 1 ||
      !entry.physicalIdentity || entry.activity !== 'unknown' || !owners.get(entry.profile)) return false;
  const prefix = entry.profile === '.' ? '' : entry.profile + '/';
  return entry.path.startsWith(prefix) && scratchLock.test(entry.path.slice(prefix.length));
}

// A separate handle opened with FileShare.None is incompatible even with a shared
// Gradle read handle on local NTFS. Open existing, read-only, and never unlink a lock.
// stdin carries UTF-8 JSON paths as data. stdout has one 0/1 character per request.
const windowsProbe = `
$ErrorActionPreference = 'Stop'
$reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.UTF8Encoding]::new($false, $true))
try { $paths = ConvertFrom-Json -InputObject ($reader.ReadToEnd()) } finally { $reader.Dispose() }
foreach ($path in $paths) {
  $idle = '0'
  try {
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($path))
    if ($drive.DriveType -eq 'Fixed' -and $drive.DriveFormat -eq 'NTFS') {
      $item = $path
      while ($item) {
        if ([IO.File]::GetAttributes($item) -band [IO.FileAttributes]::ReparsePoint) { throw 'reparse point' }
        $item = [IO.Path]::GetDirectoryName($item)
      }
      $handle = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
      $handle.Dispose()
      $idle = '1'
    }
  } catch { $idle = '0' }
  [Console]::Write($idle)
}`;

function probeBatch(shell: string, paths: string[], signal?: AbortSignal): Promise<string> {
  return new Promise(resolve => {
    const child = execFile(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', windowsProbe], {
      cwd: dirname(shell), windowsHide: true, timeout: 30_000, signal, maxBuffer: 65536, encoding: 'utf8',
    }, (error, stdout) => resolve(!error && stdout.length === paths.length && /^[01]+$/.test(stdout) ? stdout : ''));
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
export async function probeGradleScratch(objects: readonly CacheObject[], policy: RetentionPolicy, signal?: AbortSignal) {
  const idle = new Set<string>();
  const systemRoot = process.env.SystemRoot;
  if (process.platform !== 'win32' || !systemRoot || !isAbsolute(systemRoot)) return idle;
  const shell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const owners = new Map<string, string | null>(policy.profiles.map(p => [p.path, p.repositoryId]));
  for (const entry of objects) {
    const repository = entry.metadata?.repositoryId;
    if (entry.category !== 'snapshot' || entry.inspection !== 'json-complete' || !entry.sha256 || !repository) continue;
    const prior = owners.get(entry.profile);
    owners.set(entry.profile, prior === undefined || prior === repository ? repository : null);
  }
  const candidates = objects.filter(entry => recognized(entry, owners));
  for (let start = 0; start < candidates.length; start += 256) {
    signal?.throwIfAborted();
    const batch: CacheObject[] = [];
    for (const entry of candidates.slice(start, start + 256)) {
      if (await sameFile(entry)) batch.push(entry);
    }
    if (!batch.length) continue;
    const result = await probeBatch(shell, batch.map(e => join(e.root, e.path)), signal);
    signal?.throwIfAborted();
    for (const [i, entry] of batch.entries()) {
      if (result[i] === '1' && await sameFile(entry)) idle.add(entry.path);
    }
  }
  return idle;
}
