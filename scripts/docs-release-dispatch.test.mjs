import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { documentationReleasePayload, dispatchReleaseDocumentation } from './docs-release-dispatch.mjs';

const commit = 'a'.repeat(40);
const integrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`;
const manifest = { commit, registry: 'https://registry.npmjs.org', packages: [
  { name: '@weftlet/core', version: '0.9.1', integrity, filename: 'weftlet-core-0.9.1.tgz' },
  { name: '@weftlet/toolkit', version: '0.9.1', integrity, filename: 'weftlet-toolkit-0.9.1.tgz' },
] };
const clone = () => structuredClone(manifest);

test('dispatches the combined fixed release pair once with the canonical source/version key', async () => {
  const calls = [];
  const releaseKey = await dispatchReleaseDocumentation({ manifest, expectedCommit: commit,
    request: async (...args) => { calls.push(args); } });
  const expectedKey = createHash('sha256').update(JSON.stringify({ sourceCommit: commit, packages: [
    { name: '@weftlet/core', version: '0.9.1' }, { name: '@weftlet/toolkit', version: '0.9.1' },
  ] })).digest('hex');
  assert.equal(releaseKey, expectedKey);
  assert.deepEqual(calls, [['https://api.github.com/repos/jchewitt/weftlet-docs/dispatches', {
    event_type: 'weftlet-release-published', client_payload: {
      schemaVersion: 1, sourceRepository: 'jchewitt/weftlet', sourceCommit: commit,
      packages: manifest.packages.map(({ name, version, integrity }) => ({ name, version, integrity })),
      releaseKey: expectedKey,
    },
  }]]);
});

test('retries preserve the receiver deduplication key; source and version changes identify a new update', () => {
  const first = documentationReleasePayload({ manifest, expectedCommit: commit });
  assert.deepEqual(documentationReleasePayload({ manifest: clone(), expectedCommit: commit }), first);
  const changedSource = clone(); changedSource.commit = 'b'.repeat(40);
  assert.notEqual(documentationReleasePayload({ manifest: changedSource, expectedCommit: changedSource.commit }).releaseKey, first.releaseKey);
  const changedVersions = clone(); changedVersions.packages.forEach(pkg => { pkg.version = '0.9.2'; });
  assert.notEqual(documentationReleasePayload({ manifest: changedVersions, expectedCommit: commit }).releaseKey, first.releaseKey);
});

test('invalid or partial publication identity is rejected before any dispatch request', async () => {
  const mutations = [
    value => { value.commit = 'b'.repeat(40); },
    value => { value.registry = 'https://example.invalid'; },
    value => { value.packages.pop(); },
    value => { value.packages.reverse(); },
    value => { value.packages[1].name = '@weftlet/other'; },
    value => { value.packages[1].version = '0.9.2'; },
    value => { value.packages[0].version = '0.10.0-rc.1'; },
    value => { value.packages[0].integrity = 'sha512-invalid'; },
    value => { value.packages[0].integrity = `sha512-${Buffer.alloc(32).toString('base64')}`; },
  ];
  for (const mutate of mutations) {
    const value = clone(); mutate(value);
    let requested = false;
    await assert.rejects(dispatchReleaseDocumentation({ manifest: value, expectedCommit: commit,
      request: async () => { requested = true; } }));
    assert.equal(requested, false);
  }
  for (const wrong of ['', 'MAIN', 'A'.repeat(40), 'a'.repeat(39), null]) {
    assert.throws(() => documentationReleasePayload({ manifest, expectedCommit: wrong }));
  }
});

test('a rejected or uncertain dispatch fails the job and remains retryable with the same key', async () => {
  const expected = documentationReleasePayload({ manifest, expectedCommit: commit }).releaseKey;
  let attempts = 0;
  const request = async (_url, body) => {
    attempts++;
    assert.equal(body.client_payload.releaseKey, expected);
    if (attempts === 1) throw new Error('simulated uncertain transport outcome');
  };
  await assert.rejects(dispatchReleaseDocumentation({ manifest, expectedCommit: commit, request }));
  assert.equal(await dispatchReleaseDocumentation({ manifest, expectedCommit: commit, request }), expected);
  assert.equal(attempts, 2);
});

test('missing dispatch credentials fail without a live request or disclosing environment values', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/docs-release-dispatch.mjs'], {
    env: { ...process.env, GITHUB_REPOSITORY: 'jchewitt/weftlet', GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: commit, WEFTLET_DOCS_DISPATCH_TOKEN: '' }, encoding: 'utf8', stdio: 'pipe',
  }), error => {
    assert.match(error.stderr, /Missing WEFTLET_DOCS_DISPATCH_TOKEN/);
    return true;
  });
});

test('the workflow places the single dispatch after verified publish and release records', async () => {
  const text = await readFile(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  const block = text.split('\n  docs:\n')[1];
  assert(block);
  assert.match(block, /needs: \[prepare, publish, records\]/);
  assert.match(block, /persist-credentials: false/);
  assert.match(block, /WEFTLET_DOCS_DISPATCH_TOKEN: \$\{\{ secrets\.WEFTLET_DOCS_DISPATCH_TOKEN \}\}/);
  assert.equal((text.match(/run: node scripts\/docs-release-dispatch\.mjs/g) ?? []).length, 1);
  assert.match(text, /run: node --test scripts\/docs-release-dispatch\.test\.mjs/);
});
