// Modified for standalone extraction; see docs/extraction-manifest.json.
import { mkdir, writeFile, link, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { GraphSnapshot, SemanticArtifact, SnapshotStore } from "@weftlet/core";
import { atomicRename } from './atomic-rename.js';
import { physicalArtifactKey, temporaryArtifactPath } from '../infrastructure/artifact-paths.js';
import { readJsonFile, readJsonProperty, writeJsonFile } from './streaming-json.js';

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return await readJsonFile<T>(path);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function readWithLegacyPath<T>(path: string, legacyPath: string,
  read: (path: string) => Promise<T | undefined> = readJson<T>): Promise<T | undefined> {
  const current = await read(path);
  if (current !== undefined || path === legacyPath) return current;
  // No old file could have this component on supported filesystems. Do not attempt an
  // overlong fallback after a normal cache miss; other I/O/corruption errors still propagate.
  if (Buffer.byteLength(basename(legacyPath)) > 255) return undefined;
  if (process.platform === 'win32' && /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(basename(legacyPath))) return undefined;
  return read(legacyPath);
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = temporaryArtifactPath(path);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await atomicRename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function safeKey(key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(key)) throw new Error('Unsafe storage identifier');
  return key;
}

function snapshotPath(root: string, snapshotId: string, legacy = false): string {
  if (
    snapshotId.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(snapshotId) ||
    snapshotId === '.' ||
    snapshotId === '..'
  ) {
    throw new Error('snapshotId must be a safe storage identifier');
  }
  const directory = resolve(root, 'snapshots');
  const candidate = resolve(directory, `${legacy ? snapshotId : physicalArtifactKey(snapshotId)}.json`);
  const pathFromDirectory = relative(directory, candidate);
  if (
    pathFromDirectory === '..' ||
    pathFromDirectory.startsWith(`..${sep}`) ||
    isAbsolute(pathFromDirectory)
  ) {
    throw new Error('snapshotId must resolve within the snapshot directory');
  }
  return candidate;
}

export class FileSnapshotStore implements SnapshotStore {
  constructor(private readonly root: string) {}

  async write(snapshot: GraphSnapshot): Promise<void> {
    const destination = snapshotPath(this.root, snapshot.manifest.snapshotId);
    const prior = await this.readManifest(snapshot.manifest.snapshotId);
    if (prior) {
      if (prior.contentDigest !== snapshot.manifest.contentDigest) {
        throw new Error(`Refusing to overwrite immutable snapshot ${snapshot.manifest.snapshotId} with different content`);
      }
      return; // Preserve an existing legacy file without copying or rewriting its bytes.
    }
    await mkdir(dirname(destination), { recursive: true });
    const temporary = temporaryArtifactPath(destination);
    try {
      await writeJsonFile(temporary, snapshot);
      // Linking a complete file publishes atomically without ever replacing a winner.
      await link(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await this.readManifest(snapshot.manifest.snapshotId);
      if (existing?.contentDigest !== snapshot.manifest.contentDigest) {
        throw new Error(
          `Refusing to overwrite immutable snapshot ${snapshot.manifest.snapshotId} with different content`,
        );
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }

  read(snapshotId: string): Promise<GraphSnapshot | undefined> {
    return readWithLegacyPath(snapshotPath(this.root, snapshotId), snapshotPath(this.root, snapshotId, true));
  }

  /** Cache invalidation for read-only query sessions; not a cryptographic integrity claim. */
  async readRevision(snapshotId: string): Promise<string | undefined> {
    return readWithLegacyPath(snapshotPath(this.root, snapshotId), snapshotPath(this.root, snapshotId, true), async path => {
      try {
        const info = await stat(path, { bigint: true });
        return [path, info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(':');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
    });
  }

  private readManifest(snapshotId: string): Promise<GraphSnapshot['manifest'] | undefined> {
    return readWithLegacyPath(snapshotPath(this.root, snapshotId), snapshotPath(this.root, snapshotId, true), async path => {
      try {
        const manifest = await readJsonProperty<GraphSnapshot['manifest']>(path, 'manifest');
        if (!manifest || typeof manifest.contentDigest !== 'string') throw Error('Invalid snapshot manifest');
        return manifest;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
    });
  }

  async readHead(headName: string): Promise<GraphSnapshot | undefined> {
    const snapshotId = await this.headId(headName);
    return snapshotId ? this.read(snapshotId) : undefined;
  }

  async readHeadManifest(headName: string): Promise<GraphSnapshot['manifest'] | undefined> {
    const snapshotId = await this.headId(headName);
    return snapshotId ? this.readManifest(snapshotId) : undefined;
  }

  private async headId(headName: string): Promise<string | undefined> {
    const key = safeKey(headName);
    const head = await readWithLegacyPath<{ snapshotId: string }>(
      join(this.root, 'heads', `${physicalArtifactKey(key)}.json`),
      join(this.root, 'heads', `${key}.json`),
    );
    return head?.snapshotId;
  }

  async updateHead(headName: string, snapshotId: string): Promise<void> {
    if (!(await this.readManifest(snapshotId))) throw new Error('Cannot point a head to an absent snapshot');
    return atomicJson(join(this.root, 'heads', `${physicalArtifactKey(safeKey(headName))}.json`), { snapshotId });
  }
}

export class SemanticArtifactStore {
  constructor(private readonly root: string, private readonly legacyRoots: readonly string[] = []) {}

  async read(key: string): Promise<SemanticArtifact | undefined> {
    return (await this.readEntry(key))?.artifact;
  }

  /** Only explicitly supplied roots are consulted; never enumerate other consumers' profiles. */
  async readEntry(key: string): Promise<{ artifact: SemanticArtifact; origin: 'primary' | 'legacy' } | undefined> {
    const filename = `${physicalArtifactKey(safeKey(key))}.json`;
    for (const [index, root] of [this.root, ...this.legacyRoots].entries()) {
      const artifact = await readWithLegacyPath<SemanticArtifact>(join(root, 'artifacts', 'semantic', filename),
        join(root, 'artifacts', 'semantic', `${key}.json`));
      if (artifact !== undefined) return { artifact, origin: index === 0 ? 'primary' : 'legacy' };
    }
    return undefined;
  }

  async write(artifact: SemanticArtifact): Promise<void> {
    const key = safeKey(artifact.key);
    const path = join(this.root, 'artifacts', 'semantic', `${physicalArtifactKey(key)}.json`);
    const prior = await readWithLegacyPath<SemanticArtifact>(path, join(this.root, 'artifacts', 'semantic', `${key}.json`));
    if (prior) {
      if (prior.outputDigest !== artifact.outputDigest) {
        throw new Error('Concurrent semantic artifact differs; retry with explicit force refresh');
      }
      return;
    }
    await mkdir(dirname(path), { recursive: true });
    const temporary = temporaryArtifactPath(path);
    try {
      await writeJsonFile(temporary, artifact);
      await link(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if ((await this.read(artifact.key))?.outputDigest !== artifact.outputDigest) {
        throw new Error('Concurrent semantic artifact differs; retry with explicit force refresh');
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
