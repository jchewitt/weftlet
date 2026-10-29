// Modified for standalone extraction; see docs/extraction-manifest.json.
import { withCommittedTree } from "../repository/committed-tree.js";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ContextGraphConfig } from "../configuration/config.js";
import { repositoryFileNode, type ExtractionContext, type FactExtractor, type GraphFact, type GraphNode } from "@weftlet/core";
import { GitRepository } from "../repository/git.js";
import { assertScipSourceProject, assertSourceProjectInvocation } from '../configuration/scip-project.js';
import { prepareScipSourceProject } from './scip-project.js';
import { moduleRequestNode } from './module-request.js';
import { matchesRepositoryGlob } from "../repository/glob.js";
import { runProcess } from "../infrastructure/process.js";
import { sha256, stableJson } from "../infrastructure/util.js";
import { loadScipRuntime } from './scip-runtime.js';
import { physicalArtifactKey, temporaryArtifactPath } from '../infrastructure/artifact-paths.js';

import type { ScipIndexResult } from './scip-runtime.js';
export type { ScipIndexResult } from './scip-runtime.js';

export interface StaticIndexer {
  index(context: ExtractionContext): Promise<ScipIndexResult>;
}

export class ScipTypeScriptIndexer implements StaticIndexer {
  constructor(
    private readonly config: ContextGraphConfig['scip'],
    private readonly storageRoot: string,
  ) {}

  async index(context: ExtractionContext): Promise<ScipIndexResult> {
    if (this.config.sourceProject !== undefined) {
      assertScipSourceProject(this.config.sourceProject);
      assertSourceProjectInvocation(this.config.command, this.config.args);
    }
    const require = createRequire(import.meta.url);
    const destination = join(this.storageRoot, 'scip', `${physicalArtifactKey(context.snapshotId)}.scip`);
    await mkdir(join(this.storageRoot, 'scip'), { recursive: true });
    const temporary = temporaryArtifactPath(destination);
    const command =
      this.config.command === 'bundled-scip-typescript' ? process.execPath : this.config.command;
    const args =
      this.config.command === 'bundled-scip-typescript'
        ? [
            require.resolve('@sourcegraph/scip-typescript'),
            ...this.config.args,
            '--output',
            temporary,
          ]
        : this.config.args;
    try {
      await withCommittedTree(context.repositoryRoot, context.commitSha, async (worktreeRoot) => {
        const project = this.config.sourceProject ? await prepareScipSourceProject(worktreeRoot, this.config.sourceProject,
          await new GitRepository(context.repositoryRoot).listAllFilesAt(context.commitSha)) : undefined;
        await runProcess(command, project ? [...args, project] : args, worktreeRoot, {
          ...process.env,
          NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=8192',
        });
        const source =
          this.config.command === 'bundled-scip-typescript'
            ? temporary
            : join(worktreeRoot, 'index.scip');
        await stat(source);
        if (source !== temporary) await copyFile(source, temporary);
        // SCIP embeds this disposable checkout in metadata and inferred-type hover text.
        // Store the normalized artifact itself so its digest still authenticates its bytes.
        await writeFile(temporary, normalizeScipCheckout(await readFile(temporary), worktreeRoot));
      });
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
    return {
      path: destination,
      digest: sha256(await readFile(destination)),
      mode: 'full',
      version: this.config.version,
    };
  }
}

export function normalizeScipCheckout(bytes: Uint8Array, checkoutRoot: string): Uint8Array {
  const runtime = loadScipRuntime();
  const roots = [pathToFileURL(checkoutRoot).href, checkoutRoot.replace(/\\/g, '/'), checkoutRoot];
  const normalize = (value: string): string => {
    for (const root of roots) {
      if (value === root) return 'file:///context-graph/repository';
      value = value.split(`${root}/`).join('file:///context-graph/repository/');
      value = value.split(`${root}\\`).join('file:///context-graph/repository/');
    }
    return value;
  };
  const index = runtime.scip.Index.deserializeBinary(bytes);
  if (index.metadata) index.metadata.project_root = normalize(index.metadata.project_root);
  for (const symbol of [
    ...index.documents.flatMap((document) => document.symbols),
    ...index.external_symbols,
  ]) {
    symbol.documentation = symbol.documentation.map(normalize);
  }
  return index.serializeBinary();
}

export { ScipSymbolExtractor, scipSymbolExtractorIdentity } from './scip-symbols.js';

export const repositoryFileExtractorIdentity = { id: 'repository-file-extractor', version: '2.0.0' } as const;

export class RepositoryFileExtractor implements FactExtractor {
  readonly identity = repositoryFileExtractorIdentity;

  constructor(
    private readonly repository: GitRepository,
    private readonly roots: readonly string[],
    private readonly scipDigest: string,
  ) {}

