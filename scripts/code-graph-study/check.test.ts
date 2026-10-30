import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { checkStudy, safePath, validateLabels } from './check.mjs';
import { createGitLineEndingReader } from '../git-content.mjs';
import { loadConfig } from '../../src/configuration/config.js';
import { decodeCommittedInputs } from './committed-inputs.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const study = 'evaluations/code-graph';
const normalize = createGitLineEndingReader(root);
// These public source inputs never change during this suite. Each disposable repository's
// actual checks still read fresh bytes, including every dirty/CRLF/forged-inventory negative.
const inputs = new Map<string, Buffer>();
const read = (path: string) => {
  if (!inputs.has(path)) inputs.set(path, normalize(path, readFileSync(join(root, path))));
  return inputs.get(path)!;
};
const protocol = () => JSON.parse(read(`${study}/protocol.json`).toString());
const suite = () => JSON.parse(read(`${study}/cases.json`).toString());
const temps: string[] = [];

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'weftlet-code-study-'));
  temps.push(directory);
  const lock = JSON.parse(read(`${study}/inputs.lock.json`).toString());
  for (const path of [...lock.inputs.map((input: any) => input.path), `${study}/inputs.lock.json`]) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), read(path));
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'core.autocrlf', 'false');
  git('add', '.');
  git('-c', 'user.name=Public fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Freeze inputs');
  return { directory, git, sha: git('rev-parse', 'HEAD') };
}

afterEach(async () => {
  for (const directory of temps.splice(0)) rmSync(directory, { recursive: true, force: true });
  // Flush worker RPC between synchronous Git-heavy cases; do not block an entire suite's updates.
  await setImmediate();
});

describe('frozen code-graph study', () => {
  it('decodes exact binary/CRLF/empty blobs and rejects malformed Git batch frames', () => {
    const first = 'a'.repeat(40), second = 'b'.repeat(40);
    const content = Buffer.from([0, 255, 13, 10, 10, 42]);
    const batch = Buffer.concat([Buffer.from(`${first} blob ${content.length}\n`), content,
      Buffer.from(`\n${second} blob 0\n\n`)]);
    expect(decodeCommittedInputs(batch, [first, second])).toEqual(new Map([[first, content], [second, Buffer.alloc(0)]]));
    for (const bad of [batch.subarray(0, -1), Buffer.concat([batch, Buffer.from('extra')]),
      Buffer.from(`${first} missing\n`), Buffer.from(`${first} blob 1048577\n`), Buffer.from(`${second} blob 0\n\n`)]) {
      expect(() => decodeCommittedInputs(bad, [first, second])).toThrow();
    }
  });
  it('validates frozen anchors/configuration and typechecks both corpora without indexing or installing', async () => {
    expect(checkStudy(root).status).toBe('verified-inputs-only');
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
    for (const corpus of protocol().corpora) {
      const { config } = await loadConfig(join(root, corpus.configTemplate));
      expect(config.semantic.provider).toBe('module');
      execFileSync(process.execPath, [tsc, '--project', join(root, corpus.root, 'tsconfig.json')], { cwd: root });
    }
  }, 30_000);

  it('checks immutable committed bytes despite dirty files and rejects moving refs', () => {
    const { directory, sha } = fixture();
    const clean = checkStudy(directory, sha);
    const source = join(directory, study, 'project/services/api/src/analyze.ts');
    writeFileSync(source, 'export const unexpected = 1;\n');
    expect(() => checkStudy(directory)).toThrow('Frozen input changed');
    expect(checkStudy(directory, sha)).toEqual(clean);
    expect(() => checkStudy(directory, 'HEAD')).toThrow('immutable commit');
  });

  it('rejects extra files even when existing frozen inputs match', () => {
    const { directory } = fixture();
    writeFileSync(join(directory, study, 'project/services/api/src/extra.ts'), 'export const extra = 1;\n');
    expect(() => checkStudy(directory)).toThrow('missing or extra');
  });

  it('accepts Git CRLF checkout conversion while preserving real content changes', () => {
    const { directory, git } = fixture();
    git('config', 'core.autocrlf', 'true');
    const path = join(directory, 'tests/fixtures/business-context-provider.mjs');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\n/g, '\r\n'));
    expect(checkStudy(directory).status).toBe('verified-inputs-only');
    writeFileSync(path, readFileSync(path, 'utf8') + '// changed\r\n');
    expect(() => checkStudy(directory)).toThrow('Frozen input changed');
  });

  it('rejects a forged inventory digest and unsafe paths before reading outside inputs', () => {
    const { directory } = fixture();
    const path = join(directory, study, 'inputs.lock.json');
    const lock = JSON.parse(readFileSync(path, 'utf8'));
    lock.inputs[0].sha256 = '0'.repeat(64);
    writeFileSync(path, JSON.stringify(lock));
    expect(() => checkStudy(directory)).toThrow('inventory digest');
    for (const value of ['../secret', '/tmp/private', 'a/../../x', 'a\\b', 'a/.git/config', 'a//b']) {
      expect(() => safePath(value)).toThrow('Unsafe');
    }
    lock.inputs[0].path = '../secret';
    lock.digest = createHash('sha256').update(JSON.stringify(lock.inputs)).digest('hex');
    writeFileSync(path, JSON.stringify(lock));
    expect(() => checkStudy(directory)).toThrow('Unsafe');
  });

  it('rejects ambiguous/missing anchors, duplicate contradictory labels and unknown targets', () => {
    const ambiguous = suite();
    ambiguous.anchors['math.string'].text = 'export function parse';
    expect(() => validateLabels(protocol(), ambiguous, read)).toThrow('ambiguous anchor');
    const missing = suite();
    missing.anchors['math.string'].token = 'absent';
    expect(() => validateLabels(protocol(), missing, read)).toThrow('Missing');
    const contradictory = suite();
    contradictory.cases.push({ ...contradictory.cases[0], id: 'contradiction', expected: 'absent' });
    expect(() => validateLabels(protocol(), contradictory, read)).toThrow('case pair');
    const unknown = suite();
    unknown.cases[0].to = 'invented';
    expect(() => validateLabels(protocol(), unknown, read)).toThrow('Unknown entity');
  });

  it('rejects broken edits and renames onto existing files before measurement', () => {
    const broken = protocol();
    broken.scenarios.find((value: any) => value.id === 'body-edit').operations[0].before = 'missing text';
    expect(() => validateLabels(broken, suite(), read)).toThrow('Missing');
    const collision = protocol();
    collision.scenarios.find((value: any) => value.id === 'rename').operations[0].to = 'services/api/src/status.ts';
    expect(() => validateLabels(collision, suite(), read)).toThrow('destination exists');
  });
});
