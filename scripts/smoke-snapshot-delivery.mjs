import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Installed CLI transfers a genuinely hydrated traversal graph; no provider is available on import. */
export async function smokeSnapshotDelivery(consumer, installedRoot, producingConfig, snapshotId) {
  const cli = (...args) => JSON.parse(execFileSync(process.execPath, [join(installedRoot, 'dist/cli.js'), ...args],
    { cwd: consumer, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }));
  const input = join(consumer, 'snapshot-bundle');
  const exported = cli('snapshot', 'export', '--config', 'traversal.config.json', '--snapshot', snapshotId, '--output', input);
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
}