  async extract(context: ExtractionContext): Promise<readonly GraphFact[]> {
    const paths = await this.repository.listFilesAt(context.commitSha, this.roots);
    const facts: GraphFact[] = [];
    const project = {
      id: `project:${context.repositoryId}`,
      kind: 'Project' as const,
      label: context.repositoryId,
    };
    for (const path of paths) {
      if (!/\.(ts|tsx|js|mjs|cjs|json|prisma|ya?ml)$/i.test(path)) continue;
      const content = await this.repository.readFileAt(context.commitSha, path);
      const digest = sha256(content);
      const component = {
        ...repositoryFileNode(path),
        attributes: { scipIndexDigest: this.scipDigest },
      };
      const provenance = {
        path,
        startLine: 1,
        endLine: Math.max(1, content.split('\n').length),
        digest,
        commitSha: context.commitSha,
      };
      facts.push({
        id: sha256(stableJson({ project, component, provenance, extractor: this.identity })),
        subject: project,
        predicate: 'contains',
        object: component,
        provenance,
        extractor: this.identity,
        confidence: 1,
        snapshotId: context.snapshotId,
      });
      const lines = content.split('\n');
      for (const [index, line] of lines.entries()) {
        const imported = line.match(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/)?.[1];
        if (!imported) continue;
        const contract = moduleRequestNode(path, imported);
        const importProvenance = { ...provenance, startLine: index + 1, endLine: index + 1 };
        facts.push({
          id: sha256(stableJson({ component, module: contract.id, importProvenance, extractor: this.identity })),
          subject: component,
          predicate: 'consumes',
          object: contract,
          provenance: importProvenance,
          extractor: this.identity,
          confidence: 1,
          snapshotId: context.snapshotId,
        });
      }
    }
    return facts;
  }
}

export const repositoryContractExtractorIdentity = { id: 'repository-contract-extractor', version: '1.2.0' } as const;

export class RepositoryContractExtractor implements FactExtractor {
  readonly identity = repositoryContractExtractorIdentity;

  constructor(
    private readonly repository: GitRepository,
    private readonly patterns: readonly string[],
    private readonly consumerRoots: readonly string[],
    private readonly aliases: Readonly<Record<string, readonly string[]>> = {},
  ) {}

  async extract(context: ExtractionContext): Promise<readonly GraphFact[]> {
    if (this.patterns.length === 0) return [];
    const paths = (await this.repository.listAllFilesAt(context.commitSha)).filter((path) =>
      this.patterns.some((pattern) => matchesRepositoryGlob(path, pattern)),
    );
    const packageManifests = (await this.repository.listAllFilesAt(context.commitSha)).filter(
      (path) => path.endsWith('package.json'),
    );
    const facts: GraphFact[] = [];
    for (const path of paths) {
      const content = await this.repository.readFileAt(context.commitSha, path);
      const provenance = {
        path,
        startLine: 1,
        endLine: Math.max(1, content.split('\n').length),
        digest: sha256(content),
        commitSha: context.commitSha,
      };
      const contract = {
        id: `contract:file:${path}`,
        kind: 'Contract' as const,
        label: path,
      };
      const source = {
        id: `evidence:contract-file:${path}`,
        kind: 'Evidence' as const,
        label: path,
      };
      facts.push({
        id: sha256(stableJson({ source, contract, provenance })),
        subject: source,
        predicate: 'contains' as const,
        object: contract,
        provenance,
        extractor: this.identity,
        confidence: 1,
        snapshotId: context.snapshotId,
      });

      const needles = [path, ...(this.aliases[path] ?? [])];
      const manifest = packageManifests
        .filter((candidate) => path.startsWith(candidate.slice(0, -'package.json'.length)))
        .sort((left, right) => right.length - left.length)[0];
      if (manifest) {
        const parsed = JSON.parse(
          await this.repository.readFileAt(context.commitSha, manifest),
        ) as { name?: unknown };
        if (typeof parsed.name === 'string' && parsed.name.startsWith('@')) {
          needles.push(parsed.name);
        }
      }
      const matches = await this.repository.findTextAt(
        context.commitSha,
        needles,
        this.consumerRoots,
      );
      for (const match of matches.filter(
        (candidate) => candidate.path !== path && candidate.path !== manifest,
      )) {
        const consumerContent = await this.repository.readFileAt(context.commitSha, match.path);
        const consumerProvenance = {
          path: match.path,
          startLine: match.line,
          endLine: match.line,
          digest: sha256(consumerContent),
          commitSha: context.commitSha,
        };
        const consumer = repositoryFileNode(match.path);
        facts.push({
          id: sha256(stableJson({ consumer, contract, consumerProvenance })),
          subject: consumer,
          predicate: 'consumes',
          object: contract,
          provenance: consumerProvenance,
          extractor: this.identity,
          confidence: 1,
          snapshotId: context.snapshotId,
        });
      }
    }
    return facts;
  }
}
