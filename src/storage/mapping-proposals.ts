import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MappingProposalArtifact, MappingProposalStore } from '@weftlet/core';
import { temporaryArtifactPath } from '../infrastructure/artifact-paths.js';

/** Separate immutable proposal namespace; never writes graph snapshots, heads or semantic artifacts. */
export class FileMappingProposalStore implements MappingProposalStore {
  constructor(private readonly root: string) {}
  private path(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw Error('Invalid mapping proposal key');
    return join(this.root, 'artifacts', 'mapping-proposals', `${key}.json`);
  }
  async read(key: string): Promise<MappingProposalArtifact | undefined> {
    try { return JSON.parse(await readFile(this.path(key), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw Error('Mapping proposal artifact could not be read'); }
  }
  async write(artifact: MappingProposalArtifact): Promise<void> {
    const path = this.path(artifact.key), temporary = temporaryArtifactPath(path);
    await mkdir(join(this.root, 'artifacts', 'mapping-proposals'), { recursive: true });
    try {
      await writeFile(temporary, JSON.stringify(artifact), { flag: 'wx' });
      await link(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if ((await this.read(artifact.key))?.outputDigest !== artifact.outputDigest) throw Error('Concurrent mapping proposal differs; existing artifact retained');
    } finally { await rm(temporary, { force: true }); }
  }
}
