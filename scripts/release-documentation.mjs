import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { packageVersions, stableVersion } from './release-plan.mjs';

const start = '<!-- weftlet:release:start -->';
const end = '<!-- weftlet:release:end -->';
const generatedPaths = ['README.md', 'packages/core/README.md', 'docs/RELEASING.md'];
const checkedPaths = [...generatedPaths, 'docs/MIGRATING-TO-WEFTLET.md', 'docs/CONSUMER-TRIAL.md'];
const shellLanguages = new Set(['sh', 'bash', 'shell', 'zsh', 'console', 'shell-session', 'powershell', 'ps1', 'cmd', 'bat']);
const execute = promisify(execFile);
const normalize = text => text.replaceAll('\r\n', '\n');
const archiveName = (name, version) => `${name.slice(1).replace('/', '-')}-${version}.tgz`;

function versionMap(versions) {
  if (!Array.isArray(versions) || versions.length !== 2 ||
      new Set(versions.map(item => item?.name)).size !== 2 ||
      versions.some(item => !['@weftlet/core', '@weftlet/toolkit'].includes(item?.name) || !stableVersion(item?.version)) ||
      new Set(versions.map(item => item.version)).size !== 1) {
    throw new Error('Release documentation requires matching core/toolkit package versions');
  }
  return Object.fromEntries(versions.map(item => [item.name, item.version]));
}

export function renderReleaseDocumentation(path, versions) {
  const current = versionMap(versions);
  const core = current['@weftlet/core'];
  const toolkit = current['@weftlet/toolkit'];
  let body;
  if (path === 'README.md') {
    body = `Package versions in this checkout/archive: \`@weftlet/toolkit@${toolkit}\` and \`@weftlet/core@${core}\`.`;
  } else if (path === 'packages/core/README.md') {
    body = `Package version in this checkout/archive: \`@weftlet/core@${core}\`. The matching toolkit is \`@weftlet/toolkit@${toolkit}\`.`;
  } else if (path === 'docs/RELEASING.md') {
    body = `These instructions use the package versions in this checkout/archive, not a claim about npm's latest tag.\n\n` +
      `Verify the matching public version in a fresh disposable project after publication:\n\n` +
      `\`\`\`sh\nnpm init -y\nnpx --yes @weftlet/toolkit@${toolkit} init --yes\nnpx --yes @weftlet/toolkit@${toolkit} config validate\n\`\`\`\n\n` +
      `For local installation, use both prepared archives from the same reviewed release:\n\n` +
      `\`\`\`sh\nnpm install --save-dev "/path/to/weftlet/.release/${archiveName('@weftlet/core', core)}" ` +
      `"/path/to/weftlet/.release/${archiveName('@weftlet/toolkit', toolkit)}"\n\`\`\``;
  } else {
    throw new Error(`Unknown generated release-documentation path: ${path}`);
  }
  return `${start}\n${body}\n${end}`;
}

function section(text, path) {
  const starts = [...text.matchAll(/<!-- weftlet:release:start -->/g)];
  const ends = [...text.matchAll(/<!-- weftlet:release:end -->/g)];
  if (starts.length !== 1 || ends.length !== 1 ||
      [...text.matchAll(/<!--\s*weftlet:release:/g)].length !== 2 || starts[0].index >= ends[0].index) {
    throw new Error(`${path}: missing, duplicate or malformed release-documentation markers`);
  }
  const from = starts[0].index;
  const to = ends[0].index + end.length;
  const lineStart = index => index === 0 || text[index - 1] === '\n';
  const lineEnd = index => index === text.length || text[index] === '\n' || text.slice(index, index + 2) === '\r\n';
  if (!lineStart(from) || !lineEnd(from + start.length) || !lineStart(ends[0].index) || !lineEnd(to)) {
    throw new Error(`${path}: release-documentation markers must occupy complete lines`);
  }
  return { from, to, text: text.slice(from, to) };
}

// Inspect only the documented install/exec command forms. This is not a shell interpreter.
function checkCommands(text, path, current) {
  const logical = normalize(text).replace(/\\\n/g, ' ').replace(/`\n/g, ' ');
  for (const line of logical.split('\n')) {
    if (!/^\s*(?:[$>]\s*)?(?:npx\b|npm\s+(?:(?:--?[\w-]+(?:=[^\s]+)?)\s+)*(?:i|install|add|exec)\b|pnpm\s+(?:add|install|dlx|exec)\b|yarn\s+(?:add|dlx)\b)/.test(line)) continue;
    for (const match of line.matchAll(/@weftlet\/([A-Za-z0-9][A-Za-z0-9._-]*)(?:@([^\s"'`\\;|&)\]]+))?/g)) {
      const name = `@weftlet/${match[1]}`;
      const pin = match[2];
      if (!Object.hasOwn(current, name)) throw new Error(`${path}: unknown Weftlet package in installation example: ${name}`);
      if (pin !== undefined && pin !== current[name] && pin !== '<version>') {
        throw new Error(`${path}: stale or unsupported package pin ${name}@${pin}; expected ${current[name]}`);
      }
    }
    for (const match of line.matchAll(/[^\s"'`]+\.tgz/g)) {
      const filename = match[0].replaceAll('\\', '/').split('/').at(-1);
      if (!filename.startsWith('weftlet-')) continue;
      const expected = Object.entries(current).flatMap(([name, version]) => [archiveName(name, version), archiveName(name, '<version>')]);
      if (!expected.includes(filename)) throw new Error(`${path}: stale or unknown Weftlet archive in installation example: ${filename}`);
    }
  }
}

