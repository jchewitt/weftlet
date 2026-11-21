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
  const omitted = new Map<string, { category: string; count: number; bytes: number }>();
  const selectedDirs = new Set<string>();
  for (const path of files.keys())
    for (let dir = posix.dirname(path); dir !== '.'; dir = posix.dirname(dir)) selectedDirs.add(dir);
  for (const o of inv.objects) {
    if (files.has(o.path) || selectedDirs.has(o.path)) continue;
    const name = o.path.toLowerCase();
    const parts = name.split('/');
    let category: string = o.category;
    if (name.startsWith('.weftlet-coordination/') && name !== o.path) category = 'coordination-state';
    else if (name.startsWith('.weftlet-coordination/')) {
      if (
        o.kind === 'directory' ||
        [
          '.weftlet-coordination/gate.lock',
          '.weftlet-coordination/maintenance.json',
          '.weftlet-coordination/root.json',
        ].includes(name)
      )
        continue;
      if (
        /^\.weftlet-coordination\/(?:removals\/[a-f0-9-]+\.jsonl|recovery\/[a-f0-9]+\.(?:claim|start|done)\.json)$/.test(
          name,
        )
      )
        category = 'source-audit-history';
      else category = 'coordination-state';
    } else if (
      parts.includes('refs-v1') ||
      parts.includes('scip-blobs-v1') ||
      parts.includes('scip-retirements-v1') ||
      parts.includes('scip-retirement-staging-v1') ||
      parts.includes('compiler-operations-v1')
    ) {
      if (
        o.kind === 'directory' &&
        [
          'compiler-operations-v1',
          'refs-v1',
          'scip-blobs-v1',
          'scip-retirements-v1',
          'scip-retirement-staging-v1',
        ].includes(parts.at(-1)!)
      )
        continue;
      category = 'unreconciled-lifecycle';
    } else if (o.kind === 'directory') continue;
    const group = omitted.get(category) ?? { category, count: 0, bytes: 0 };
    group.count++;
    group.bytes += o.logicalBytes;
    omitted.set(category, group);
  }
  const excluded = [...omitted.values()].sort((a, b) => a.category.localeCompare(b.category, 'en'));
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
