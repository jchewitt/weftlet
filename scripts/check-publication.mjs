// Modified for standalone extraction; see docs/extraction-manifest.json.
import { execFile, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { pnpmInvocation } from './package-manager.mjs';
import { checkReleaseDocumentation, checkPackedReleaseDocumentation } from './release-documentation.mjs';

const toolkitRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packages = [
  ['@weftlet/core', resolve(toolkitRoot, 'packages', 'core')],
  ['@weftlet/toolkit', toolkitRoot],
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      result.error?.message || result.stderr?.trim() || result.stdout?.trim() || `${command} exited ${result.status}`,
    );
  }
  return result.stdout;
}

function runPnpm(args, cwd) {
  const invocation = pnpmInvocation(args);
  return run(invocation.command, invocation.args, cwd);
}

async function npmCliPath() {
  // Invoke npm's JavaScript entry point directly, including on Windows where npm.cmd
  // cannot be launched through execFile without a shell.
  const candidates = [
    ...(process.env.npm_execpath?.endsWith('npm-cli.js') ? [process.env.npm_execpath] : []),
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ];
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error('npm CLI not found beside Node; install Node with npm to run the npx smoke test');
}

await checkReleaseDocumentation(toolkitRoot);
const destination = await mkdtemp(join(tmpdir(), 'context-graph-pack-'));
try {
  const archives = new Map();
  const preparedPackages = [];
  for (const [expectedName, directory] of packages) {
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    if (manifest.name !== expectedName || manifest.private === true) {
      throw new Error(`${directory} is not configured as publishable ${expectedName}`);
    }
    if (manifest.license !== 'Apache-2.0' || manifest.publishConfig?.access !== 'public') {
      throw new Error(`${expectedName} must publish as public Apache-2.0 software`);
    }
    const before = new Set(await readdir(destination));
    runPnpm(['pack', '--pack-destination', destination], directory);
    const archiveName = (await readdir(destination)).find((entry) => !before.has(entry));
    if (!archiveName) throw new Error(`${expectedName} did not produce a package archive`);
    const archivePath = join(destination, archiveName);
    archives.set(expectedName, archivePath);
    preparedPackages.push({ name: expectedName, version: manifest.version, filename: archiveName, path: archivePath });
    const entries = run('tar', ['-tf', archivePath], directory).split(/\r?\n/);
    for (const required of [
      'package/package.json',
      'package/LICENSE',
      'package/NOTICE',
      'package/README.md',
      'package/THIRD_PARTY_NOTICES.md',
      'package/dist/index.js',
      'package/dist/index.d.ts',
    ]) {
      if (!entries.includes(required))
        throw new Error(`${expectedName} archive is missing ${required}`);
    }
    if (expectedName === '@weftlet/toolkit') {
      for (const asset of [
        'dist/cli.js', 'dist/mcp.js',
        'dist/interfaces/cli.js', 'dist/interfaces/mcp.js', 'dist/extraction/static.js',
        'dist/extraction/scip-project.js', 'dist/configuration/scip-project.js',
        'dist/extraction/document.js', 'dist/extraction/document-references.js', 'dist/extraction/module-request.js',
        'dist/extraction/routing.js', 'dist/extraction/repository-nodes.js',
        'dist/application/hydration-plan.js', 'dist/application/cache-adoption.js',
        'dist/application/semantic-artifact-store.js', 'dist/application/semantic-scope.js',
        'dist/application/semantic-run.js', 'dist/application/hydration-failure.js',
        'dist/application/extraction-identity.js',
        'dist/extraction/semantic-diagnostics.js',
        'dist/extraction/semantic-identity.js',
        'dist/extraction/semantic-cache.js', 'dist/extraction/semantic-sources.js',
        'dist/graph/ranking.js', 'dist/graph/coverage.js', 'dist/graph/shacl-shapes.js',
        'dist/graph/identity-preflight.js', 'dist/graph/validation-progress.js',
        'dist/application/document-coverage.js', 'dist/extraction/document-traversal.js',
        'dist/extraction/canonical-document-links.js', 'dist/interfaces/document-coverage.js',
        'dist/extraction/document-classification.js', 'dist/extraction/document-classification.d.ts',
        'dist/extraction/document-evidence.js', 'dist/extraction/document-evidence.d.ts',
        'dist/graph/document-role-description.js',
        'runtime-check.mjs', 'runtime-check.d.mts',
        'examples/generic-typescript/context-graph.config.json',
        'examples/generic-typescript/ontology/build.gradle',
        'examples/generic-typescript/ontology/src/oml/context-graph.dev/core.oml',
        'templates/context-graph-development/SKILL.md',
      ]) {
        if (!entries.includes(`package/${asset}`)) throw new Error(`Missing runtime asset: ${asset}`);
      }
    }
    if (expectedName === '@weftlet/core' && (!entries.includes('package/dist/repository-nodes.js') ||
      !entries.includes('package/dist/repository-nodes.d.ts') || Object.keys(manifest.dependencies ?? {}).length)) {
      throw new Error('Core must include the public physical-file factory without runtime package dependencies');
    }
    if (entries.some((entry) => /(?:^|\/)(?:\.git|\.env|\.context-graph|node_modules)(?:\/|$)/.test(entry))) {
      throw new Error('Archive contains forbidden local state');
    }
    const packedManifest = JSON.parse(
      run('tar', ['-xOf', archivePath, 'package/package.json'], directory),
    );
    const ranges = [
      ...Object.values(packedManifest.dependencies ?? {}),
      ...Object.values(packedManifest.devDependencies ?? {}),
    ];
    if (ranges.some((range) => String(range).startsWith('workspace:'))) {
      throw new Error(`${expectedName} archive retains an unpublished workspace dependency range`);
    }
    if (expectedName === '@weftlet/toolkit' &&
        packedManifest.bin?.[expectedName.split('/').at(-1)] !== 'dist/cli.js') {
      throw new Error('Package must expose its basename as a CLI binary for npx executable inference');
    }
  }

  const documented = await checkPackedReleaseDocumentation(toolkitRoot, preparedPackages);
  // Only validated, constrained examples are used; never evaluate Markdown as shell code.
  const [coreArchive, toolkitArchive] = documented.archiveNames.map((filename) => join(destination, filename));
  if (!coreArchive || !toolkitArchive) throw new Error('Publication smoke archives are incomplete');
  const freshProject = join(destination, 'fresh-project');
  await mkdir(join(freshProject, 'src'), { recursive: true });
  await writeFile(join(freshProject, 'package.json'), '{"name":"fresh-npx-project","private":true}');
  // Serve only these scoped packages from a disposable registry. This verifies one-package
  // npx inference and automatic core dependency installation before any public publish.
  const registryPackages = new Map();
  const servedArchives = new Set();
  for (const [name, directory] of packages) {
    const manifest = JSON.parse(run('tar', ['-xOf', archives.get(name), 'package/package.json'], directory));
    registryPackages.set(name, { manifest, bytes: await readFile(archives.get(name)) });
  }
  let registryUrl;
  const registry = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const tarball = path.endsWith('.tgz');
    const name = path.slice(1).replace(/\.tgz$/, '');
    const item = registryPackages.get(name);
    if (!item) { response.writeHead(404); response.end(); return; }
    if (tarball) { servedArchives.add(name); response.end(item.bytes); return; }
    const { manifest, bytes } = item;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ name, 'dist-tags': { latest: manifest.version }, versions: {
      [manifest.version]: { ...manifest, dist: { tarball: `${registryUrl}/${name}.tgz`,
        integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` } },
    } }));
  });
  await new Promise((resolve, reject) => {
    registry.once('error', reject);
    registry.listen(0, '127.0.0.1', resolve);
  });
  try {
    registryUrl = `http://127.0.0.1:${registry.address().port}`;
    await writeFile(join(freshProject, '.npmrc'), `@weftlet:registry=${registryUrl}\n`);
    const npmCli = await npmCliPath();
    const npmCache = join(destination, 'npm-cache');
    const npx = async (...args) => (await promisify(execFile)(process.execPath,
      [npmCli, '--cache', npmCache, 'exec', '--yes', '--', ...args],
      { cwd: freshProject, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 })).stdout;
    const setup = await npx(...documented.npxCommands[0]);
    if (!setup.includes('Setup made no model requests')) throw new Error('Packed npx initialization failed');
    const initialized = JSON.parse(await readFile(join(freshProject, 'context-graph.config.json'), 'utf8'));
    if (initialized.repositoryId !== 'fresh-npx-project' || initialized.approvedIntentSources.length ||
        initialized.semanticSources.length) throw new Error('Unexpected generated config');
    if (!JSON.parse(await npx(...documented.npxCommands[1])).valid) throw new Error('Generated config is invalid');
    if (JSON.parse(await npx(documented.npxCommands[0][0], 'config', 'show')).repositoryId !== 'fresh-npx-project') {
      throw new Error('Packed config show failed');
    }
    if (!(await readFile(join(freshProject, '.gitignore'), 'utf8')).includes('.context-graph/')) {
      throw new Error('Setup did not exclude generated evidence from Git');
    }
    if (packages.some(([name]) => !servedArchives.has(name))) {
      throw new Error('Fresh npx setup did not fetch both prepared archives from the disposable registry');
    }
    // Exercise the documented npm archive pair as well as the pinned npx commands.
    await promisify(execFile)(process.execPath,
      [npmCli, '--cache', npmCache, 'install', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund', coreArchive, toolkitArchive],
      { cwd: freshProject, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
    const installed = JSON.parse(await readFile(join(freshProject, 'package-lock.json'), 'utf8'));
    for (const [name, archive] of [['@weftlet/core', coreArchive], ['@weftlet/toolkit', toolkitArchive]]) {
      const dependency = installed.packages[`node_modules/${name}`];
      if (dependency?.version !== registryPackages.get(name).manifest.version ||
          dependency.integrity !== `sha512-${createHash('sha512').update(await readFile(archive)).digest('base64')}`) {
        throw new Error(`Documented archive installation did not install reviewed ${name} bytes`);
      }
    }
  } finally {
    registry.closeAllConnections();
    await new Promise((resolve) => registry.close(resolve));
  }
  const consumer = join(destination, 'consumer');
  await mkdir(join(consumer, 'src'), { recursive: true });
  await mkdir(join(consumer, 'test'), { recursive: true });
  const fileDependency = (path) => `file:${path.replaceAll('\\', '/')}`;
  await Promise.all([
    writeFile(join(consumer, '.gitignore'), 'node_modules/\n.context-graph/\n'),
    writeFile(
      join(consumer, 'package.json'),
      `${JSON.stringify(
        {
          name: 'context-graph-publication-smoke',
          private: true,
          type: 'module',
          dependencies: {
            '@weftlet/core': fileDependency(coreArchive),
            '@weftlet/toolkit': fileDependency(toolkitArchive),
          },
          pnpm: {
            overrides: {
              '@weftlet/core': fileDependency(coreArchive),
            },
          },
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      join(consumer, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            target: 'ES2022',
            strict: true,
          },
          include: ['src/**/*.ts'],
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(join(consumer, 'src', 'contract.ts'), 'export interface Greeting { text: string }\n'),
    writeFile(join(consumer, 'src', 'archive.ts'), 'export const archive = (value: unknown) => value;\n'),
    writeFile(join(consumer, 'routing.json'), JSON.stringify({ schemaVersion: 1, routes: [{
      id: 'archive', scope: 'public-smoke', channel: 'greeting.completed',
      producer: 'src/consumer.ts', consumer: 'src/archive.ts',
    }] }) + '\n'),
    writeFile(join(consumer, 'intent.md'), '# Greeting\nSee [implementation](src/consumer.ts) and [checks](test/contract.test.ts).\n'),
    writeFile(join(consumer, 'coverage.md'), '# Public coverage\nSee [notes](notes.md) and [intent](intent.md).\n'),
    writeFile(join(consumer, 'notes.md'), '# Public notes\nReturn to [coverage](coverage.md).\n'),
    writeFile(join(consumer, 'role-owner.md'), '# Public owner\n[Draft](draft-plan.md), [review](document-review.md), [empty review](empty-review.md).\n'),
    writeFile(join(consumer, 'draft-plan.md'), '# Unapproved plan\n[Implementation](src/consumer.ts).\n'),
    writeFile(join(consumer, 'document-review.md'), '# Review\nPASS is a reported checklist, not a test execution claim.\n[Checks](test/contract.test.ts).\n'),
    writeFile(join(consumer, 'empty-review.md'), ''),
    ...['provider', 'adapter'].map(name => writeFile(join(consumer, `document-preview-${name}.mjs`),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(new URL('./unexpected-document-import', import.meta.url), '${name}');\nthrow Error('Document preview must not initialize ${name}');\n`)),
    writeFile(join(consumer, 'test', 'contract.test.ts'), "import type { Greeting } from '@fixture/contracts';\nexport const tested: Greeting = { text: 'test' };\n"),
    writeFile(
      join(consumer, 'src', 'consumer.ts'),
      "import type { Greeting } from './contract.js';\nexport const greeting: Greeting = { text: 'hello' };\n",
    ),
  ]);
  runPnpm(['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], consumer);
  const staticModule = pathToFileURL(
    join(consumer, 'node_modules', '@weftlet', 'toolkit', 'dist', 'extraction', 'static.js'),
  ).href;
  const toolkitModule = pathToFileURL(
    join(consumer, 'node_modules', '@weftlet', 'toolkit', 'dist', 'index.js'),
  ).href;
  await writeFile(join(consumer, 'adapter-core.mjs'),
    "import { repositoryFileNode } from '@weftlet/core';\nexport const adapterFileNode = path => ({ ...repositoryFileNode(path), attributes: { adapter: 'public-fixture' } });\n");
  await writeFile(
    join(consumer, 'smoke.mjs'),
    `import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ScipSymbolExtractor, ScipTypeScriptIndexer, RepositoryFileExtractor, RepositoryContractExtractor } from ${JSON.stringify(staticModule)};
import { repositoryFileNode } from '@weftlet/core';
import { adapterFileNode } from './adapter-core.mjs';
import { linkSemanticDocuments } from ${JSON.stringify(new URL('document.js', staticModule).href)};
import { extractRoutingDeclarations } from ${JSON.stringify(new URL('routing.js', staticModule).href)};
import { GitRepository } from ${JSON.stringify(new URL('../repository/git.js', staticModule).href)};
import { renderContextPackVisualization, RdfEvidenceGraph, CG, SnapshotImpactQueryService,
  inspectGraphIdentities, assertGraphIdentities, GraphIdentityConflictError } from ${JSON.stringify(toolkitModule)};

const root = process.cwd();
if (repositoryFileNode('test/contract.test.ts').kind !== 'Evidence' ||
    repositoryFileNode('src/consumer.ts').kind !== 'Component' ||
    repositoryFileNode('intent.md').id !== 'document:intent.md' ||
    adapterFileNode('test/contract.test.ts').kind !== 'Evidence') {
  throw new Error('Installed public core factory must preserve adapter/neutral physical-file identity');
}
const context = {
  repositoryRoot: root,
  repositoryId: 'publication-smoke',
  ref: 'HEAD',
  commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  snapshotId: 'publication-smoke',
  changedPaths: [],
  deletedPaths: [],
  renamedPaths: {},
};
const index = await new ScipTypeScriptIndexer(
  {
    version: '0.4.0',
    command: 'bundled-scip-typescript',
    args: ['index', '--no-global-caches', 'tsconfig.json'],
  },
  join(root, '.context-graph'),
).index(context);
const repository = {
  readFileAt: async (_commitSha, path) => readFile(join(root, path), 'utf8'),
  listFilesAt: async () => [],
};
const defaultFacts = await new ScipSymbolExtractor(repository, index).extract(context);
if (!index.digest || defaultFacts.length < 2) {
  throw new Error('Installed toolkit did not index and parse the SCIP fixture');
}
const sourceIndex = await new ScipTypeScriptIndexer({ version: '0.4.0', command: 'bundled-scip-typescript',
  args: ['index', '--no-global-caches'], sourceProject: { include: ['src/**/*.ts', 'test/**/*.ts'],
    aliases: { '@fixture/contracts': 'src/contract.ts' } } }, join(root, '.context-graph'))
  .index({ ...context, snapshotId: 'publication-source-project' });
const sourceFacts = await new ScipSymbolExtractor(repository, sourceIndex).extract(context);
const definition = sourceFacts.find((fact) => fact.predicate === 'contains' && fact.object.label.includes('Greeting#'));
if (!definition || !sourceFacts.some((fact) => fact.provenance.path === 'test/contract.test.ts' &&
    fact.predicate === 'consumes' && fact.object.id === definition.object.id)) {
  throw new Error('Installed source project did not link an excluded test through its local package alias');
}
const content = execFileSync('git', ['show', context.commitSha + ':intent.md'], { encoding: 'utf8' });
const documents = linkSemanticDocuments(context, [{ source: { path: 'intent.md', content,
  digest: createHash('sha256').update(content).digest('hex'), stableSemanticId: 'greeting' }, artifact: { facts: [] } }],
  ['src/consumer.ts', 'test/contract.test.ts']);
if (documents.diagnostics.length || documents.facts.length !== 2 ||
    !documents.facts.some((fact) => fact.object.kind === 'Evidence' && fact.provenance.startLine === 2)) {
  throw new Error('Installed Markdown linker did not preserve targets and citations');
}
const fileFacts = await new RepositoryFileExtractor({ ...repository,
  listFilesAt: async () => ['src/consumer.ts'] }, ['src'], sourceIndex.digest).extract(context);
const moduleRequest = fileFacts.find((fact) => fact.predicate === 'consumes');
if (moduleRequest?.object.id !== 'contract:module:./src%2Fcontract.js' ||
    moduleRequest.object.attributes?.resolution !== 'unresolved' || moduleRequest.extractor.version !== '2.0.0') {
  throw new Error('Installed file extractor did not preserve repository-relative request identity');
}
const routing = await extractRoutingDeclarations(new GitRepository(root), context, ['routing.json']);
if (routing.facts.length !== 2 || routing.diagnostics.length ||
    routing.facts.some((fact) => fact.authority !== 'inferred' || fact.extractionReview !== 'deterministic')) {
  throw new Error('Installed routing declarations did not retain explicit bindings and evidence authority');
}
const contractFacts = await new RepositoryContractExtractor(new GitRepository(root), ['src/contract.ts'],
  ['src', 'test'], { 'src/contract.ts': ['@fixture/contracts', './contract.js'] }).extract(context);
const testConsumer = contractFacts.find(fact => fact.predicate === 'consumes' && fact.provenance.path === 'test/contract.test.ts');
if (testConsumer?.subject.id !== adapterFileNode('test/contract.test.ts').id ||
    testConsumer.subject.kind !== 'Evidence' || testConsumer.extractor.version !== '1.2.0') {
  throw new Error('Installed neutral contract consumer and public adapter factory must agree on test Evidence');
}
const facts = [...sourceFacts, ...documents.facts, ...fileFacts, ...routing.facts, ...contractFacts];
const preflight = assertGraphIdentities(facts, { repositoryId: context.repositoryId });
if (!preflight.passed || preflight.shaclValidated || preflight.factCount !== facts.length) {
  throw new Error('Installed identity preflight must remain separate from full SHACL validation');
}
const conflicting = { ...testConsumer, id: 'public-preflight-conflict',
  subject: { ...testConsumer.subject, kind: 'Component' } };
const badFacts = [...facts, conflicting];
const beforePreflight = JSON.stringify(badFacts);
let identityFailure;
try { assertGraphIdentities(badFacts, { repositoryId: context.repositoryId }); }
catch (error) { identityFailure = error; }
if (!(identityFailure instanceof GraphIdentityConflictError) || identityFailure.report.conflictCount !== 1 ||
    JSON.stringify(identityFailure.report).includes('test/contract.test.ts') ||
    JSON.stringify(identityFailure.report).includes(conflicting.id)) {
  throw new Error('Installed identity failure must be typed and opaque by default');
}
const localReport = inspectGraphIdentities(badFacts, { repositoryId: context.repositoryId, includeDetails: true });
const attributed = localReport.conflicts.flatMap(item => item.occurrences)
  .find(item => item.details?.factId === conflicting.id);
if (JSON.stringify(attributed?.details?.provenance) !== JSON.stringify(conflicting.provenance) ||
    JSON.stringify(badFacts) !== beforePreflight) {
  throw new Error('Installed explicit identity attribution must preserve all source evidence');
}
const snapshot = { manifest: { schemaVersion:1, repositoryId:'publication-smoke',ref:'HEAD',commitSha:context.commitSha,snapshotId:context.snapshotId,contentDigest:index.digest,generatedAt:'2026-01-01',ontologyVersion:'rdf-v1',extractorVersions:{},semanticModel:'none',semanticPromptVersion:'none',semanticArtifactKeys:[],scipIndexDigest:index.digest,rdfDigest:'' }, facts, invariants:[],runtimeEvidence:[],unresolved:[] };
const graph = new RdfEvidenceGraph(snapshot);
const validationProgress = [];
if (!(await graph.validate({ onProgress: event => validationProgress.push(event) })).conforms ||
    validationProgress.map(event => event.phase + ':' + event.status).join(',') !==
    'build-validation-union:started,build-validation-union:completed,validate-shacl:started,validate-shacl:completed') {
  throw new Error('Installed full SHACL validation and phase timing failed');
}
if ((await new RdfEvidenceGraph({ ...snapshot, facts: badFacts }).validate()).conforms) {
  throw new Error('Installed full SHACL must still reject the preflight kind conflict');
}
const selected = await graph.select('SELECT ?record WHERE { ?record <' + CG + 'authority> ?authority }');
if (selected.rows.length !== facts.length || (await graph.facts()).length !== facts.length) throw new Error('Installed RDF projection/query mismatch');
const query = new SnapshotImpactQueryService({ read: async () => snapshot, readHead: async () => snapshot,
  write: async () => {}, updateHead: async () => {} }, 'default');
let page = await query.scan({ changedFiles: ['src/contract.ts'], maxFacts: 2 });
const returned = [...page.facts];
while (page.exploration?.continuation) {
  if (returned.length >= facts.length) throw new Error('Installed continuation did not terminate');
  page = await query.scan({ changedFiles: ['src/contract.ts'], maxFacts: 2, continuation: page.exploration.continuation });
  returned.push(...page.facts);
}
if (!page.exploration?.rankingVersion || new Set(returned.map((fact) => fact.id)).size !== facts.length || returned.length !== facts.length) {
  throw new Error('Installed ranked query lost or repeated reachable evidence');
}
const scipSnapshot = { ...snapshot, facts: sourceFacts };
const scipQuery = new SnapshotImpactQueryService({ read: async () => scipSnapshot, readHead: async () => scipSnapshot,
  write: async () => {}, updateHead: async () => {} }, 'default');
const scipPack = await scipQuery.scan({ maxFacts: 200 });
const productionFacts = sourceFacts.filter(fact => fact.subject.kind === 'Component');
if (!productionFacts.length || scipPack.coverage.scope !== 'returned-page' ||
    scipPack.coverage.countsAreNonExclusive !== true ||
    scipPack.coverage.counts.implementationAndConsumers !== productionFacts.length ||
    scipPack.coverage.counts.contractsAndInvariants !== productionFacts.length ||
    scipPack.diagnostics.implementationGaps.items.length ||
    JSON.stringify(scipSnapshot.facts) !== JSON.stringify(sourceFacts)) {
  throw new Error('Installed SCIP consumers must count as implementation and contracts without rewriting evidence');
}
const pack = await query.scan({ maxFacts: 200 });
if (pack.facts.length !== facts.length || !renderContextPackVisualization(pack, 'html').includes('may overlap')) {
  throw new Error('Installed viewer must explain the same returned-page evidence coverage as agent queries');
}
for (const [format, marker] of [['html', '<!doctype html>'], ['dot', 'digraph ContextPack'], ['svg', '<svg']]) {
  if (!renderContextPackVisualization(pack, format).includes(marker)) {
    throw new Error('Installed toolkit did not render the ' + format + ' Context Pack visualization');
  }
}
`,
  );
  run('git', ['init', '--quiet'], consumer);
  run('git', ['add', '.'], consumer);
  run(
    'git',
    [
      '-c',
      'user.name=Publication Smoke',
      '-c',
      'user.email=smoke@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'Create exact-commit smoke fixture',
    ],
    consumer,
  );
  const installedRoot = join(consumer, 'node_modules', '@weftlet', 'toolkit');
  const previewConfig = JSON.parse(await readFile(
    join(installedRoot, 'examples/generic-typescript/context-graph.config.json'), 'utf8',
  ));
  Object.assign(previewConfig, { semanticSources: ['intent.md'], approvedIntentSources: [],
    adapter: './missing-preview-adapter.mjs',
    semantic: { ...previewConfig.semantic, provider: 'module', providerIdentity: 'publication-preview:1',
      providerModule: './missing-preview-provider.mjs', timeoutMs: 600_000 } });
  delete previewConfig.semantic.auth;
  await writeFile(join(consumer, 'preview.config.json'), JSON.stringify(previewConfig));
  const plan = JSON.parse(run(process.execPath, [join(installedRoot, 'dist/cli.js'),
    'hydrate', '--plan', '--json', '--config', 'preview.config.json'], consumer));
  if (!plan.ready || plan.documents.length !== 1 || plan.documents[0].path !== 'intent.md' ||
      plan.documents[0].cache.status !== 'miss' || plan.estimates.extractions !== 1 ||
      (await readdir(consumer)).includes('.context-graph')) {
    throw new Error('Installed hydration preview must accept a ten-minute timeout without adapters, providers or graph writes');
  }
  const publicApi = await import(toolkitModule);
  if (typeof publicApi.planHydration !== 'function') throw new Error('Missing public hydration planner export');
  if (typeof publicApi.adoptSemanticCache !== 'function') throw new Error('Missing public cache adoption export');
  if (typeof publicApi.planDocumentCoverage !== 'function' || typeof publicApi.traverseDocuments !== 'function') {
    throw new Error('Missing public prospective document coverage exports');
  }
  const coverage = JSON.parse(run(process.execPath, [join(installedRoot, 'dist/cli.js'),
    'documents', 'plan', '--entry', 'coverage.md', '--json', '--config', 'preview.config.json'], consumer));
  const publicCoverage = await publicApi.planDocumentCoverage(join(consumer, 'preview.config.json'), { entryPoints: ['coverage.md'] });
  if (!coverage.ready || coverage.mode !== 'prospective' || coverage.changesHydrationSelection !== false ||
      coverage.documents.length !== 3 || coverage.coverageDigest !== publicCoverage.coverageDigest ||
      coverage.documents.some((document) => document.status !== 'read') || 'estimates' in coverage ||
      (await readdir(consumer)).includes('.context-graph')) {
    throw new Error('Installed document coverage must traverse committed links without changing hydration or writing evidence');
  }
  const limitedCoverage = spawnSync(process.execPath, [join(installedRoot, 'dist/cli.js'), 'documents', 'plan',
    '--entry', 'coverage.md', '--max-read-documents', '1', '--json', '--config', 'preview.config.json'],
  { cwd: consumer, encoding: 'utf8', timeout: 20_000 });
  if (limitedCoverage.status !== 1 || limitedCoverage.stderr !== '' ||
      JSON.parse(limitedCoverage.stdout).coverage.unvisited.length !== 2) {
    throw new Error('Installed document coverage must report an incomplete frontier when a read limit is reached');
  }
  for (const name of ['parseDocumentClassificationPolicy', 'classifyDocumentSources', 'extractDocumentEvidence']) {
    if (typeof publicApi[name] !== 'function') throw new Error(`Missing public document evidence export: ${name}`);
  }
  const documentPolicy = publicApi.parseDocumentClassificationPolicy({ schemaVersion: 1,
    roles: [{ id: 'draft-role', pattern: 'draft-plan.md', role: 'plan' },
      { id: 'review-role', pattern: '*-review.md', role: 'validation' }],
    owners: [{ id: 'owner-self', pattern: 'role-owner.md', ownerDocument: 'role-owner.md' },
      { id: 'draft-owner', pattern: 'draft-plan.md', ownerDocument: 'role-owner.md' }] });
  const documentConfig = { ...previewConfig, approvedIntentSources: ['role-owner.md', '*-review.md'],
    evidenceRoots: ['legacy-evidence'], adapter: './document-preview-adapter.mjs',
    semantic: { ...previewConfig.semantic, providerModule: './document-preview-provider.mjs' } };
  await writeFile(join(consumer, 'document-preview.config.json'), JSON.stringify(documentConfig));
  await writeFile(join(consumer, 'document-policy.json'), JSON.stringify(documentPolicy));
  const unchangedHydration = await publicApi.planHydration(join(consumer, 'preview.config.json'));
  const unchangedIndex = await readFile(join(consumer, '.git/index'));
  const documentPaths = ['role-owner.md', 'draft-plan.md', 'document-review.md', 'empty-review.md'];
  const unchangedDocuments = await Promise.all(documentPaths.map(path => readFile(join(consumer, path))));
  const policyCoverage = JSON.parse(run(process.execPath, [join(installedRoot, 'dist/cli.js'), 'documents', 'plan',
    '--entry', 'role-owner.md', '--document-policy', 'document-policy.json', '--json',
    '--config', 'document-preview.config.json'], consumer));
  const documentOptions = { entryPoints: ['role-owner.md'], documentPolicy,
    approvedIntentSources: documentConfig.approvedIntentSources, evidenceRoots: documentConfig.evidenceRoots };
  const apiPolicyCoverage = await publicApi.planDocumentCoverage(join(consumer, 'document-preview.config.json'), documentOptions);
  if (!policyCoverage.ready || !policyCoverage.classification.complete || policyCoverage.documents.length !== 4 ||
      policyCoverage.coverageDigest !== apiPolicyCoverage.coverageDigest ||
      policyCoverage.documents.find(document => document.path === 'document-review.md')?.sourceRole !== 'validation' ||
      policyCoverage.documents.find(document => document.path === 'document-review.md')?.sourceAuthority !== 'declared' ||
      policyCoverage.documents.find(document => document.path === 'draft-plan.md')?.sourceAuthority !== 'inferred' ||
      policyCoverage.documents.find(document => document.path === 'draft-plan.md')?.ownership.status !== 'resolved') {
    throw new Error('Installed documents plan must load explicit policy without promoting approved validation or linked drafts');
  }
  const documentContext = { repositoryRoot: consumer, repositoryId: 'publication-document-evidence', ref: 'HEAD',
    commitSha: policyCoverage.commitSha, snapshotId: 'publication-document-evidence', changedPaths: [], deletedPaths: [], renamedPaths: {} };
  const documentEvidence = await publicApi.extractDocumentEvidence(new publicApi.GitRepository(consumer), documentContext, documentOptions);
  const classified = publicApi.classifyDocumentSources(documentPaths, { approvedIntentSources: documentConfig.approvedIntentSources,
    evidenceRoots: documentConfig.evidenceRoots, availableDocuments: documentPaths }, documentPolicy);
  if (!documentEvidence.classification.complete || documentEvidence.diagnostics.length ||
      publicApi.stableJson(documentEvidence.classification) !== publicApi.stableJson(classified) ||
      !documentEvidence.facts.some(fact => fact.provenance.path === 'empty-review.md' && fact.predicate === 'contains' &&
        fact.object.kind === 'Document' && fact.provenance.digest === publicApi.sha256('')) ||
      documentEvidence.facts.some(fact => fact.authority !== 'inferred' || fact.extractionReview !== 'deterministic' ||
        fact.predicate === 'verifiedBy' || fact.sourcePolicyDigest !== classified.policyDigest)) {
    throw new Error('Installed deterministic document extraction must preserve policy, empty documents and unreviewed business authority');
  }
  for (const fact of documentEvidence.facts) {
    const committed = await new publicApi.GitRepository(consumer).readFileAt(documentContext.commitSha, fact.provenance.path);
    if (fact.provenance.commitSha !== documentContext.commitSha || fact.provenance.digest !== publicApi.sha256(committed)) {
      throw new Error('Installed document evidence lost its exact committed provenance');
    }
  }
  const documentSnapshot = { manifest: { schemaVersion: 1, repositoryId: documentContext.repositoryId, ref: 'HEAD',
    commitSha: documentContext.commitSha, snapshotId: documentContext.snapshotId,
    contentDigest: publicApi.sha256(publicApi.stableJson(documentEvidence.facts)), generatedAt: '2026-01-01',
    ontologyVersion: 'rdf-v1', extractorVersions: {}, semanticModel: 'none', semanticPromptVersion: 'none',
    semanticArtifactKeys: [], scipIndexDigest: '', rdfDigest: '' },
    facts: documentEvidence.facts, invariants: [], runtimeEvidence: [], unresolved: [] };
  const documentGraph = new publicApi.RdfEvidenceGraph(documentSnapshot);
  const documentRows = await documentGraph.select('SELECT ?fact WHERE { ?fact <' + publicApi.CG + 'sourceRole> ?role; <' +
    publicApi.CG + 'ownershipStatus> ?status; <' + publicApi.CG + 'sourcePolicyDigest> ?policy }');
  if (!(await documentGraph.validate()).conforms || documentRows.rows.length !== documentEvidence.facts.length ||
      publicApi.stableJson(await documentGraph.facts()) !== publicApi.stableJson(documentEvidence.facts)) {
    throw new Error('Installed document metadata must survive strict SHACL and exact RDF projection');
  }
  const documentQuery = new publicApi.SnapshotImpactQueryService({ read: async () => documentSnapshot,
    readHead: async () => documentSnapshot, write: async () => {}, updateHead: async () => {} }, 'default');
  const documentPack = await documentQuery.scan({ ownerDocument: 'role-owner.md', maxFacts: 100 });
  const documentHtml = publicApi.renderContextPackVisualization(documentPack, 'html');
  if (publicApi.stableJson([...documentPack.facts].sort((a, b) => a.id.localeCompare(b.id))) !==
      publicApi.stableJson([...documentEvidence.facts].sort((a, b) => a.id.localeCompare(b.id))) ||
      documentPack.coverage.counts.implementationAndConsumers !== 0 || documentPack.coverage.counts.validationEvidence < 3 ||
      !documentPack.markdown.includes('source role validation; ownership not-required') ||
      !documentPack.markdown.includes('source role plan; ownership resolved; owner documents role-owner.md') ||
      !documentHtml.includes('class="visual-node column-evidence" data-visual-node="true" data-node-id="document:document-review.md"') ||
      !documentHtml.includes('source role validation; ownership not-required')) {
    throw new Error('Installed query and viewer must expose exact source roles and ownership without retyping Document nodes');
  }
  if (publicApi.stableJson(await publicApi.planHydration(join(consumer, 'preview.config.json'))) !== publicApi.stableJson(unchangedHydration) ||
      !(await readFile(join(consumer, '.git/index'))).equals(unchangedIndex) ||
      (await Promise.all(documentPaths.map(path => readFile(join(consumer, path))))).some((bytes, index) => !bytes.equals(unchangedDocuments[index])) ||
      (await readdir(consumer)).some(path => ['.context-graph', 'unexpected-document-import'].includes(path))) {
    throw new Error('Installed document policy/extraction must leave hydration inputs, checkout, index and provider/adapter initialization unchanged');
  }
  if (typeof publicApi.SemanticHydrationError !== 'function' ||
      typeof publicApi.semanticSourceId !== 'function' ||
      plan.documents[0].sourceId !== publicApi.semanticSourceId(plan.repositoryId, plan.documents[0])) {
    throw new Error('Installed diagnostics must export the safe error and match the local preview source ID');
  }
  const adoption = JSON.parse(run(process.execPath, [join(installedRoot, 'dist/cli.js'),
    'cache', 'adopt', '--config', 'preview.config.json', '--from-config', 'preview.config.json', '--dry-run'], consumer));
  if (!adoption.ready || !adoption.dryRun || adoption.records.length !== 1 || adoption.counts.missing !== 1 ||
      adoption.scope.selectors.join(',') !== 'intent.md' || (await readdir(consumer)).includes('.context-graph')) {
    throw new Error('Installed cache adoption must inspect expected committed keys without providers, adapters or writes');
  }
  await writeFile(join(consumer, 'failure.config.json'), JSON.stringify({ ...previewConfig, adapter: undefined }));
  const failure = spawnSync(process.execPath, [join(installedRoot, 'dist/cli.js'), 'hydrate',
    '--config', 'failure.config.json', '--json', '--quiet'], { cwd: consumer, encoding: 'utf8', timeout: 20_000 });
  if (failure.status !== 1 || failure.stdout !== '') throw new Error('Installed failed hydration must leave stdout clean');
  const failureReport = JSON.parse(failure.stderr);
  if (failureReport.code !== 'unavailable' || failureReport.category !== 'infrastructure' ||
      failureReport.timeoutMs !== 600_000 ||
      failureReport.sourceId !== plan.documents[0].sourceId || failureReport.progress.failed !== 1 ||
      failureReport.progress.completed !== 0 || failure.stderr.includes('intent.md') ||
      failure.stderr.includes(consumer) || failure.stderr.includes('missing-preview-provider')) {
    throw new Error('Installed hydration must safely report the unavailable provider and source mapping');
  }
  run(process.execPath, ['smoke.mjs'], consumer);
  const config = JSON.parse(await readFile(
    join(installedRoot, 'examples/generic-typescript/context-graph.config.json'), 'utf8',
  ));
  config.adapter = './adapter.mjs';
  await writeFile(join(consumer, 'adapter.mjs'),
    'export function createContextGraphAdapter() { return { factExtractors: [], invariantEvaluators: [] }; }\n');
  await writeFile(join(consumer, 'context-graph.config.json'), JSON.stringify(config));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(installedRoot, 'dist/mcp.js')],
    cwd: consumer,
    env: { ...process.env, CONTEXT_GRAPH_CONFIG: join(consumer, 'context-graph.config.json') },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'installed-smoke', version: '1.0.0' });
  try {
    await client.connect(transport);
    if (client.getServerVersion()?.name !== 'context-graph') throw new Error('MCP initialization failed');
    const tools = await client.listTools();
    if (!tools.tools.some((tool) => tool.name === 'impact.scan')) throw new Error('Missing impact.scan');
    const result = await client.callTool({ name: 'impact.scan', arguments: { capabilities: ['search'] } });
    if (!result.isError || !JSON.stringify(result).includes('snapshot')) {
      throw new Error('Empty installed consumer must report missing snapshot honestly');
    }
  } finally {
    await client.close();
  }
  console.log('Packed npm exec/npx setup and config passed. Installed consumer: no-model hydration preview and cache adoption, document policy and deterministic evidence APIs, runtime assets, TypeScript indexing, SCIP facts, RDF/SPARQL/SHACL, HTML/DOT/SVG and MCP passed.');
} finally {
  await rm(destination, { recursive: true, force: true });
}
