// Modified for standalone extraction; see docs/extraction-manifest.json.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { withCommittedTree } from "../repository/committed-tree.js";
import { DataFactory, Store, Writer } from 'n3';
import { CG, nodeIri } from "../graph/rdf.js";
import { cp, lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, relative, resolve, sep } from 'node:path';

import type { ContextGraphConfig } from "../configuration/config.js";
import type { SemanticArtifact, ExtractionContext } from "@weftlet/core";
import type { GitRepository } from "../repository/git.js";
import { runProcess } from "../infrastructure/process.js";

export interface OntologyCompileResult {
  readonly root: string;
  readonly rdfFiles: readonly string[];
  readonly digest: string;
}

export interface OntologyCompiler {
  checkReady?(): Promise<void>;
  compile(
    snapshotId: string,
    artifacts: readonly SemanticArtifact[],
    context?: ExtractionContext,
  ): Promise<OntologyCompileResult>;
}

type DockerProbe = (cwd: string) => Promise<string>;
const probeDocker: DockerProbe = async (cwd) => {
  const { stdout } = await promisify(execFile)('docker', ['info', '--format', '{{.OSType}}'], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  return stdout;
};

export async function requireLinuxDocker(
  cwd: string,
  probe: DockerProbe = probeDocker,
): Promise<void> {
  try {
    if ((await probe(cwd)).trim() !== 'linux') throw new Error('Linux engine required');
  } catch (cause) {
    throw new Error(
      'Context graph Docker preflight failed: a responsive Linux Docker engine is required for openCAESAR. Start Docker Desktop (Linux containers) or repair the selected Docker context, then retry.',
      { cause },
    );
  }
}

export function dockerHostUserArguments(): readonly string[] {
  if (process.platform === 'win32' || !process.getuid || !process.getgid) return [];
  return [
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '--env',
    'GRADLE_USER_HOME=/workspace/.gradle',
  ];
}

export async function compileOntologyAtExactCheckout(
  repository: GitRepository,
  compiler: OntologyCompiler,
  ref: string,
): Promise<OntologyCompileResult> {
  const commitSha = await repository.resolveRef(ref);
  await repository.requireExactCleanCommit(commitSha);
  return compiler.compile(commitSha, []);
}

export function renderGeneratedOntologyRoot(
  artifacts: readonly SemanticArtifact[],
  usedVocabularyIris: readonly string[] = [],
  includedDescriptionIris: readonly string[] = [],
): string {
  const generatedImports = artifacts
    .filter((artifact) => artifact.oml.trim())
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((artifact) => `  includes <https://context-graph.dev/generated/${artifact.key}#>`);
  const vocabularyImports = ['https://context-graph.dev/core#', ...usedVocabularyIris]
    .filter((iri, index, values) => values.indexOf(iri) === index)
    .map((iri) => `  uses <${iri}>`);
  const staticImports = [...includedDescriptionIris].sort().map((iri) => `  includes <${iri}>`);
  return [
    'description bundle <https://context-graph.dev/generated/snapshot#> as snapshot {',
    ...vocabularyImports,
    ...staticImports,
    ...generatedImports,
    '}',
  ].join('\n');
}

async function listRdfFiles(root: string): Promise<readonly string[]> {
  const files: string[] = [];
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (/\.(ttl|nt|rdf|owl)$/i.test(entry.name)) files.push(child);
    }
  }
  await visit(root);
  return files.sort();
}

export class OpenCaesarOntologyCompiler implements OntologyCompiler {
  constructor(
    private readonly config: ContextGraphConfig['ontology'],
    private readonly repositoryRoot: string,
    private readonly storageRoot: string,
  ) {}

  checkReady(): Promise<void> {
    return requireLinuxDocker(this.repositoryRoot);
  }

