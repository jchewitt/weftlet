import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { GitRepository } from './git.js';

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-git-entries-'));
  roots.push(root);
  const git = (...args: string[]) => execute('git', args, { cwd: root, encoding: 'utf8' });
  const input = (args: string[], content: string | Buffer) => new Promise<string>((resolve, reject) => {
    const child = execFile('git', args, { cwd: root, encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(error); else resolve(stdout.trim());
    });
    child.stdin!.end(content);
  });
  const commit = async () => {
    await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public committed tree');
    return (await git('rev-parse', 'HEAD')).stdout.trim();
  };
  await git('init', '--quiet');
  await writeFile(join(root, '.gitattributes'), '* -text\n');
  return { root, git, input, commit };
}

it('lists exact nested-relative directories, Unicode and whitespace paths with committed byte sizes', async () => {
  const { root, git, input, commit } = await fixture();
  const nested = join(root, 'apps', 'public');
  await mkdir(join(nested, 'docs', 'owner space'), { recursive: true });
  const content = '# Public café\r\n\r\nExact bytes.  \r\n';
  const path = 'docs/owner space/café notes.md';
  await writeFile(join(nested, path), content);
  await writeFile(join(root, 'outside.md'), '# Outside nested scope\n');
  await git('add', '.');
  const blob = await input(['hash-object', '-w', '--stdin'], 'Public indexed-only source\n');
  // Index plumbing avoids creating Windows-incompatible filesystem names or needing a checkout.
  for (const name of ['tab\tname.md', 'line\nname.md']) {
    await git('update-index', '--add', '--cacheinfo', `100644,${blob},apps/public/docs/${name}`);
  }
  const sha = await commit();
  const repository = new GitRepository(nested);
  const entries = await repository.listEntriesAt(sha);
  expect(entries.map(entry => entry.path)).toEqual([
    'docs', 'docs/line\nname.md', 'docs/owner space', path, 'docs/tab\tname.md',
  ]);
  expect(entries.filter(entry => entry.type === 'tree')).toEqual([
    expect.objectContaining({ path: 'docs', mode: '040000', type: 'tree' }),
    expect.objectContaining({ path: 'docs/owner space', mode: '040000', type: 'tree' }),
  ]);
  expect(entries.filter(entry => entry.type === 'tree').every(entry => !('size' in entry))).toBe(true);
  const source = entries.find(entry => entry.path === path)!;
  expect(source).toMatchObject({ mode: '100644', type: 'blob', size: Buffer.byteLength(content) });
  expect(source.objectId).toMatch(/^[a-f0-9]{40,64}$/);
  expect(entries.find(entry => entry.path === 'docs/tab\tname.md')).toMatchObject({
    objectId: blob, size: Buffer.byteLength('Public indexed-only source\n'),
  });
  expect(await repository.readFileAt(sha, path)).toBe(content);
  const whole = await new GitRepository(root).listEntriesAt(sha);
  expect(whole.some(entry => entry.path === 'outside.md')).toBe(true);
  expect(whole.some(entry => entry.path === `apps/public/${path}`)).toBe(true);
});

it('distinguishes regular and executable blobs, symlink blobs and gitlinks without following them', async () => {
  const { root, git, input, commit } = await fixture();
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'docs', 'owner.md'), '# Public owner\n');
  await git('add', '.');
  const base = await commit();
  const target = '../outside-secret.md';
  const symlink = await input(['hash-object', '-w', '--stdin'], target);
  const script = await input(['hash-object', '-w', '--stdin'], '#!/bin/sh\nexit 0\n');
  await git('update-index', '--add', '--cacheinfo', `120000,${symlink},docs/link.md`);
  await git('update-index', '--add', '--cacheinfo', `100755,${script},docs/script.sh`);
  await git('update-index', '--add', '--cacheinfo', `160000,${base},docs/vendor`);
  const sha = await commit();
  const entries = await new GitRepository(root).listEntriesAt(sha);
  expect(entries.find(entry => entry.path === 'docs/link.md')).toEqual({
    path: 'docs/link.md', mode: '120000', type: 'blob', objectId: symlink, size: Buffer.byteLength(target),
  });
  expect(entries.find(entry => entry.path === 'docs/script.sh')).toMatchObject({
    mode: '100755', type: 'blob', objectId: script, size: Buffer.byteLength('#!/bin/sh\nexit 0\n'),
  });
  expect(entries.find(entry => entry.path === 'docs/vendor')).toEqual({
    path: 'docs/vendor', mode: '160000', type: 'commit', objectId: base,
  });
  expect(entries.some(entry => entry.path.startsWith('docs/vendor/'))).toBe(false);
});

