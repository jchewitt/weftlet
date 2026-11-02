import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import type { MappingProposalArtifact } from '@weftlet/core';
import { FileMappingProposalStore } from './mapping-proposals.js';

it('atomically publishes identical concurrent proposals and preserves a winner when later output differs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mapping-store-')), store = new FileMappingProposalStore(root);
  try {
    const artifact = { key: 'a'.repeat(64), outputDigest: 'first', output: { decision: 'abstained' } } as MappingProposalArtifact;
    await Promise.all(Array.from({ length: 8 }, () => store.write(artifact)));
    expect(await store.read(artifact.key)).toEqual(artifact);
    await expect(store.write({ ...artifact, outputDigest: 'different' })).rejects.toThrow('Concurrent');
    expect(await store.read(artifact.key)).toEqual(artifact);
    expect(await readdir(join(root, 'artifacts/mapping-proposals'))).toEqual([`${artifact.key}.json`]);
    await expect(store.read('../escape')).rejects.toThrow();
    expect(await store.read('b'.repeat(64))).toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});
