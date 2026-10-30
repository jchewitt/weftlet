import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGitLineEndingReader } from '../git-content.mjs';
import { readCommittedInputs } from './committed-inputs.mjs';

const directory = 'evaluations/code-graph';
const lockPath = `${directory}/inputs.lock.json`;
const hash = value => createHash('sha256').update(value).digest('hex');
const generated = path => path.split('/').some(part => ['.context-graph', 'node_modules', 'dist'].includes(part));
const fail = message => { throw new Error(message); };
const unique = (values, name) => new Set(values).size === values.length || fail(`Duplicate ${name}`);

export function safePath(path) {
  if (typeof path !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(path) ||
    path.split('/').some(part => !part || ['.', '..', '.git'].includes(part))) fail(`Unsafe input path: ${path}`);
  return path;
}

function singleIndex(content, needle, name) {
  if (typeof needle !== 'string' || !needle.length) fail(`Empty anchor: ${name}`);
  const index = content.indexOf(needle);
  if (index < 0 || content.indexOf(needle, index + 1) >= 0) fail(`Missing or ambiguous anchor: ${name}`);
  return index;
}

/** Validate labels against input bytes, without running an indexer or scoring its output. */
export function validateLabels(protocol, suite, read) {
  if (protocol.schemaVersion !== 1 || suite.schemaVersion !== 1) fail('Unknown study schema');
  const locations = {};
  for (const [id, anchor] of Object.entries(suite.anchors)) {
    const content = read(safePath(anchor.path)).toString('utf8');
    const offset = singleIndex(content, anchor.text, id) + singleIndex(anchor.text, anchor.token, id);
    locations[id] = { path: anchor.path, line: content.slice(0, offset).split('\n').length,
      column: offset - content.lastIndexOf('\n', offset - 1), length: anchor.token.length };
  }
  const anchor = id => Object.hasOwn(locations, id) || fail(`Unknown anchor: ${id}`);
  for (const [id, declarations] of Object.entries(suite.entities)) {
    if (!Array.isArray(declarations) || declarations.length === 0) fail(`No declarations: ${id}`);
    unique(declarations, `declaration for ${id}`);
    declarations.forEach(anchor);
  }
  unique(suite.cases.map(value => value.id), 'case ID');
  unique(suite.cases.map(value => JSON.stringify([value.track, value.from, value.to])), 'case pair');
  for (const value of suite.cases) {
    anchor(value.from);
    if (!Object.hasOwn(suite.entities, value.to)) fail(`Unknown entity: ${value.to}`);
    if (!['definition', 'reference', 'call'].includes(value.track) || !['present', 'absent'].includes(value.expected)) {
      fail(`Invalid case: ${value.id}`);
    }
  }
  unique(suite.gaps.map(value => value.id), 'gap ID');
  suite.gaps.forEach(value => anchor(value.from));
  unique(protocol.corpora.map(value => value.id), 'corpus ID');
  for (const corpus of protocol.corpora) {
    safePath(corpus.root);
    unique(corpus.materializeSupport.map(value => value.to), 'materialized support path');
    for (const support of corpus.materializeSupport) {
      read(safePath(support.from));
      safePath(support.to);
    }
  }
  unique(protocol.scenarios.map(value => value.id), 'scenario ID');
  for (const scenario of protocol.scenarios) {
    const corpus = protocol.corpora.find(value => value.id === scenario.corpus);
    if (!corpus && scenario.corpus !== 'all') fail(`Unknown corpus: ${scenario.corpus}`);
    for (const operation of scenario.operations) {
      if (!corpus) fail('Mutations require a single corpus');
      const path = `${safePath(corpus.root)}/${safePath(operation.path)}`;
      const content = read(path).toString('utf8');
      if (operation.kind === 'replace') singleIndex(content, operation.before, `${scenario.id}:${path}`);
      else if (operation.kind === 'rename') {
        const to = `${corpus.root}/${safePath(operation.to)}`;
        if (to === path) fail('Rename must change path');
        let exists = true;
        try { read(to); } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error; }
        if (exists) fail(`Rename destination exists: ${to}`);
      } else if (operation.kind !== 'delete') fail(`Unknown operation: ${operation.kind}`);
    }
  }
  return locations;
}

