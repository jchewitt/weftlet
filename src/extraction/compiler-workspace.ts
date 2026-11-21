import { managedRootForPath } from '../storage/coordination/managed-root.js';
import { createCompilerScratch } from '../storage/compiler-scratch.js';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { ExtractionContext, SemanticArtifact } from '@weftlet/core';
import { withCleanup } from '../storage/coordination/markers.js';
import { safeTransferPath, transferDirectory } from '../storage/transfer-files.js';
import type { OntologyCompileResult } from './ontology.js';

export abstract class WorkspaceCompiler {
  constructor(protected readonly storageRoot: string, private readonly backend: 'rdf' | 'opencaesar') {}
  protected abstract build(work: string, artifacts: readonly SemanticArtifact[], context?: ExtractionContext): Promise<OntologyCompileResult>;

  private async run<T>(artifacts: readonly SemanticArtifact[], context: ExtractionContext | undefined,
    consume: (result: OntologyCompileResult) => Promise<T>) {
    const operation = await createCompilerScratch(this.storageRoot, this.backend);
    return withCleanup(async () => consume(await this.build(join(operation.root, 'payload'), artifacts, context)), operation.dispose);
  }

  compileDigest(_snapshotId: string, artifacts: readonly SemanticArtifact[], context?: ExtractionContext) {
    return this.run(artifacts, context, async result => result.digest);
  }

  compile(_snapshotId: string, artifacts: readonly SemanticArtifact[], context?: ExtractionContext, output?: string) {
    return this.run(artifacts, context, async result => {
      const root = output ? resolve(output) : join(this.storageRoot, 'ontology-exports', randomUUID());
      if (output && await managedRootForPath(root)) throw Error('Select a caller-owned export directory outside managed caches');
      await transferDirectory(dirname(root));
      await mkdir(root, { mode: 0o700 }); // A caller's existing directory is never overwritten.
      const files: string[] = [];
      for (const source of result.rdfFiles) {
        const name = relative(result.root, source);
        if (!name || name === '..' || name.startsWith('..' + sep) || isAbsolute(name)) throw Error('Invalid RDF export path');
        const path = join(root, name);
        await safeTransferPath(source);
        await transferDirectory(dirname(path));
        await copyFile(source, path, constants.COPYFILE_EXCL);
        files.push(path);
      }
      return { root, rdfFiles: files, digest: result.digest };
    });
  }
}