function checkExamples(text, path, current) {
  let fence;
  let lines = [];
  for (const line of normalize(text).split('\n')) {
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence.character && close[1].length >= fence.length) {
        if (fence.active) checkCommands(lines.join('\n'), path, current);
        fence = undefined;
        lines = [];
      } else lines.push(line);
      continue;
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (open) {
      const info = open[2].trim();
      const language = info.split(/\s+/)[0];
      if (info.includes('weftlet-history') && info !== 'sh weftlet-history') {
        throw new Error(`${path}: historical installation fences must use exactly 'sh weftlet-history'`);
      }
      fence = { character: open[1][0], length: open[1].length, active: shellLanguages.has(language) && info !== 'sh weftlet-history' };
      continue;
    }
    for (const inline of line.matchAll(/(`+)(.*?)\1/g)) checkCommands(inline[2], path, current);
  }
  if (fence?.active) throw new Error(`${path}: unclosed shell installation fence`);
}

function validateDocuments(documents, versions) {
  const current = versionMap(versions);
  for (const path of generatedPaths) {
    if (normalize(section(documents.get(path), path).text) !== renderReleaseDocumentation(path, versions)) {
      throw new Error(`${path}: stale generated release documentation; run the release documentation updater`);
    }
  }
  for (const path of checkedPaths) checkExamples(documents.get(path), path, current);
  const release = normalize(section(documents.get('docs/RELEASING.md'), 'docs/RELEASING.md').text);
  // The exact generated section was validated above; return only its constrained command data.
  const npxCommands = release.split('\n').filter(line => line.startsWith('npx --yes ')).map(line => line.split(' ').slice(2));
  const archiveNames = [...release.matchAll(/"\/path\/to\/weftlet\/\.release\/([^"/]+\.tgz)"/g)].map(match => match[1]);
  return { npxCommands, archiveNames };
}

async function sourceDocuments(root) {
  return new Map(await Promise.all(checkedPaths.map(async path => [path, await readFile(join(root, path), 'utf8')])));
}

export async function checkReleaseDocumentation(root) {
  return validateDocuments(await sourceDocuments(root), await packageVersions(root));
}

export async function updateReleaseDocumentation(root) {
  const versions = await packageVersions(root);
  const documents = await sourceDocuments(root);
  const replacements = new Map();
  for (const path of generatedPaths) {
    const original = documents.get(path);
    const block = section(original, path);
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    const rendered = renderReleaseDocumentation(path, versions).replaceAll('\n', newline);
    const updated = original.slice(0, block.from) + rendered + original.slice(block.to);
    documents.set(path, updated);
    if (updated !== original) replacements.set(path, updated);
  }
  const examples = validateDocuments(documents, versions);
  for (const [path, content] of replacements) await writeFile(join(root, path), content);
  return examples;
}

export async function checkPackedReleaseDocumentation(root, archives) {
  const versions = await packageVersions(root);
  const current = versionMap(versions);
  const source = await sourceDocuments(root);
  validateDocuments(source, versions);
  if (!Array.isArray(archives) || archives.length !== versions.length ||
      new Set(archives.map(item => item?.name)).size !== versions.length) {
    throw new Error('Release documentation requires one archive for each core/toolkit package');
  }
  const packedDocuments = new Map();
  for (const archive of archives) {
    if (!Object.hasOwn(current, archive?.name) || archive.version !== current[archive.name] ||
        archive.filename !== archiveName(archive.name, archive.version) || typeof archive.path !== 'string' ||
        basename(archive.path) !== archive.filename) {
      throw new Error('Release archive identity/filename does not match package versions');
    }
    const member = async path => {
      try {
        return (await execute('tar', ['-xOf', resolve(archive.path), `package/${path}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })).stdout;
      } catch {
        throw new Error(`${archive.filename}: missing or unreadable packed ${path}`);
      }
    };
    const manifest = JSON.parse(await member('package.json'));
    if (manifest.name !== archive.name || manifest.version !== archive.version ||
        (archive.name === '@weftlet/toolkit' && manifest.dependencies?.['@weftlet/core'] !== `^${current['@weftlet/core']}`)) {
      throw new Error(`${archive.filename}: packed package metadata or core dependency differs from the release`);
    }
    const paths = archive.name === '@weftlet/core' ? ['packages/core/README.md'] : checkedPaths.filter(path => path !== 'packages/core/README.md');
    for (const path of paths) {
      const content = await member(path === 'packages/core/README.md' ? 'README.md' : path);
      if (normalize(content) !== normalize(source.get(path))) throw new Error(`${archive.filename}: packed ${path} differs from source documentation`);
      packedDocuments.set(path, content);
    }
  }
  return validateDocuments(packedDocuments, versions);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2] ?? '--check';
  const root = fileURLToPath(new URL('../', import.meta.url));
  (async () => {
    if (process.argv.length > 3 || !['--check', '--write'].includes(mode)) throw new Error('Use release-documentation.mjs [--check|--write]');
    await (mode === '--write' ? updateReleaseDocumentation(root) : checkReleaseDocumentation(root));
    console.log(`Release documentation ${mode === '--write' ? 'updated and checked' : 'checked'}`);
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
