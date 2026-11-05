import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { OpenCaesarOntologyCompiler } from '../src/extraction/ontology.js';

async function docker(args: string[]) {
  const result = await promisify(execFile)('docker', args, {
    encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024,
  });
  return result.stdout.trim();
}

// Opt in only on an actual enforcing SELinux host with a responsive Linux Docker engine.
// A Fedora container on a non-SELinux host cannot establish this boundary.
it.runIf(process.env.WEFTLET_SELINUX_INTEGRATION === '1')(
  'compiles the public ontology with real Docker while SELinux remains enforcing',
  async () => {
    expect(process.platform).toBe('linux');
    const enforcing = () => readFile('/sys/fs/selinux/enforce', 'utf8');
    expect((await enforcing()).trim()).toBe('1');
    // DOCKER_CONTEXT overrides DOCKER_HOST. Reject remote daemons: this host's enforcing
    // flag cannot establish the remote host's policy, even when its daemon supports labels.
    const contextName = process.env.DOCKER_CONTEXT || await docker(['context', 'show']);
    const context = JSON.parse(await docker(['context', 'inspect', contextName]));
    const endpoint = !process.env.DOCKER_CONTEXT && process.env.DOCKER_HOST
      ? process.env.DOCKER_HOST : context[0]?.Endpoints?.docker?.Host;
    expect(endpoint, 'Use the enforcing host\'s local Unix-socket Docker daemon').toMatch(/^unix:\/\//);
    const securityOptions: string[] = JSON.parse(await docker(['info', '--format', '{{json .SecurityOptions}}']));
    expect(securityOptions).toContain('name=selinux');
    const repository = resolve(import.meta.dirname, '../examples/generic-typescript');
    const sourceFiles = ['ontology/build.gradle', 'ontology/catalog.xml'];
    const before = await Promise.all(sourceFiles.map(path => readFile(join(repository, path))));
    const storage = await mkdtemp(join(tmpdir(), 'weftlet-selinux-integration-'));
    try {
      const compiler = new OpenCaesarOntologyCompiler({
        toolVersion: 'oml2owl-gradle-2.13.1', projectPath: 'ontology',
        containerImage: 'gradle:8.10.2-jdk21@sha256:963d59f7f22767da4efbcf46b661361b61af5fb88b0309da1071c4234c647eba',
      }, repository, storage);
      const result = await compiler.compile('public-enforcing-selinux', []);
      expect(result.rdfFiles.length).toBeGreaterThan(0);
      expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
      const work = dirname(dirname(result.root));
      expect(dirname(work)).toBe(join(storage, 'work'));
      expect((await lstat(work)).isDirectory()).toBe(true);
      expect((await enforcing()).trim()).toBe('1');
      expect(JSON.parse(await docker(['info', '--format', '{{json .SecurityOptions}}']))).toContain('name=selinux');
      expect(await Promise.all(sourceFiles.map(path => readFile(join(repository, path))))).toEqual(before);
    } finally {
      await rm(storage, { recursive: true, force: true });
    }
  },
  180_000,
);
