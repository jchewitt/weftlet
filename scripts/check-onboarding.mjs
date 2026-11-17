import '../runtime-check.mjs';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { npmCliPath, pnpmInvocation } from './package-manager.mjs';
import { smokeOnboarding } from './smoke-onboarding.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'weftlet-onboarding-')));
try {
  for (const cwd of [join(root, 'packages/core'), root]) {
    const invocation = pnpmInvocation(['pack', '--pack-destination', temporary]);
    await promisify(execFile)(invocation.command, invocation.args, { cwd, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  }
  const files = await readdir(temporary);
  const core = files.find(f => /^weftlet-core-.*\.tgz$/.test(f));
  const toolkit = files.find(f => /^weftlet-toolkit-.*\.tgz$/.test(f));
  if (!core || !toolkit) throw Error('Expected the paired core/toolkit archives');
  console.log(JSON.stringify(await smokeOnboarding(temporary, resolve(temporary, core), resolve(temporary, toolkit), await npmCliPath())));
} finally { await rm(temporary, { recursive: true, force: true }); }
