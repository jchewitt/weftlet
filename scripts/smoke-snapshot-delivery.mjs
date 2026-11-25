import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Installed CLI transfers a genuinely hydrated traversal graph; no provider is available on import. */
export async function smokeSnapshotDelivery(consumer, installedRoot, producingConfig, snapshotId) {
  const cli = (...args) => JSON.parse(execFileSync(process.execPath, [join(installedRoot, 'dist/cli.js'), ...args],
    { cwd: consumer, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }));
  const input = join(consumer, 'snapshot-bundle');
  const exported = cli('snapshot', 'export', '--config', 'traversal.config.json', '--snapshot', snapshotId, '--output', input);
  await smokeHostedReader(installedRoot, input, exported);
  const receivingConfig = { ...producingConfig, storagePath: '.context-graph/import-smoke', adapter: './must-not-load.mjs',
    semantic: { ...producingConfig.semantic, providerModule: './must-not-load.mjs' } };
  await writeFile(join(consumer, 'delivery.config.json'), JSON.stringify(receivingConfig));
  const imported = cli('snapshot', 'import', '--config', 'delivery.config.json', '--input', input, '--expect-digest', exported.manifestSha256);
  if (imported.activated || imported.semanticArtifacts !== 0 || !imported.strictValidation ||
      imported.evidenceState.configurationMatches || imported.evidenceState.eligibleForCurrentDiffValidation) {
    throw Error('Installed snapshot import must verify and report config mismatch without loading adapters or advancing a head');
  }
  const api = await import(pathToFileURL(join(installedRoot, 'dist/index.js')).href);
  const { FileSnapshotStore } = await import(pathToFileURL(join(installedRoot, 'dist/storage/storage.js')).href);
  const store = new FileSnapshotStore(join(consumer, receivingConfig.storagePath));
  const stored = await store.file(snapshotId);
  if (!stored || !(await readFile(stored)).equals(await readFile(join(input, 'snapshot.json')))) throw Error('Installed transfer changed immutable bytes');
  const pack = await new api.SnapshotImpactQueryService(store, 'default').scan({ snapshotId, ownerDocument: 'role-owner.md', maxFacts: 60 });
  if (!pack.facts.length) throw Error('Installed transferred evidence is not queryable');
  const repeated = cli('snapshot', 'import', '--config', 'delivery.config.json', '--input', input, '--expect-digest', exported.manifestSha256);
  if (repeated.persistedGraphDigest !== exported.persistedGraphDigest || repeated.contentDigest !== exported.contentDigest) throw Error('Installed repeated transfer changed identity');
  const compactConfig = { ...receivingConfig, storagePath: '.context-graph/compact-smoke' };
  await writeFile(join(consumer, 'compact.config.json'), JSON.stringify(compactConfig));
  execFileSync(process.execPath, [join(installedRoot, 'dist/cli.js'), 'snapshot', 'import', '--config', 'compact.config.json',
    '--input', input, '--expect-digest', exported.manifestSha256], {
    cwd: consumer, env: { ...process.env, WEFTLET_SNAPSHOT_FORMAT: 'brotli-v1' }, timeout: 60_000,
  });
  const compactStore = new FileSnapshotStore(join(consumer, compactConfig.storagePath));
  const compactPath = await compactStore.file(snapshotId);
  if ((await readFile(compactPath)).subarray(0, 8).toString() !== 'WEFTBR1\n') throw Error('Expected packed CLI to store compact evidence');
  const rollback = join(consumer, 'compact-rollback');
  cli('snapshot', 'export', '--config', 'compact.config.json', '--snapshot', snapshotId, '--output', rollback);
  if (!(await readFile(join(rollback, 'snapshot.json'))).equals(await readFile(join(input, 'snapshot.json')))) throw Error('Compact CLI export changed JSON bytes');
  console.log('Packed CLI compact import and byte-exact JSON rollback passed.');
}

async function smokeHostedReader(installedRoot, bundle, receipt) {
  const directory = await mkdtemp(join(tmpdir(), 'weftlet-installed-reader-'));
  try {
    await cp(bundle, join(directory, 'bundle'), { recursive: true });
    const child = spawn(process.execPath, [join(installedRoot, 'dist/cli.js'), 'viewer', 'serve',
      '--bundle', 'bundle', '--expect-digest', receipt.manifestSha256, '--port', '0'], {
      cwd: directory, stdio: ['ignore', 'pipe', 'inherit'], timeout: 60_000,
    });
    const exit = once(child, 'exit');
    const lines = createInterface({ input: child.stdout });
    try {
      const ready = await Promise.race([once(lines, 'line'), exit.then(() => { throw Error('Installed bundle reader exited before startup'); })]);
      const { url, snapshotId } = JSON.parse(ready[0]);
      assert.equal(snapshotId, receipt.snapshotId);
      const meta = await (await fetch(url + '/explorer.json')).json();
      assert.equal(meta.mode, 'hosted');
      assert.equal(meta.checkout, undefined);
      assert.equal(meta.snapshot.contentDigest, receipt.contentDigest);
      const page = await (await fetch(url + '/api/v1/query', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'graph.catalog', params: { snapshotId, maxNodes: 1 } }) })).json();
      assert.equal(page.nodes.length, 1);
      assert.equal(page.snapshot.snapshotId, snapshotId);
      const agent = new Client({ name: 'packed-hosted-reader', version: '1' });
      const transport = new StdioClientTransport({ command: process.execPath, args: [join(installedRoot, 'dist/mcp.js'),
        '--graph-url', url, '--snapshot', snapshotId, '--content-digest', receipt.contentDigest], cwd: directory, stderr: 'pipe' });
      try {
        await agent.connect(transport);
        const args = { ownerDocument: 'role-owner.md', maxFacts: 1 };
        const reply = await agent.callTool({ name: 'impact.scan', arguments: args });
        assert.ok(!reply.isError);
        const viaMcp = JSON.parse(reply.content[1].text);
        const viaHttp = await (await fetch(url + '/api/v1/query', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'impact.scan', params: { ...args, snapshotId } }) })).json();
        assert.deepEqual(viaMcp, viaHttp);
        assert.equal(viaMcp.facts.length, 1);
      } finally { await agent.close(); await transport.close(); }
    } finally { lines.close(); child.kill(); await exit; }
    console.log('Packed reader served verified CI evidence from a directory containing only the exported bundle.');
  } finally { await rm(directory, { recursive: true, force: true }); }
}
