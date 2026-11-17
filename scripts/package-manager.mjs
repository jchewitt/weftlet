import { closeSync, openSync, readSync, realpathSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** Launch npm without shell/.cmd assumptions, including from a pnpm script on Windows. */
export async function npmCliPath() {
  const candidates = [
    ...(process.env.npm_execpath?.endsWith('npm-cli.js') ? [process.env.npm_execpath] : []),
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ];
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error('npm CLI not found beside Node; install Node with npm to run the consumer check');
}

/** npm_execpath can be either a JS entry point or pnpm's standalone native executable. */
export function pnpmInvocation(args, executable = process.env.npm_execpath) {
  if (!executable) {
    if (process.platform === 'win32') throw new Error('Run this script through pnpm so its executable can be resolved without a shell');
    return { command: 'pnpm', args: [...args] };
  }
  const target = realpathSync(executable);
  if (/\.(?:cmd|bat)$/i.test(target)) {
    throw new Error('Run through pnpm using its JavaScript entry point or standalone executable, not a batch shim');
  }
  const header = Buffer.alloc(256);
  const descriptor = openSync(target, 'r');
  let length;
  try { length = readSync(descriptor, header, 0, header.length, 0); }
  finally { closeSync(descriptor); }
  const firstLine = header.subarray(0, length).toString('utf8').split(/\r?\n/, 1)[0];
  const javascript = /\.(?:cjs|mjs|js)$/i.test(target) ||
    /^#![^\r\n]*\bnode(?:\s|$)/.test(firstLine);
  return javascript
    ? { command: process.execPath, args: [target, ...args] }
    : { command: target, args: [...args] };
}
