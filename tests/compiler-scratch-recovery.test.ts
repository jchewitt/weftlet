import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { enableCacheCoordination } from '../src/storage/coordination/managed-root.js';
import { applyRecovery } from '../src/storage/recovery/apply.js';
import { planRecovery } from '../src/storage/recovery/plan.js';
import { reclaimCompilerScratch } from '../src/storage/compiler-scratch.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it('requires reviewed offline recovery and matching ownership before reclaiming a crashed compiler', async () => {
  const root = await mkdtemp(join(tmpdir(), 'compiler-crash-')); roots.push(root);
  await enableCacheCoordination(root, { acknowledgeQuiescence: true });
  const code = `
    import {withManagedCacheAccess} from './src/storage/coordination/managed-access.ts';
    import {createCompilerScratch} from './src/storage/compiler-scratch.ts';
    import {mkdir,writeFile} from 'node:fs/promises';
    import {join} from 'node:path';
    const root = process.argv[1];
    await withManagedCacheAccess([root], async () => {
      const op = await createCompilerScratch(root, 'rdf');
      await mkdir(join(op.root, 'payload')); await writeFile(join(op.root, 'payload','semantic.nt'), 'public');
      process.exit(71);
    });
  `;
  await expect(promisify(execFile)(process.execPath, ['--import','tsx','--input-type=module','-e',code,root]))
    .rejects.toMatchObject({code:71});
  const [file] = await readdir(join(root,'compiler-operations-v1'));
  const id = file!.slice(0, -5);
  const plan = await planRecovery({root});
  expect(plan.canApply).toBe(true);
  await applyRecovery(plan, plan.planId, { root, acknowledgeQuiescence:true });
  const marker = join(root, 'work', 'compiler-' + id, 'owner.json');
  const original = await readFile(marker);
  await writeFile(marker, '{}');
  await expect(reclaimCompilerScratch(root, id, true)).rejects.toThrow('ownership');
  await writeFile(marker, original);
  await expect(reclaimCompilerScratch(root, id, false)).rejects.toThrow('quiescence');
  expect(await reclaimCompilerScratch(root, id, true)).toEqual({operationId:id, removedWorkspace:true});
  expect(await readdir(join(root,'work'))).toEqual([]);
  expect(await readdir(join(root,'compiler-operations-v1'))).toEqual([]);
});
