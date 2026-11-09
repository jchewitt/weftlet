import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { SemanticProviderError, type SemanticRunOptions } from './semantic-process.js';

export interface CliInvocation {
  readonly command: string;
  readonly prefixArgs: readonly string[];
}

async function isFile(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); }
  catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw new SemanticProviderError('unavailable', 'Cannot inspect the provider installation on PATH');
  }
}

async function npmEntry(directory: string, shim: string, name: string, packageName: string): Promise<string | undefined> {
  const packageRoot = basename(directory).toLowerCase() === '.bin'
    ? join(dirname(directory), packageName)
    : join(directory, 'node_modules', packageName);
  try {
    const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[name];
    if (pkg.name !== packageName || typeof bin !== 'string' || !/\.(?:(?:c|m)?js|exe)$/i.test(bin)) return;
    const entry = resolve(packageRoot, bin);
    const within = relative(packageRoot, entry);
    if (within.startsWith('..') || isAbsolute(within) || !await isFile(entry)) return;
    // Recognize standard npm cmd-shim targets; never execute or evaluate the batch file.
    const target = relative(directory, entry).replaceAll('\\', '/').toLowerCase();
    const launcher = (await readFile(shim, 'utf8')).replaceAll('\\', '/').toLowerCase();
    if (launcher.includes(`%dp0%/${target}"`) || launcher.includes(`%~dp0${target}"`)) return entry;
  } catch { /* Missing/invalid metadata or an unsupported launcher is reported without its contents. */ }
}

/** Native binaries and standard npm installations; no cmd.exe, PowerShell, or implicit cwd lookup. */
async function findWindowsCli(name: string, packageName: string, displayName: string, environment: Readonly<Record<string, string | undefined>>): Promise<CliInvocation> {
  const pathKey = Object.keys(environment).find(key => key.toUpperCase() === 'PATH');
  for (const item of (pathKey ? environment[pathKey] ?? '' : '').split(';')) {
    const path = item.replace(/^"(.*)"$/, '$1');
    if (!path) continue;
    const directory = resolve(path);
    const native = join(directory, `${name}.exe`);
    if (await isFile(native)) return { command: native, prefixArgs: [] };
    const shim = join(directory, `${name}.cmd`);
    if (!await isFile(shim)) continue;
    const entry = await npmEntry(directory, shim, name, packageName);
    if (entry) return /\.exe$/i.test(entry) ? { command: entry, prefixArgs: [] } : { command: process.execPath, prefixArgs: [entry] };
    throw new SemanticProviderError('unavailable',
      `Unsupported ${displayName} launcher on PATH. Use a standard npm ${packageName} installation or a native ${name}.exe; batch wrappers are not executed`);
  }
  throw new SemanticProviderError('unavailable', `${displayName} CLI was not found on PATH; install ${packageName} with npm or add a native ${name}.exe`);
}

/** Bound discovery too: a disconnected drive in PATH must not leave a provider call waiting indefinitely. */
export async function resolveCliInvocation(
  name: string, packageName: string, displayName: string, command: string, environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform, options: SemanticRunOptions = {},
): Promise<CliInvocation> {
  if (options.signal?.aborted) throw new SemanticProviderError('cancelled', `${displayName} executable discovery cancelled`);
  if (platform !== 'win32' || command !== name) return { command, prefixArgs: [] };
  let timer: NodeJS.Timeout | undefined;
  let cancel = () => {};
  try {
    return await Promise.race([
      findWindowsCli(name, packageName, displayName, environment),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new SemanticProviderError('timeout', `${displayName} executable discovery timed out`)),
          Math.min(options.timeoutMs ?? 5000, 5000));
        cancel = () => reject(new SemanticProviderError('cancelled', `${displayName} executable discovery cancelled`));
        options.signal?.addEventListener('abort', cancel, { once: true });
        if (options.signal?.aborted) cancel();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
