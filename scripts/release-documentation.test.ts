import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import {
  checkPackedReleaseDocumentation,
  checkReleaseDocumentation,
  renderReleaseDocumentation,
  updateReleaseDocumentation,
} from './release-documentation.mjs';

const execute = promisify(execFile);
const roots: string[] = [];
const generatedPaths = ['README.md', 'packages/core/README.md', 'docs/RELEASING.md'];
const operationalPaths = ['docs/MIGRATING-TO-WEFTLET.md', 'docs/CONSUMER-TRIAL.md'];
const start = '<!-- weftlet:release:start -->';
const end = '<!-- weftlet:release:end -->';
const history = '\n## Historical evidence\nVersion 0.1.0 introduced this feature.\n' +
  '\n```sh weftlet-history\nnpm install @weftlet/toolkit@0.1.0\n```\n' +
  '\n```sh\ngit switch --detach "@weftlet/toolkit@0.1.0"\n```\n';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const versions = (version = '0.5.0') => [
  { name: '@weftlet/core', version }, { name: '@weftlet/toolkit', version },
];

async function setVersions(root: string, version: string) {
  for (const [path, name] of [['packages/core/package.json', '@weftlet/core'],
    ['package.json', '@weftlet/toolkit']]) {
    await writeFile(join(root, path), JSON.stringify({ name, version,
      ...(name.endsWith('/toolkit') ? { dependencies: { '@weftlet/core': 'workspace:^' },
        bin: { weftlet: 'dist/cli.js', toolkit: 'dist/cli.js' } } : {}) }) + '\n');
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-release-docs-'));
  roots.push(root);
  await mkdir(join(root, 'packages/core'), { recursive: true });
  await mkdir(join(root, 'docs'));
  await setVersions(root, '0.5.0');
  for (const path of generatedPaths) {
    await writeFile(join(root, path), '# Public fixture\n\n' +
      renderReleaseDocumentation(path, versions()) + history);
  }
  for (const path of operationalPaths) {
    await writeFile(join(root, path), '# Public setup\n\n```sh\nnpm install --save-dev @weftlet/toolkit\n```\n');
  }
  return root;
}

async function replace(root: string, path: string, transform: (text: string) => string) {
  const target = join(root, path);
  await writeFile(target, transform(await readFile(target, 'utf8')));
}

type Archive = { name: string; version: string; filename: string; path: string };
type PackedChange = (name: string, directory: string) => Promise<void>;

async function pack(root: string, change?: PackedChange): Promise<Archive[]> {
  const destination = await mkdtemp(join(root, 'archives-'));
  const result: Archive[] = [];
  for (const { name, version } of versions()) {
    const short = name.split('/')[1]!;
    const stage = join(destination, short);
    const packed = join(stage, 'package');
    await mkdir(packed, { recursive: true });
    const prefix = short === 'core' ? 'packages/core/' : '';
    await cp(join(root, prefix, 'README.md'), join(packed, 'README.md'));
    const manifest = JSON.parse(await readFile(join(root, prefix, 'package.json'), 'utf8'));
    if (short === 'toolkit') {
      manifest.dependencies['@weftlet/core'] = '^0.5.0';
      for (const path of ['docs/RELEASING.md', ...operationalPaths]) {
        await mkdir(dirname(join(packed, path)), { recursive: true });
        await cp(join(root, path), join(packed, path));
      }
    }
    await writeFile(join(packed, 'package.json'), JSON.stringify(manifest) + '\n');
    await change?.(name, packed);
    const filename = `weftlet-${short}-${version}.tgz`;
    const path = join(destination, filename);
    await execute('tar', ['-czf', path, '-C', stage, 'package']);
    result.push({ name, version, filename, path });
  }
  return result;
}

it('returns constrained current setup commands and exact archive names from checked documentation', async () => {
  const root = await fixture();
  const checked = await checkReleaseDocumentation(root);
  expect(checked).toMatchObject({
    npxCommands: [['@weftlet/toolkit@0.5.0', 'init', '--yes'],
      ['@weftlet/toolkit@0.5.0', 'config', 'validate']],
    archiveNames: ['weftlet-core-0.5.0.tgz', 'weftlet-toolkit-0.5.0.tgz'],
  });
  expect(await readFile(join(root, 'README.md'), 'utf8')).toContain('@weftlet/toolkit@0.5.0');
  expect(await readFile(join(root, 'packages/core/README.md'), 'utf8')).toContain('@weftlet/core@0.5.0');
});

it('runs the publish-job documentation check with only Node and its two scripts installed', async () => {
  const root = await fixture();
  await mkdir(join(root, 'scripts'));
  for (const file of ['release-documentation.mjs', 'release-plan.mjs']) {
    await cp(new URL(file, import.meta.url), join(root, 'scripts', file));
  }
  await expect(readFile(join(root, 'node_modules/package.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  await execute(process.execPath, [join(root, 'scripts/release-documentation.mjs'), '--check'], { cwd: tmpdir() });
  await replace(root, 'README.md', text => text.replace('@weftlet/toolkit@0.5.0', '@weftlet/toolkit@0.1.0'));
  await expect(execute(process.execPath, [join(root, 'scripts/release-documentation.mjs'), '--check'],
    { cwd: tmpdir() })).rejects.toThrow();
});

it('requires regeneration after a version bump and preserves historical evidence outside the blocks', async () => {
  const root = await fixture();
  await setVersions(root, '1.0.0');
  await expect(checkReleaseDocumentation(root)).rejects.toThrow();
  await updateReleaseDocumentation(root);
  expect(await checkReleaseDocumentation(root)).toMatchObject({
    npxCommands: [['@weftlet/toolkit@1.0.0', 'init', '--yes'],
      ['@weftlet/toolkit@1.0.0', 'config', 'validate']],
    archiveNames: ['weftlet-core-1.0.0.tgz', 'weftlet-toolkit-1.0.0.tgz'],
  });
  for (const path of generatedPaths) {
    const text = await readFile(join(root, path), 'utf8');
    expect(text.startsWith('# Public fixture\n\n')).toBe(true);
    expect(text.endsWith(history)).toBe(true);
    expect(text).not.toContain('weftlet-toolkit-0.5.0.tgz');
  }
});

it('checks CRLF documents and preserves their line endings and historical bytes during regeneration', async () => {
  const root = await fixture();
  for (const path of generatedPaths) await replace(root, path, text => text.replace(/\r?\n/g, '\r\n'));
  await expect(checkReleaseDocumentation(root)).resolves.toBeDefined();
  await setVersions(root, '0.5.1');
  await updateReleaseDocumentation(root);
  await expect(checkReleaseDocumentation(root)).resolves.toBeDefined();
  for (const path of generatedPaths) {
    const text = await readFile(join(root, path), 'utf8');
    expect(text).not.toMatch(/(?<!\r)\n/);
    expect(text.endsWith(history.replaceAll('\n', '\r\n'))).toBe(true);
  }
});

it('allows prose naming the generation markers while still validating the actual HTML block', async () => {
  const root = await fixture();
  const explanation = '\nThe updater manages `weftlet:release:start` and `weftlet:release:end` markers.\n';
  await replace(root, 'docs/RELEASING.md', text => explanation + text);
  await expect(checkReleaseDocumentation(root)).resolves.toBeDefined();
  await setVersions(root, '0.5.1');
  await updateReleaseDocumentation(root);
  expect((await readFile(join(root, 'docs/RELEASING.md'), 'utf8')).startsWith(explanation)).toBe(true);
  await expect(checkReleaseDocumentation(root)).resolves.toBeDefined();
});

it.each([
  ['missing start', (text: string) => text.replace(start, '')],
  ['missing end', (text: string) => text.replace(end, '')],
  ['duplicate start', (text: string) => text.replace(start, start + '\n' + start)],
  ['duplicate end', (text: string) => text.replace(end, end + '\n' + end)],
  ['reversed markers', (text: string) => text.replace(start, 'TEMP').replace(end, start).replace('TEMP', end)],
])('rejects %s instead of silently replacing unrelated documentation', async (_label, corrupt) => {
  const root = await fixture();
  await replace(root, 'README.md', corrupt);
  const before = await readFile(join(root, 'README.md'));
  await expect(checkReleaseDocumentation(root)).rejects.toThrow();
  await expect(updateReleaseDocumentation(root)).rejects.toThrow();
  expect(await readFile(join(root, 'README.md'))).toEqual(before);
});

it.each([
  ['stale toolkit pin', 'npx --yes @weftlet/toolkit@0.2.1 init --yes'],
  ['stale core pin', 'npm install @weftlet/core@0.4.0'],
  ['unknown package', 'npm install @weftlet/cli@0.5.0'],
  ['stale toolkit archive', 'npm install "/tmp/weftlet-toolkit-0.4.0.tgz"'],
  ['stale core archive', 'npm install "/tmp/weftlet-core-0.4.0.tgz"'],
  ['incorrect archive name', 'npm install "/tmp/weftlet-cli-0.5.0.tgz"'],
])('rejects a %s in active setup examples outside generated blocks', async (_label, command) => {
  const root = await fixture();
  await writeFile(join(root, 'docs/MIGRATING-TO-WEFTLET.md'), '# Current setup\n\n```sh\n' + command + '\n```\n');
  await expect(checkReleaseDocumentation(root)).rejects.toThrow();
});

it('checks inline install commands while retaining feature introductions and explicit historical commands', async () => {
  const root = await fixture();
  await writeFile(join(root, 'docs/CONSUMER-TRIAL.md'),
    'Version 0.2.0 introduced this capability.\nUse `npm install @weftlet/toolkit@0.5.0`.\n' + history);
  await expect(checkReleaseDocumentation(root)).resolves.toBeDefined();
  await replace(root, 'docs/CONSUMER-TRIAL.md', text => text.replace('npm install @weftlet/toolkit@0.5.0',
    'npm install @weftlet/toolkit@0.2.0'));
  await expect(checkReleaseDocumentation(root)).rejects.toThrow();
});

it.each([['sh', '\\'], ['powershell', '`']])('checks continued %s installation commands', async (language, continuation) => {
  const root = await fixture();
  const path = 'docs/CONSUMER-TRIAL.md';
  await writeFile(join(root, path), `# Current setup\n\n\`\`\`${language}\nnpm install ${continuation}\n` +
    '  @weftlet/toolkit@0.5.0\n```\n');
  await expect(checkReleaseDocumentation(root)).resolves.toBeDefined();
  await replace(root, path, text => text.replace('@weftlet/toolkit@0.5.0', '@weftlet/toolkit@0.2.1'));
  await expect(checkReleaseDocumentation(root)).rejects.toThrow();
});

it('rejects a wrong package scope or arbitrary command injected into the generated instructions', async () => {
  const root = await fixture();
  const path = 'docs/RELEASING.md';
  const original = await readFile(join(root, path), 'utf8');
  for (const text of [original.replaceAll('@weftlet/toolkit@0.5.0', '@unexpected/toolkit@0.5.0'),
    original.replace('init --yes', 'init --yes; echo unexpected')]) {
    await writeFile(join(root, path), text);
    await expect(checkReleaseDocumentation(root)).rejects.toThrow();
  }
});

it('checks the actual tarball pair and exposes the same checked installation examples', async () => {
  const root = await fixture();
  const archives = await pack(root);
  expect(await checkPackedReleaseDocumentation(root, archives)).toMatchObject({
    npxCommands: [['@weftlet/toolkit@0.5.0', 'init', '--yes'],
      ['@weftlet/toolkit@0.5.0', 'config', 'validate']],
    archiveNames: ['weftlet-core-0.5.0.tgz', 'weftlet-toolkit-0.5.0.tgz'],
  });
});

it.each(['@weftlet/core', '@weftlet/toolkit'])('rejects stale packed README content for %s even when source passes', async name => {
  const root = await fixture();
  await expect(checkReleaseDocumentation(root)).resolves.toBeDefined();
  const archives = await pack(root, async (actual, directory) => {
    if (actual === name) await replace(directory, 'README.md', text => text.replaceAll('0.5.0', '0.4.0'));
  });
  await expect(checkPackedReleaseDocumentation(root, archives)).rejects.toThrow();
});

it('rejects different packed prose outside a valid generated block', async () => {
  const root = await fixture();
  const archives = await pack(root, async (name, directory) => {
    if (name.endsWith('/toolkit')) await replace(directory, 'docs/RELEASING.md', text => text + '\nUnreviewed instruction.\n');
  });
  await expect(checkPackedReleaseDocumentation(root, archives)).rejects.toThrow();
});

it('accepts equivalent packed LF documentation from a CRLF checkout', async () => {
  const root = await fixture();
  for (const path of [...generatedPaths, ...operationalPaths]) {
    await replace(root, path, text => text.replace(/\r?\n/g, '\r\n'));
  }
  const archives = await pack(root, async (name, directory) => {
    const paths = name.endsWith('/core') ? ['README.md'] : ['README.md', 'docs/RELEASING.md', ...operationalPaths];
    for (const path of paths) await replace(directory, path, text => text.replaceAll('\r\n', '\n'));
  });
  await expect(checkPackedReleaseDocumentation(root, archives)).resolves.toBeDefined();
});

it.each(['README.md', 'docs/RELEASING.md', 'docs/MIGRATING-TO-WEFTLET.md', 'docs/CONSUMER-TRIAL.md'])(
  'rejects a toolkit tarball missing required %s', async path => {
    const root = await fixture();
    const archives = await pack(root, async (name, directory) => {
      if (name.endsWith('/toolkit')) await rm(join(directory, path));
    });
    await expect(checkPackedReleaseDocumentation(root, archives)).rejects.toThrow();
  });

it.each([
  ['different package identity', (manifest: any) => { manifest.name = '@weftlet/other'; }],
  ['different package version', (manifest: any) => { manifest.version = '0.4.0'; }],
  ['stale core dependency', (manifest: any) => { manifest.dependencies['@weftlet/core'] = '^0.4.0'; }],
])('rejects packed metadata with %s', async (_label, mutate) => {
  const root = await fixture();
  const archives = await pack(root, async (name, directory) => {
    if (name.endsWith('/toolkit')) {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      mutate(manifest);
      await writeFile(join(directory, 'package.json'), JSON.stringify(manifest));
    }
  });
  await expect(checkPackedReleaseDocumentation(root, archives)).rejects.toThrow();
});

it('rejects missing, duplicate and mismatched prepared archive identities', async () => {
  const root = await fixture();
  const archives = await pack(root);
  for (const invalid of [archives.slice(0, 1), [archives[0], archives[0]],
    [archives[0], { ...archives[1], filename: 'weftlet-toolkit-0.4.0.tgz' }],
    [archives[0], { ...archives[1], version: '0.4.0' }]]) {
    await expect(checkPackedReleaseDocumentation(root, invalid)).rejects.toThrow();
  }
});
