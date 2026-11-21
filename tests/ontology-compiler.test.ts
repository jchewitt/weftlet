import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SemanticArtifact } from '@weftlet/core';
import { OpenCaesarOntologyCompiler } from '../src/extraction/ontology.js';
import { runProcess } from '../src/infrastructure/process.js';

vi.mock('../src/infrastructure/compiler-docker.js', () => ({
  compilerDockerQuery: vi.fn(async (args: string[]) => args[0] === 'info' ? 'public-daemon' : ''),
}));
vi.mock('../src/infrastructure/process.js', () => ({ runProcess: vi.fn() }));
const runDocker = vi.mocked(runProcess);
const nativePlatform = process.platform;
const processProperties = ['platform', 'getuid', 'getgid'] as const;
const originalDescriptors = new Map(processProperties.map(key => [key, Object.getOwnPropertyDescriptor(process, key)]));
const temporaryRoots: string[] = [];
const image = 'gradle:8.10.2-jdk21@sha256:963d59f7f22767da4efbcf46b661361b61af5fb88b0309da1071c4234c647eba';

afterEach(async () => {
  for (const key of processProperties) {
    const descriptor = originalDescriptors.get(key);
    if (descriptor) Object.defineProperty(process, key, descriptor);
    else Reflect.deleteProperty(process, key);
  }
  vi.restoreAllMocks();
  runDocker.mockReset();
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function platform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { configurable: true, value });
  Object.defineProperty(process, 'getuid', { configurable: true, value: () => 1234 });
  Object.defineProperty(process, 'getgid', { configurable: true, value: () => 5678 });
}

async function bytes(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(path: string) {
    for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
      const relative = join(path, entry.name);
      if (entry.isDirectory()) await visit(relative);
      else result[relative] = (await readFile(join(root, relative))).toString('base64');
    }
  }
  await visit('');
  return result;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-ontology-compiler-'));
  temporaryRoots.push(root);
  const repository = join(root, 'repository');
  const source = join(repository, 'ontology');
  const storage = join(root, 'evidence');
  const snapshots = join(storage, 'snapshots');
  const files = {
    [join(source, 'build.gradle')]: "// Public compiler fixture\napply plugin: 'base'\n",
    [join(source, 'src/oml/owner.oml')]: '// Public source ontology\n',
    [join(source, 'build/rdf/stale.ttl')]: '# Must not enter copied workspace\n',
    [join(snapshots, 'saved.json')]: '{"snapshotId":"previous-valid-evidence"}\n',
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  const sourceBefore = await bytes(source);
  const snapshotsBefore = await bytes(snapshots);
  function compiler(projectPath = 'ontology') {
    const instance = new OpenCaesarOntologyCompiler({ toolVersion: 'oml2owl-gradle-2.13.1',
      projectPath, containerImage: image }, repository, storage);
    // Docker availability is tested separately; only the external process boundary is mocked here.
    vi.spyOn(instance, 'checkReady').mockResolvedValue();
    return instance;
  }
  async function unchanged() {
    expect(await bytes(source)).toEqual(sourceBefore);
    expect(await bytes(snapshots)).toEqual(snapshotsBefore);
  }
  return { root, repository, source, storage, compiler, unchanged };
}

function mountFrom(args: readonly string[]) {
  return args[args.indexOf('-v') + 1]!;
}

function workFrom(args: readonly string[]) {
  return mountFrom(args).replace(/:\/workspace(?::Z)?$/, '');
}

async function output(args: readonly string[], content = '<urn:public> <urn:compiled> <urn:ontology> .\n') {
  const rdf = join(workFrom(args), 'build/rdf');
  await mkdir(rdf, { recursive: true });
  await writeFile(join(rdf, 'compiled.ttl'), content);
  return { stdout: '', stderr: '' };
}

function artifact(key: string): SemanticArtifact {
  return { key, oml: `description <https://context-graph.dev/generated/${key}#> as generated {}` } as SemanticArtifact;
}

