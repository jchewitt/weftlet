import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256, type GraphSnapshot } from '@weftlet/core';
import { physicalArtifactKey } from '../../src/infrastructure/artifact-paths.js';
import { enableCacheCoordination } from '../../src/storage/coordination/managed-root.js';
import { FileSnapshotStore, snapshotPath } from '../../src/storage/storage.js';
import { emptyRetentionPolicy } from '../../src/storage/retention/policy.js';

export const bytes = Buffer.alloc(16_384, 'x');
export async function scipMigrationFixture(roots: string[]) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'weftlet-scip-preview-')));
  roots.push(parent);
  const root = join(parent, 'cache'), policy = emptyRetentionPolicy();
  await mkdir(root);
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  for (const profile of ['a', 'b']) policy.profiles.push({ path: profile, repositoryId: 'public/' + profile, owner: 'fixture', reason: 'study' });
  async function add(profile: string, id: string, payload = bytes) {
    const path = join(root, profile), store = new FileSnapshotStore(path);
    const manifest = { schemaVersion: 1, repositoryId: 'public/' + profile, snapshotId: id,
      contentDigest: sha256(profile + id), commitSha: 'a'.repeat(40), scipIndexDigest: sha256(payload) } as GraphSnapshot['manifest'];
    await store.write({ manifest, facts: [], invariants: [], unresolved: [], runtimeEvidence: [] } as unknown as GraphSnapshot);
    await mkdir(join(path, 'scip'), { recursive: true });
    const index = join(path, 'scip', physicalArtifactKey(id) + '.scip');
    await writeFile(index, payload);
    return { manifest, index, store, path, graph: snapshotPath(path, id) };
  }
  return { parent, root, policy, add };
}