export function checkStudy(root, ref) {
  const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  if (ref && (!/^[a-f0-9]{40}$/.test(ref) || git(['rev-parse', `${ref}^{commit}`]).toString().trim() !== ref)) {
    fail('--ref requires a complete immutable commit SHA');
  }
  // One tree read, the inventory, then a single batch for its regular blobs.
  const entries = new Map(ref ? git(['ls-tree', '-r', '-z', ref]).toString().split('\0').filter(Boolean).map(entry => {
    const separator = entry.indexOf('\t');
    return [entry.slice(separator + 1), entry.slice(0, separator)];
  }) : []);
  const contents = new Map();
  const normalize = createGitLineEndingReader(root);
  const read = path => {
    safePath(path);
    if (contents.has(path)) return contents.get(path);
    let bytes;
    if (ref) {
      const entry = entries.get(path);
      if (!entry) throw Object.assign(new Error(`Missing committed input: ${path}`), { code: 'ENOENT' });
      if (!/^100(644|755) blob /.test(entry)) fail(`Input is not a regular blob: ${path}`);
      bytes = git(['show', `${ref}:${path}`]);
    } else {
      let current = root;
      for (const part of path.split('/')) {
        current = join(current, part);
        if (lstatSync(current).isSymbolicLink()) fail(`Symlink input: ${path}`);
      }
      bytes = normalize(path, readFileSync(join(root, path)));
    }
    if (bytes.length > 1024 * 1024) fail(`Oversized input: ${path}`);
    contents.set(path, bytes);
    return bytes;
  };
  const list = path => {
    safePath(path);
    if (generated(path)) return [];
    if (ref) return [...entries.keys()].filter(entry =>
      (entry === path || entry.startsWith(`${path}/`)) && !generated(entry));
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) fail(`Symlink input: ${path}`);
    if (stat.isFile()) return [path];
    if (!stat.isDirectory()) fail(`Unsupported input: ${path}`);
    return readdirSync(join(root, path)).flatMap(name => list(`${path}/${name}`));
  };
  const lock = JSON.parse(read(lockPath));
  if (lock.schemaVersion !== 1 || !Array.isArray(lock.inputs)) fail('Invalid freeze inventory');
  const paths = lock.inputs.map(input => safePath(input.path));
  if (paths.some(generated)) fail('Generated output cannot be a frozen input');
  unique(paths, 'frozen input');
  if (lock.digest !== hash(JSON.stringify(lock.inputs))) fail('Freeze inventory digest differs');
  if (ref) for (const [path, bytes] of readCommittedInputs(root, entries, paths)) contents.set(path, bytes);
  for (const input of lock.inputs) {
    if (hash(read(input.path)) !== input.sha256) fail(`Frozen input changed: ${input.path}`);
  }
  const protocol = JSON.parse(read(`${directory}/protocol.json`));
  const actualPaths = [...new Set([directory, ...protocol.corpora.map(value => value.root),
    ...protocol.supportFiles].flatMap(list).filter(path => path !== lockPath))].sort();
  if (JSON.stringify(paths) !== JSON.stringify(actualPaths)) fail('Freeze inventory has missing or extra inputs');
  const suite = JSON.parse(read(`${directory}/cases.json`));
  const locations = validateLabels(protocol, suite, read);
  return { status: 'verified-inputs-only', commit: ref ?? null, digest: lock.digest,
    files: paths.length, cases: suite.cases.length, gaps: suite.gaps.length, anchors: Object.keys(locations).length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--ref')) fail('Usage: check.mjs [--ref FULL_COMMIT_SHA]');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  console.log(JSON.stringify(checkStudy(root, args[1])));
}
