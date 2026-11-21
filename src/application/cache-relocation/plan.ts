import { archiveExclusions } from './exclusions.js';
import { loadConfig } from '../../configuration/config.js';
import { resolveSemanticStorageRoots, resolveStorageRoot } from '../../configuration/cache.js';
import { persistedJsonDigest, type SnapshotManifest } from '@weftlet/core';
import { join, posix, relative, sep } from 'node:path';
import {
  withRetentionMaintenance,
  assertNoPendingRemoval,
  type PreparedRetentionOptions,
} from '../../storage/retention/prepared.js';
import { inventoryCache } from '../../storage/inspection/inventory.js';
import { inspectJson, inspectFileDigest, inspectSmallJson } from '../../storage/inspection/read.js';
import { parseRetentionPolicy } from '../../storage/retention/policy.js';
import { previewScipReference } from '../../storage/shared-scip.js';
import { physicalArtifactKey } from '../../infrastructure/artifact-paths.js';
import { validateBundleArtifact } from '../delivery/semantic.js';
import { resolveRetentionReferences } from '../../storage/retention/references.js';

export interface ArchiveFile {
  path: string;
  bytes: number;
  sha256: string;
}
interface Generation {
  profile: string;
  snapshotId: string;
  repositoryId: string;
  commitSha: string;
  contentDigest: string;
  index: 'legacy' | 'shared' | 'absent';
  semanticKeys: number;
}
export interface ArchiveOptions extends PreparedRetentionOptions {
  includeColdSemantic?: boolean;
  configs?: readonly string[];
}
export type ArchivePlan = Awaited<ReturnType<typeof archivePlanOwned>>;
export const planArchive = (options: ArchiveOptions) =>
  withRetentionMaintenance(options, (root, id) => archivePlanOwned(root, id, options));