it('reads historical entries without changing staged/working bytes or the active index', async () => {
  const { root, git, commit } = await fixture();
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'docs', 'owner.md'), '# Before\n');
  await git('add', '.');
  const before = await commit();
  await git('mv', 'docs/owner.md', 'docs/renamed.md');
  const after = await commit();
  await writeFile(join(root, 'docs', 'renamed.md'), '# Staged draft\n');
  await git('add', 'docs/renamed.md');
  await writeFile(join(root, 'docs', 'renamed.md'), '# Working draft\n');
  await writeFile(join(root, 'docs', 'untracked.md'), '# Untracked draft\n');
  const index = await readFile(join(root, '.git', 'index'));
  const status = (await git('--no-optional-locks', 'status', '--porcelain=v1', '-z')).stdout;
  const repository = new GitRepository(root);
  const historical = await repository.listEntriesAt(before);
  const current = await repository.listEntriesAt(after);
  expect(historical.find(entry => entry.path === 'docs/owner.md')?.size).toBe(Buffer.byteLength('# Before\n'));
  expect(historical.some(entry => entry.path === 'docs/renamed.md')).toBe(false);
  expect(current.find(entry => entry.path === 'docs/renamed.md')?.size).toBe(Buffer.byteLength('# Before\n'));
  expect(current.some(entry => entry.path === 'docs/untracked.md')).toBe(false);
  expect(await readFile(join(root, '.git', 'index'))).toEqual(index);
  expect(await readFile(join(root, 'docs', 'renamed.md'), 'utf8')).toBe('# Working draft\n');
  expect((await git('--no-optional-locks', 'status', '--porcelain=v1', '-z')).stdout).toBe(status);
});

it.each(['invalid UTF-8 path', 'duplicate path'])(
  'rejects a committed tree with an %s instead of losing or merging entries', async defect => {
    const { root, input } = await fixture();
    const blob = await input(['hash-object', '-w', '--stdin'], '# Public fixture\n');
    const entry = (path: Buffer) => Buffer.concat([
      Buffer.from('100644 '), path, Buffer.from([0]), Buffer.from(blob, 'hex'),
    ]);
    const rawTree = defect === 'invalid UTF-8 path'
      ? entry(Buffer.from([0xff, 0x2e, 0x6d, 0x64]))
      : Buffer.concat([entry(Buffer.from('owner.md')), entry(Buffer.from('owner.md'))]);
    // Store only Git objects: no checkout or OS-dependent invalid filename is created.
    const tree = await input(['hash-object', '--literally', '-t', 'tree', '-w', '--stdin'], rawTree);
    const commit = await input(['hash-object', '-t', 'commit', '-w', '--stdin'],
      `tree ${tree}\nauthor Fixture <fixture@example.invalid> 1 +0000\n` +
      'committer Fixture <fixture@example.invalid> 1 +0000\n\nPublic malformed tree fixture\n');
    await expect(new GitRepository(root).listEntriesAt(commit)).rejects.toThrow(
      defect === 'invalid UTF-8 path' ? 'not valid UTF-8' : 'Malformed Git tree entry mode, size or path');
  });
