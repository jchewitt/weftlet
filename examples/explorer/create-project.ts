import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { FileSnapshotStore } from '../../src/storage/storage.js';
import { explorerFixture } from './fixture.js';

/** Synthetic public evidence for browser/API tests, not a semantic-quality claim. */
export async function createExplorerFixtureProject(noise = 250) {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-explorer-'));
  const execute = promisify(execFile), git = (...args: string[]) => execute('git', args, { cwd: root });
  try {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs/order-policy.md'), '# Public synthetic order fixture\nReserve inventory, then ship.\nA reservation record links these stages.\n');
    await writeFile(join(root, '.gitignore'), '.context-graph/\n');
    const config = JSON.parse(await readFile(new URL('../generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    Object.assign(config, { repositoryId: 'public/explorer', adapter: './unavailable-adapter.mjs' });
    const configPath = join(root, 'context-graph.config.json');
    await writeFile(configPath, JSON.stringify(config));
    await writeFile(join(root, 'unavailable-adapter.mjs'), 'throw Error("Viewer must not load a repository adapter");\n');
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Public fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public explorer fixture');
    const commitSha = (await git('rev-parse', 'HEAD')).stdout.trim(), base = explorerFixture(noise);
    const snapshot = { ...base, manifest: { ...base.manifest, commitSha },
      facts: base.facts.map(fact => ({ ...fact, provenance: { ...fact.provenance, commitSha } })),
      diagnostics: base.diagnostics?.map(item => ({ ...item, provenance: item.provenance.map(span => ({ ...span, commitSha })) })) };
    const store = new FileSnapshotStore(join(root, '.context-graph')); await store.write(snapshot);
    return { root, configPath, snapshot, store, cleanup: () => rm(root, { recursive: true, force: true }) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