export async function archivePlanOwned(root: string, rootId: string, options: ArchiveOptions) {
  const policy = parseRetentionPolicy((await options.readPolicy?.()) ?? options.policy);
  await assertNoPendingRemoval(root);
  const inv = await inventoryCache({ ...options, roots: [root], verify: true });
  if (
    !inv.complete ||
    inv.missingRoots.length ||
    inv.danglingHeads.length ||
    inv.objects.some((o) => o.path.endsWith('/.weftlet-coordination/root.json'))
  )
    throw Error('Archive requires a complete single-root inventory and resolved heads');
  const refs = resolveRetentionReferences(policy, inv.objects, Date.now());
  if (refs.issues.length) throw Error('Resolve declared pins, scopes and profile ownership before archiving');
  const objects = new Map(inv.objects.map((o) => [o.path, o]));
  const files = new Map<string, ArchiveFile>(),
    generations: Generation[] = [];
  const required = new Map<string, { key: string; locations: Set<string> }>();
  const partitions = new Map<string, Set<string>>();
  const userProfiles = new Set<string>();
  for (const path of options.configs ?? []) {
    const { config, repositoryRoot } = await loadConfig(path);
    const local = (dir: string) => relative(root, dir).split(sep).join('/') || '.';
    const profile = local(resolveStorageRoot(repositoryRoot, config, root));
    if (refs.profiles.get(profile)?.repositoryId !== config.repositoryId)
      throw Error('Archive configuration does not own a selected profile');
    if (config.storageScope === 'user') userProfiles.add(profile);
    const semantic = resolveSemanticStorageRoots(repositoryRoot, config, root);
    for (const dir of [semantic.primary, semantic.legacy].filter((v): v is string => !!v)) {
      const p = local(dir);
      if (p.startsWith('../') || p === '..') throw Error('Semantic store is outside the selected archive root');
      const owners = partitions.get(profile) ?? new Set<string>();
      owners.add(p);
      partitions.set(profile, owners);
    }
  }
  async function select(path: string, requiredDigest?: string) {
    if (files.has(path)) return;
    const o = objects.get(path);
    if (!o || o.kind !== 'file' || o.linkCount !== 1) throw Error('Missing or unsafe archive payload: ' + path);
    const { sha256, bytes } = await inspectFileDigest(join(root, path), inv.maxInspectionBytesPerFile, options.signal);
    if (requiredDigest && sha256 !== requiredDigest)
      throw Error('Archive index failed integrity verification: ' + path);
    files.set(path, { path, bytes, sha256 });
  }
  for (const o of inv.objects) {
    if (!refs.profiles.has(o.profile)) continue;
    if (o.category === 'snapshot') {
      if (o.inspection !== 'json-complete' || o.metadata?.repositoryId !== refs.profiles.get(o.profile)!.repositoryId)
        throw Error('Invalid graph in declared archive profile');
      const data = await inspectJson(join(root, o.path), {
        manifestOnly: true,
        snapshotEncoding: true,
        maxBytes: inv.maxInspectionBytesPerFile,
        signal: options.signal,
      });
      const m = data.manifest as unknown as SnapshotManifest;
      if (!Array.isArray(m.semanticArtifactKeys)) throw Error('Invalid semantic key list');
      await select(o.path);
      const locations = partitions.get(o.profile) ?? new Set([o.profile]);
      for (const key of m.semanticArtifactKeys) required.set(JSON.stringify([o.profile, key]), { key, locations });
      const g: Generation = {
        profile: o.profile,
        snapshotId: m.snapshotId,
        repositoryId: m.repositoryId,
        commitSha: m.commitSha,
        contentDigest: m.contentDigest,
        index: 'absent',
        semanticKeys: m.semanticArtifactKeys.length,
      };
      for (const key of new Set([m.snapshotId, physicalArtifactKey(m.snapshotId)])) {
        const path = posix.join(o.profile, 'scip', key + '.scip');
        if (objects.has(path)) {
          await select(path, m.scipIndexDigest);
          g.index = 'legacy';
        }
      }
      if ((await previewScipReference(join(root, o.profile), m)).exists) {
        const ref = posix.join(
          o.profile,
          'scip',
          'refs-v1',
          physicalArtifactKey(m.snapshotId) + '.ref',
          'reference.json',
        );
        await select(ref);
        await select(posix.join('scip-blobs-v1', m.scipIndexDigest, 'index.scip'), m.scipIndexDigest);
        g.index = 'shared';
      }
      generations.push(g);
    } else if (['head', 'mapping-proposal', 'comparison-receipt'].includes(o.category)) {
      if (o.inspection !== 'json-complete') throw Error('Invalid archive record: ' + o.path);
      await select(o.path);
    }
  }
  if (!generations.length) throw Error('No graphs in the declared archive profiles');
  const found = new Set<string>(),
    byName = new Map<string, { id: string; key: string; locations: Set<string> }[]>();
  for (const [id, req] of required)
    for (const name of new Set([req.key, physicalArtifactKey(req.key)])) {
      const list = byName.get(name) ?? [];
      list.push({ id, ...req });
      byName.set(name, list);
    }
  const selectedPartitions = new Set([...refs.profiles.keys(), ...[...partitions.values()].flatMap((p) => [...p])]);
  for (const o of inv.objects)
    if (o.category === 'semantic-artifact' && o.kind === 'file' && selectedPartitions.has(o.profile)) {
      const name = posix.basename(o.path, '.json');
      const matches = (byName.get(name) ?? []).filter((r) => r.locations.has(o.profile));
      let key = matches[0]?.key;
      if (!key && options.includeColdSemantic) {
        const record = (await inspectSmallJson(join(root, o.path), inv.maxInspectionBytesPerFile, true)) as {
          key: string;
        };
        key = record.key;
        if (typeof key !== 'string' || ![key, physicalArtifactKey(key)].includes(name))
          throw Error('Invalid semantic archive identity');
      }
      if (!key) continue;
      await validateBundleArtifact(join(root, o.path), key);
      await select(o.path);
      for (const m of matches) found.add(m.id);
    }
  if ([...required.keys()].some((k) => !found.has(k)))
    throw Error('Archive would omit required semantic artifacts; supply the producing --config for each profile');
  const excluded = archiveExclusions(inv.objects, files);
  const body = {
    format: 'weftlet-cache-archive-v1' as const,
    rootId,
    policy,
    userProfiles: [...userProfiles].sort(),
    includeColdSemantic: !!options.includeColdSemantic,
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path, 'en')),
    generations,
    excluded,
    limits: { maxEntries: inv.maxEntries, maxBytes: inv.maxInspectionBytesPerFile },
    payloadBytes: [...files.values()].reduce((n, f) => n + f.bytes, 0),
  };
  if (Buffer.byteLength(JSON.stringify(body)) > 32 * 1024 ** 2)
    throw Error('Archive manifest exceeds 32 MiB; select fewer profiles');
  return { ...body, planId: persistedJsonDigest(body) };
}