describe('isolated openCAESAR compiler workspace', () => {
  it.each(['linux', 'darwin', 'win32'] as const)('preserves %s arguments and labels only the Linux disposable copy', async os => {
    const f = await fixture();
    platform(os);
    runDocker.mockImplementation(async (command, args, cwd) => {
      const work = workFrom(args);
      expect(command).toBe('docker');
      expect(cwd).toBe(f.repository);
      expect(await lstat(work).then(stat => stat.isDirectory())).toBe(true);
      expect(dirname(dirname(work))).toBe(join(f.storage, 'work').replace(/\\/g, '/'));
      expect(work).not.toBe(f.source.replace(/\\/g, '/'));
      expect(mountFrom(args)).toBe(`${work}:/workspace${os === 'linux' ? ':Z' : ''}`);
      expect(args).toEqual(['run', '--rm', '--name', expect.stringMatching(/^weftlet-[a-f0-9-]{36}$/), ...(os === 'win32' ? [] : [
        '--user', '1234:5678', '--env', 'GRADLE_USER_HOME=/workspace/.gradle',
      ]), '-v', mountFrom(args), '-w', '/workspace', image, 'gradle', '--no-daemon', 'clean', 'oml2owl']);
      expect(await readFile(join(work, 'build.gradle'))).toEqual(await readFile(join(f.source, 'build.gradle')));
      await expect(lstat(join(work, 'build'))).rejects.toMatchObject({ code: 'ENOENT' });
      const generated = join(work, 'src/oml/context-graph.dev/generated');
      expect(await readFile(join(generated, 'public.oml'), 'utf8')).toBe(`${artifact('public').oml}\n`);
      expect(await readFile(join(generated, 'snapshot.oml'), 'utf8')).toContain('includes <https://context-graph.dev/generated/public#>');
      return output(args);
    });
    const result = await f.compiler().compile('logical-snapshot', [artifact('public')]);
    expect(result.rdfFiles).toEqual([join(result.root, 'compiled.ttl')]);
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(runDocker).toHaveBeenCalledTimes(1);
    expect(await readdir(join(f.storage, 'work'))).toEqual([]);
    await f.unchanged();
  });

  it('keeps concurrent compilations in distinct real copies, including the same logical snapshot', async () => {
    const f = await fixture();
    platform('linux');
    const workspaces: string[] = [];
    let release!: () => void;
    const bothEntered = new Promise<void>(resolve => { release = resolve; });
    runDocker.mockImplementation(async (_command, args) => {
      workspaces.push(workFrom(args));
      if (workspaces.length === 2) release();
      await bothEntered;
      const keys = (await readdir(join(workFrom(args), 'src/oml/context-graph.dev/generated'))).sort();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('snapshot.oml');
      expect(keys.some(key => key === 'first.oml' || key === 'second.oml')).toBe(true);
      return output(args);
    });
    const compiler = f.compiler();
    const results = await Promise.all([
      compiler.compile('same-logical-id', [artifact('first')]),
      compiler.compile('same-logical-id', [artifact('second')]),
    ]);
    expect(new Set(workspaces).size).toBe(2);
    expect(new Set(results.map(result => result.root)).size).toBe(2);
    for (const result of results) expect(await readFile(result.rdfFiles[0]!, 'utf8')).toContain('urn:compiled');
    expect(await readdir(join(f.storage, 'work'))).toEqual([]);
    expect(runDocker.mock.calls.every(([, args]) => mountFrom(args).endsWith(':/workspace:Z'))).toBe(true);
    await f.unchanged();
  });

  it('propagates compiler failure without modifying source or saved snapshot bytes', async () => {
    const f = await fixture();
    platform('linux');
    const failure = new Error('docker exited 1: public compiler failure');
    runDocker.mockRejectedValue(failure);
    await expect(f.compiler().compile('failed', [artifact('public')])).rejects.toBe(failure);
    expect(runDocker).toHaveBeenCalledTimes(1);
    expect(await readdir(join(f.storage, 'work'))).toEqual([]);
    await f.unchanged();
  });

  it.skipIf(nativePlatform === 'win32')('rejects a copied root symlink before generated writes or container execution', async () => {
    const f = await fixture();
    // Native Windows cp cannot reliably reproduce this symlink; its skip is not guard evidence.
    await symlink(f.source, join(f.repository, 'linked-ontology'), 'dir');
    platform('linux');
    await expect(f.compiler('linked-ontology').compile('symlink', [artifact('public')]))
      .rejects.toThrow('workspace must be a real directory');
    expect(runDocker).not.toHaveBeenCalled();
    const entries = await readdir(join(f.storage, 'work'));
    expect(entries).toEqual([]);
    await expect(lstat(join(f.source, 'src/oml/context-graph.dev/generated'))).rejects.toMatchObject({ code: 'ENOENT' });
    await f.unchanged();
  });
});

