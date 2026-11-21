import { lstat, mkdir, readFile, readdir, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { managedRootForPath } from './coordination/managed-root.js';
import { withCacheMaintenance } from './coordination/access.js';
import { recoveryRoot } from './recovery/state.js';
import { safeTransferPath, transferDirectory } from './transfer-files.js';
import { inspectSmallJson } from './inspection/read.js';
import { compilerDockerQuery } from '../infrastructure/compiler-docker.js';

type Backend = 'rdf' | 'opencaesar';
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
const registry = 'compiler-operations-v1';
async function directoryIdentity(path: string) {
  await safeTransferPath(path, true);
  const info = await lstat(path, { bigint: true });
  if (!info.ino) throw Error('Compiler workspace lacks a verifiable directory identity');
  return info.dev + ':' + info.ino;
}

export async function createCompilerScratch(storage: string, backend: Backend) {
  const parent = join(storage, 'work');
  await transferDirectory(parent);
  const managed = await managedRootForPath(parent);
  const managedOwner = managed ? await recoveryRoot(managed) : undefined;
  const daemon = backend === 'opencaesar' ? await compilerDockerQuery(['info', '--format', '{{.ID}}'], parent) : null;
  if (backend === 'opencaesar' && (!daemon || daemon.length > 128 || /\s/.test(daemon))) throw Error('Unable to identify compiler Docker daemon');
  const operationId = randomUUID(), root = join(parent, 'compiler-' + operationId);
  await mkdir(root, { mode: 0o700 });
  const identity = await directoryIdentity(root);
  const debug = process.env.WEFTLET_KEEP_COMPILER_SCRATCH === '1';
  const owner = { version: 1, operationId, backend, directoryIdentity: identity, rootId: managedOwner?.rootId ?? null, daemon, debug,
    path: managed ? relative(managed, await realpath(root)).split(sep).join('/') : null };
  const bytes = JSON.stringify(owner);
  const registration = managed && join(managed, registry, operationId + '.json');
  let registered = false;
  try {
    await writeFile(join(root, 'owner.json'), bytes, { flag: 'wx', mode: 0o600 });
    if (registration) {
      await transferDirectory(dirname(registration));
      await writeFile(registration, bytes, { flag: 'wx', mode: 0o600 });
      registered = true;
    }
  } catch (error) {
    if (await directoryIdentity(root) === identity) await rm(root, { recursive: true });
    throw error;
  }
  return { root, async dispose() {
    if (debug) return;
    if (daemon) await confirmCompilerStopped(root, operationId, daemon);
    await managedOwner?.verify();
    if (await directoryIdentity(root) !== identity || await readFile(join(root, 'owner.json'), 'utf8') !== bytes) throw Error('Compiler workspace ownership changed');
    if (registered && await readFile(registration!, 'utf8') !== bytes) throw Error('Compiler registration changed');
    await rm(root, { recursive: true, maxRetries: 5, retryDelay: 50 });
    if (registered) await unlink(registration!);
  } };
}

async function confirmCompilerStopped(root: string, operationId: string, daemon: string) {
  if (await compilerDockerQuery(['info', '--format', '{{.ID}}'], root) !== daemon) throw Error('Compiler Docker daemon changed');
  if (await compilerDockerQuery(['ps', '-a', '--filter', 'label=org.weftlet.compiler-operation=' + operationId, '--format', '{{.ID}}'], root))
    throw Error('Compiler container still exists; retaining workspace');
}

/** After ordinary offline marker recovery. Exclusive scope excludes any new cooperating compiler. */
export async function reclaimCompilerScratch(input: string, operationId: string, acknowledged: boolean) {
  if (!acknowledged || !uuid.test(operationId)) throw Error('An exact operation UUID and explicit client/container quiescence are required');
  const owner = await recoveryRoot(input);
  const registration = join(owner.root, registry, operationId + '.json');
  return withCacheMaintenance(owner.root, async scope => {
    await owner.verify(); await safeTransferPath(registration);
    const record = await inspectSmallJson(registration, 4096, true) as Record<string, unknown>;
    if (!record || record.version !== 1 || record.operationId !== operationId || record.rootId !== owner.rootId || record.debug !== false ||
        !['rdf', 'opencaesar'].includes(String(record.backend)) || typeof record.path !== 'string' ||
        record.path.includes('\\') || record.path.split('/').some(p => !p || p === '.' || p === '..') || isAbsolute(record.path))
      throw Error('Unknown, retained or invalid compiler operation');
    const root = resolve(owner.root, record.path);
    if (relative(owner.root, root).split(sep).join('/') !== record.path || basename(root) !== 'compiler-' + operationId ||
        basename(dirname(root)) !== 'work' || await managedRootForPath(root) !== owner.root) throw Error('Invalid compiler workspace path');
    const entries = await readdir(root).catch(error => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (entries) {
      if (await directoryIdentity(root) !== record.directoryIdentity || entries.some(p => !['owner.json', 'payload'].includes(p)) ||
          !isDeepStrictEqual(record, await inspectSmallJson(join(root, 'owner.json'), 4096, true))) throw Error('Compiler workspace ownership changed');
      if (record.backend === 'opencaesar') {
        if (typeof record.daemon !== 'string' || !record.daemon) throw Error('Compiler daemon identity is unavailable');
        await confirmCompilerStopped(root, operationId, record.daemon);
      }
      await scope.verify(); await owner.verify();
      if (await directoryIdentity(root) !== record.directoryIdentity ||
          !isDeepStrictEqual(record, await inspectSmallJson(join(root, 'owner.json'), 4096, true)) ||
          !isDeepStrictEqual(record, await inspectSmallJson(registration, 4096, true))) throw Error('Compiler workspace ownership changed');
      await rm(root, { recursive: true, maxRetries: 5 });
    }
    await scope.verify(); await owner.verify();
    if (!isDeepStrictEqual(record, await inspectSmallJson(registration, 4096, true))) throw Error('Compiler registration changed');
    await unlink(registration);
    return { operationId, removedWorkspace: !!entries };
  });
}