  async compile(
    snapshotId: string,
    artifacts: readonly SemanticArtifact[],
    context?: ExtractionContext,
  ): Promise<OntologyCompileResult> {
    if (context) {
      return withCommittedTree(context.repositoryRoot, context.commitSha, (root) =>
        new OpenCaesarOntologyCompiler(this.config, root, this.storageRoot).compile(snapshotId, artifacts));
    }
    await this.checkReady();
    if (!this.config.projectPath || !this.config.containerImage) {
      throw new Error('Optional openCAESAR requires projectPath and containerImage');
    }
    const source = resolve(this.repositoryRoot, this.config.projectPath);
    const work = join(this.storageRoot, 'work', `ontology-${randomUUID()}`);
    await rm(work, { recursive: true, force: true });
    await mkdir(dirname(work), { recursive: true });
    const sourceBuild = join(source, 'build');
    await cp(source, work, {
      recursive: true,
      filter: (path) => path !== sourceBuild && !path.startsWith(`${sourceBuild}${sep}`),
    });
    // Relabel only our disposable copy, never a symlink into the source project.
    if (process.platform === 'linux' && !(await lstat(work)).isDirectory()) {
      throw new Error('openCAESAR compiler workspace must be a real directory before writing or mounting');
    }
    const generatedRoot = join(work, 'src', 'oml', 'context-graph.dev', 'generated');
    await mkdir(generatedRoot, { recursive: true });
    for (const artifact of artifacts) {
      if (!artifact.oml.trim()) continue;
      await writeFile(
        join(generatedRoot, `${artifact.key}.oml`),
        `${artifact.oml.trim()}\n`,
        'utf8',
      );
    }
    await writeFile(
      join(generatedRoot, 'snapshot.oml'),
      `${renderGeneratedOntologyRoot(
        artifacts,
        this.config.usedVocabularyIris,
        this.config.includedDescriptionIris,
      )}\n`,
      'utf8',
    );
    const dockerPath = work.replace(/\\/g, '/');
    const workspaceMount = `${dockerPath}:/workspace${process.platform === 'linux' ? ':Z' : ''}`;
    await runProcess(
      'docker',
      [
        'run',
        '--rm',
        ...dockerHostUserArguments(),
        '-v',
        workspaceMount,
        '-w',
        '/workspace',
        this.config.containerImage,
        'gradle',
        '--no-daemon',
        'clean',
        'oml2owl',
      ],
      this.repositoryRoot,
    );
    const rdfRoot = join(work, 'build', 'rdf');
    const rdfFiles = await listRdfFiles(rdfRoot);
    if (rdfFiles.length === 0) throw new Error('openCAESAR produced no RDF files');
    return { root: rdfRoot, rdfFiles, digest: await digestRdfFiles(rdfRoot, rdfFiles) };
  }
}

/** Default compiler preserves asserted semantics without Java, Docker, or an OWL reasoner. */
export class DirectRdfOntologyCompiler implements OntologyCompiler {
  constructor(private readonly storageRoot: string) {}

  async compile(snapshotId: string, artifacts: readonly SemanticArtifact[]): Promise<OntologyCompileResult> {
    const { namedNode } = DataFactory;
    const dataset = new Store();
    for (const artifact of [...artifacts].sort((a, b) => a.key.localeCompare(b.key))) {
      for (const fact of artifact.facts) {
        dataset.addQuad(namedNode(nodeIri(fact.subject.id)), namedNode(CG + fact.predicate),
          namedNode(nodeIri(fact.object.id)));
      }
    }
    const writer = new Writer({ format: 'N-Triples' });
    const lines = Array.from(dataset, quad => writer.quadToString(quad.subject, quad.predicate, quad.object, quad.graph)).sort();
    const root = join(this.storageRoot, 'work', `rdf-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const path = join(root, 'semantic.nt');
    const digest = createHash('sha256');
    function* content() {
      // The legacy empty dataset encodes a single newline too.
      for (const line of lines.length ? lines : ['\n']) { digest.update(line); yield line; }
    }
    await pipeline(content(), createWriteStream(path, { flags: 'wx' }));
    return { root, rdfFiles: [path], digest: digest.digest('hex') };
  }
}

/** Exact legacy stableJson([{content, path}, ...]) digest, including UTF-8 decoding/escaping. */
export async function digestRdfFiles(root: string, files: readonly string[]): Promise<string> {
  const hash = createHash('sha256').update('[');
  for (const [index, path] of files.entries()) {
    hash.update(`${index ? ',' : ''}{"content":"`);
    for await (const chunk of createReadStream(path, { encoding: 'utf8' })) {
      hash.update(JSON.stringify(chunk).slice(1, -1));
    }
    hash.update(`","path":${JSON.stringify(relative(root, path))}}`);
  }
  return hash.update(']').digest('hex');
}