it.each(['rdf', 'opencaesar'] as const)('releases %s hydration scratch after repeat, downstream failure and cancellation', async backend => {
  const { traversalApplication, traversalFixture } = await import('./fixtures/traversal.js');
  const { ContextGraphHydrator } = await import('../src/application/hydrator.js');
  const f = await traversalFixture(); temporaryRoots.push(f.root);
  await mkdir(join(f.root, 'ontology'));
  await writeFile(join(f.root, 'ontology/build.gradle'), '// public fixture');
  await f.commit();
  const app = traversalApplication(f);
  if (backend === 'opencaesar') {
    vi.spyOn(OpenCaesarOntologyCompiler.prototype, 'checkReady').mockResolvedValue();
    runDocker.mockImplementation(async (_command, args) => output(args));
  }
  const compiler = backend === 'rdf' ? app.dependencies.ontologyCompiler
    : new OpenCaesarOntologyCompiler({ toolVersion: 'test', projectPath: 'ontology', containerImage: image }, f.root, app.storage);
  const dependencies = { ...app.dependencies, ontologyCompiler: compiler };
  const hydrator = new ContextGraphHydrator(dependencies);
  const request = { ref: 'HEAD', headName: 'default' };
  const first = await hydrator.hydrate(request);
  const repeat = await hydrator.hydrate(request);
  expect(repeat.snapshot.manifest.contentDigest).toBe(first.snapshot.manifest.contentDigest);
  const failing = new ContextGraphHydrator({ ...dependencies, invariantEvaluators: [{
    id: 'public', version: '1', async evaluate() { throw Error('forced post-compile failure'); },
  }] });
  await expect(failing.hydrate(request)).rejects.toThrow('forced post-compile failure');
  const controller = new AbortController();
  await expect(hydrator.hydrate({ ...request, signal: controller.signal, onProgress(event) {
    if (event.phase === 'compile-semantic-rdf') controller.abort();
  } })).rejects.toThrow(/cancelled/i);
  expect(await readdir(join(app.storage, 'work'))).toEqual([]);
  expect((await app.store.readHead('default'))?.manifest.contentDigest).toBe(first.snapshot.manifest.contentDigest);
  const exported = await compiler.compile('standalone', [], undefined, join(f.root, 'export'));
  expect(await readFile(exported.rdfFiles[0]!, 'utf8')).toBeTruthy();
  await expect(compiler.compile('standalone', [], undefined, exported.root)).rejects.toMatchObject({ code: 'EEXIST' });
  expect(await readdir(join(app.storage, 'work'))).toEqual([]);
});

it('retains the payload when the Docker CLI fails while its container still exists', async () => {
  const { compilerDockerQuery } = await import('../src/infrastructure/compiler-docker.js');
  const f = await fixture();
  runDocker.mockRejectedValueOnce(Error('client disconnected'));
  vi.mocked(compilerDockerQuery).mockResolvedValueOnce('public-daemon').mockResolvedValueOnce('public-daemon').mockResolvedValueOnce('live-container');
  await expect(f.compiler().compileDigest('failed', [])).rejects.toThrow('cleanup failed');
  expect(await readdir(join(f.storage, 'work'))).toHaveLength(1);
  await f.unchanged();
});

it('rejects explicit exports into another managed root', async () => {
  const { DirectRdfOntologyCompiler } = await import('../src/extraction/ontology.js');
  const { enableCacheCoordination } = await import('../src/storage/coordination/managed-root.js');
  const f = await fixture();
  const managed = join(f.root, 'other-cache'); await mkdir(managed);
  await enableCacheCoordination(managed, { acknowledgeQuiescence: true });
  await expect(new DirectRdfOntologyCompiler(f.storage).compile('public', [], undefined, join(managed,'unowned')))
    .rejects.toThrow('outside managed caches');
  await expect(lstat(join(managed, 'unowned'))).rejects.toMatchObject({ code:'ENOENT' });
});

it.skipIf(nativePlatform === 'win32')('refuses generated writes through a symlink inside the copied project', async () => {
  const f = await fixture();
  const outside = join(f.root, 'private'); await mkdir(outside);
  await mkdir(join(f.source, 'src/oml/context-graph.dev'));
  await symlink(outside, join(f.source, 'src/oml/context-graph.dev/generated'), 'dir');
  await expect(f.compiler().compileDigest('public', [])).rejects.toThrow(/symbolic links/);
  expect(await readdir(outside)).toEqual([]);
  expect(await readdir(join(f.storage, 'work'))).toEqual([]);
});
