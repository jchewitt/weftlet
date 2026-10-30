#!/usr/bin/env node
// Modified for standalone extraction; see docs/extraction-manifest.json.

import "../../runtime-check.mjs";
import { resolve } from 'node:path';
import process from 'node:process';

import { createContextGraphApplication } from "../application/application.js";
import type { ImpactScanRequest } from "@weftlet/core";
import { compileOntologyAtExactCheckout } from "../extraction/ontology.js";
import { visualizeContextPack } from "../visualization/visualization.js";
import { buildWorkingOverlay } from "../application/overlay.js";
import { RdfEvidenceGraph } from "../graph/rdf.js";
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { analyzeArchitecture, type ArchitecturePolicy } from "../governance/governance.js";
import { FileSnapshotStore } from "../storage/storage.js";
import { diagnoseSetup } from "./doctor.js";
import { runInit } from "./init.js";
import { loadConfig } from "../configuration/config.js";
import { planHydration, type HydrationPlan } from '../application/hydration-plan.js';
import { adoptSemanticCache } from '../application/cache-adoption.js';
import { SemanticHydrationError } from '../application/hydration-failure.js';
import { GraphIdentityConflictError } from '../graph/identity-preflight.js';
import { runDocumentCoverage } from './document-coverage.js';
import { graphNeighborsRequestFromArgs } from './graph-exploration.js';
import { graphPathsRequestFromArgs } from './graph-paths.js';
import { graphCompatibilityRequestFromArgs } from './graph-compatibility.js';

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function valuesAfter(args: readonly string[], name: string): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1] as string);
  }
  return values;
}

function defaultConfigPath(): string {
  const local = resolve('context-graph.config.json');
  return local;
}

export function impactRequestFromArgs(args: readonly string[]): ImpactScanRequest {
  return {
    snapshotId: valueAfter(args, '--snapshot'),
    ownerDocument: valueAfter(args, '--owner-doc'),
    task: valueAfter(args, '--task'),
    checklistItems: valuesAfter(args, '--checklist'),
    changedFiles: valuesAfter(args, '--changed-file'),
    symbols: valuesAfter(args, '--symbol'),
    capabilities: valuesAfter(args, '--capability'),
    maxFacts: valueAfter(args, '--max-facts') ? Number(valueAfter(args, '--max-facts')) : undefined,
    maxDepth: valueAfter(args, '--max-depth') ? Number(valueAfter(args, '--max-depth')) : undefined,
    continuation: valueAfter(args, '--continuation'),
  };
}

function formatHydrationPlan(plan: HydrationPlan): string {
  const readiness = plan.issues.some((issue) => issue.severity === 'error')
    ? 'blocked' : plan.ready ? 'ready' : 'needs review';
  const lines = [
    `Hydration plan: ${plan.repositoryId}`,
    `Commit: ${plan.commitSha} (ref ${plan.ref})`,
    `Configuration: ${plan.configurationDigest}`,
    `Scope: ${plan.scope.mode}, ${plan.scope.complete ? 'complete' : 'incomplete'}; head ${plan.scope.headName}`,
    `Documents: ${plan.budgets.selectedDocuments}/${plan.budgets.maxDocuments}; ${plan.budgets.totalSourceBytes} bytes total; ${plan.budgets.maxSourceBytes} bytes maximum per document`,
    `Expected cache reuse: ${plan.estimates.reusableArtifacts}; extractions: ${plan.estimates.extractions}; unknown cache entries: ${plan.estimates.unknownArtifacts}`,
    `Source/cache/budget checks: ${readiness}`,
  ];
  if (plan.documentSelection) {
    const selection = plan.documentSelection;
    lines.push(`Document traversal: ${selection.complete ? 'complete' : 'blocked'}; identity ${selection.digest}; policy ${selection.policyDigest}`);
    lines.push(`Discovered: ${selection.documentPaths.length}; semantic candidates: ${selection.semanticPaths.length}`);
    for (const excluded of selection.excluded) lines.push(`Excluded from model extraction: ${JSON.stringify(excluded.path)} (${excluded.reason}); retained traversal/evidence reporting.`);
  }
  if (plan.documentCoverage) {
    const { limits, counters } = plan.documentCoverage.traversal;
    lines.push(`Traversal reads: ${counters.readDocuments}/${limits.maxReadDocuments} documents; ${counters.readBytes}/${limits.maxReadBytes} bytes; ${limits.maxDocumentBytes} bytes maximum per document`);
  }
  for (const document of plan.documents) {
    lines.push(`- ${JSON.stringify(document.path)} [${document.sourceId}]: ${document.bytes} bytes, ${document.lines} lines; ${document.role}; source ${document.sourceAuthority}, extraction ${document.extractionReview}; cache ${document.cache.status}; selected by ${document.selectedBy.map((selector) => JSON.stringify(selector)).join(', ')}`);
  }
  for (const document of plan.documentCoverage?.classification.documents ?? []) {
    lines.push(`Classification ${JSON.stringify(document.path)}: ${document.sourceRole}; owner ${document.ownership.status}; ${document.ownership.ownerDocuments.map(path => JSON.stringify(path)).join(', ')}`);
  }
  for (const selection of plan.selections.filter((item) => item.status !== 'matched')) {
    lines.push(`Selection ${JSON.stringify(selection.selector)}: ${selection.status}`);
  }
  for (const issue of plan.issues) lines.push(`${issue.severity.toUpperCase()} [${issue.code}]: ${issue.message}`);
  if (plan.scope.omittedDocuments.length) {
    lines.push(`Documents omitted by scope limits: ${plan.scope.omittedDocuments.map((path) => JSON.stringify(path)).join(', ')}`);
  }
  if (plan.scope.ignoredSearchTerms) lines.push(`Search terms omitted by scope limits: ${plan.scope.ignoredSearchTerms}`);
  if (plan.excludedWorkingChanges.length) {
    lines.push(`Working changes excluded: ${plan.excludedWorkingChanges.map((path) => JSON.stringify(path)).join(', ')}`);
  }
  lines.push(...plan.assumptions.map((assumption) => `Note: ${assumption}`));
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || !args.length) {
    process.stdout.write('weftlet documents plan|init|config show|config validate|doctor|hydrate|cache adopt|overlay|impact scan|graph neighbors|graph paths|graph compatibility|sparql|validate|govern|visualize|diagnostics show|invariant check|clean-compare|ontology compile\nUse --config <file>; queries accept --snapshot <id>. impact scan accepts --changed-file, --capability, --max-facts, --max-depth, --continuation.\ngraph neighbors --snapshot <id> --node <exact-id> [--direction incoming|outgoing|both] [--predicate <relation>] [--max-facts <1..200>] [--continuation <token>] [--json] reads one-hop saved evidence; repeat --predicate to select multiple relations.\ngraph paths --snapshot <id> --from <exact-id> --to <exact-id> [--direction incoming|outgoing|both] [--predicate <relation>] [--max-depth <1..32>] [--max-paths <1..20>] [--max-steps <1..10000>] [--continuation <token>] [--json] explores cited simple paths; incomplete searches report frontier and limits.\ngraph compatibility --snapshot <id> --producer-fact <assertion-id> --consumer-fact <assertion-id> [--json] compares two documented numeric obligations; advisory only, with explicit unknowns and no implementation or CI verdict.\ndocuments plan --entry <document> [--entry <document>] [--root <path>] [--document-policy <json-file>] [--ref <commit>] [--json] previews prospective committed link coverage; it does not change hydration inputs or estimate model/cache work. Source classification/ownership completeness is separate from traversal readiness. The preview policy is an operation input. Set documentTraversal in configuration to activate traversal hydration; hydrate --plan describes its execution inputs. Safety limits: --max-read-documents, --max-read-bytes, --max-document-bytes.\nhydrate --plan [--json] [--ref <commit>] [--force-semantic] previews scope, cache and budgets without model calls or graph writes. Traversal coverage and role ambiguity block new model work; direct-source selection retains its existing behavior.\nhydrate --json --quiet emits structured semantic failures on stderr with no progress lines; failure stdout stays empty. hydrate --plan maps opaque source IDs to local document paths.\nhydrate|overlay --validation-details explicitly includes local node/fact identities, extractor names and source citations in identity-conflict errors; default reports use opaque references. This flag writes no diagnostic file. Use --json --quiet for structured identity-conflict stderr and empty failure stdout. Validation timings report phase boundaries, not a live heartbeat or percentage.\ncache adopt --from-config <previous.json> [--config <current.json>] [--ref <commit>] [--dry-run] returns JSON and copies only validated compatible artifacts, without model calls or snapshot writes. --dry-run performs no cache writes. Agent configurations accept the same --owner-doc, --task and --capability selection as hydrate.\ninit [--yes] [--directory <project>] [--config <file>] [--repository-id <id>] [--code-root <path>] [--semantic-source <path>] [--evidence-root <path>] [--model <name>] [--no-gitignore]\nSource flags may be repeated. init never overwrites an existing config. See README.md for examples.\n');
    return;
  }
  if (await runDocumentCoverage(args, defaultConfigPath)) return;
  if (args[0] === 'init') {
    await runInit(args.slice(1));
    return;
  }
  if (args[0] === 'config') {
    if (!['show', 'validate'].includes(args[1] ?? '')) throw new Error('Usage: context-graph config show|validate [--config <file>]');
    const loaded = await loadConfig(valueAfter(args, '--config') ?? defaultConfigPath());
    process.stdout.write(`${JSON.stringify(args[1] === 'show' ? loaded.config :
      { valid: true, configPath: loaded.configPath, repositoryRoot: loaded.repositoryRoot }, null, 2)}\n`);
    return;
  }
  if (args[0] === 'govern') {
    const policyFile = resolve(valueAfter(args, '--policy') ?? 'architecture.policy.json');
    const policy = JSON.parse(await readFile(policyFile, 'utf8')) as ArchitecturePolicy;
    const result = await analyzeArchitecture(dirname(policyFile), policy, basename(policyFile));
    await new FileSnapshotStore(join(dirname(policyFile), '.context-graph')).write(result.snapshot);
    const reportPath = valueAfter(args, '--output');
    if (reportPath) {
      await mkdir(dirname(resolve(reportPath)), { recursive: true });
      await writeFile(resolve(reportPath), `${JSON.stringify(result, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify({ passed: result.passed, findings: result.findings.length, snapshotId: result.snapshot.manifest.snapshotId, reportPath })}\n`);
    } else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.passed) process.exitCode = 1;
    return;
  }
  const configPath = valueAfter(args, '--config') ?? defaultConfigPath();
  if (args[0] === 'cache') {
    const fromConfigPath = valueAfter(args, '--from-config');
    if (args[1] !== 'adopt' || !fromConfigPath || fromConfigPath.startsWith('--')) {
      throw new Error('Usage: weftlet cache adopt --from-config <previous.json> [--config <current.json>] [--ref <commit>] [--dry-run]');
    }
    const result = await adoptSemanticCache(configPath, {
      fromConfigPath, ref: valueAfter(args, '--ref') ?? 'HEAD', dryRun: args.includes('--dry-run'),
      request: impactRequestFromArgs(args),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ready) process.exitCode = 1;
    return;
  }
  if (args[0] === 'doctor') {
    process.stdout.write(`${JSON.stringify(await diagnoseSetup(configPath), null, 2)}\n`);
    return;
  }
  if (args[0] === 'hydrate' && args.includes('--plan')) {
    const plan = await planHydration(configPath, {
      ref: valueAfter(args, '--ref') ?? 'HEAD',
      forceSemantic: args.includes('--force-semantic'),
      request: impactRequestFromArgs(args),
    });
    process.stdout.write(args.includes('--json') ? `${JSON.stringify(plan, null, 2)}\n` : formatHydrationPlan(plan));
    if (!plan.ready) process.exitCode = 1;
    return;
  }
  const application = await createContextGraphApplication(configPath);
  const [command, subcommand] = args;
  if (command === 'sparql' || command === 'validate') {
    const id = valueAfter(args, '--snapshot');
    const snapshot = id ? await application.snapshotStore.read(id) :
      await application.snapshotStore.readHead(application.headName);
    if (!snapshot) throw new Error('No graph snapshot is available');
    const graph = new RdfEvidenceGraph(snapshot);
    if (command === 'validate') {
      const report = await graph.validate();
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (!report.conforms) process.exitCode = 1;
    } else {
      const query = valueAfter(args, '--query-file');
      if (!query) throw new Error('sparql requires --query-file <local SELECT query>');
      process.stdout.write(`${JSON.stringify(await graph.select(await readFile(query, 'utf8')), null, 2)}\n`);
    }
    return;
  }
  if (command === 'overlay') {
    const base = valueAfter(args, '--base-snapshot');
    if (!base) throw new Error('overlay requires --base-snapshot <committed snapshot ID>');
    const result = await buildWorkingOverlay(application.repository, application.config,
      application.snapshotStore, application.storageRoot, base, valueAfter(args, '--agent'),
      { validationDetails: args.includes('--validation-details') });
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
    return;
  }
  if (command === 'hydrate') {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.once('SIGINT', cancel);
    try {
      const ref = valueAfter(args, '--ref') ?? 'HEAD';
      const scope = await application.scopeResolver?.resolve(impactRequestFromArgs(args), ref);
      const result = await application.hydrator.hydrate({
        ref: scope?.commitSha ?? ref,
        headName: scope?.headName ?? application.headName,
        semanticSources: scope?.semanticSources,
        forceSemantic: args.includes('--force-semantic'),
        validationDetails: args.includes('--validation-details'),
        signal: controller.signal,
        onProgress: args.includes('--quiet') ? undefined : (event) =>
          process.stderr.write(`[context-graph] ${event.phase}${event.total === undefined ? '' : ` ${event.completed}/${event.total}`}` +
            `${event.status === undefined ? '' : ` ${event.status}`}` +
            `${event.factCount === undefined ? '' : ` facts=${event.factCount}`}${event.nodeCount === undefined ? '' : ` nodes=${event.nodeCount}`}` +
            `${event.sourceId === undefined ? '' : ` ${event.sourceId}`}${event.elapsedMs === undefined ? '' : ` ${event.elapsedMs} ms`}\n`),
      });
      process.stdout.write(
        `${JSON.stringify(
          {
            snapshotId: result.snapshot.manifest.snapshotId,
            commitSha: result.snapshot.manifest.commitSha,
            contentDigest: result.snapshot.manifest.contentDigest,
            semanticExtracted: result.semanticExtracted,
            semanticReused: result.semanticReused,
          },
          null,
          2,
        )}\n`,
      );
    } finally {
      process.removeListener('SIGINT', cancel);
    }
    return;
  }
  if (command === 'clean-compare') {
    const result = await application.snapshotChecks.compare(
      impactRequestFromArgs(args),
      valueAfter(args, '--ref') ?? 'HEAD',
    );
    process.stdout.write(`${result.snapshot.manifest.contentDigest}\n`);
    return;
  }
  if (command === 'impact' && subcommand === 'scan') {
    const pack = await application.queryService.scan(impactRequestFromArgs(args));
    process.stdout.write(
      args.includes('--json') ? `${JSON.stringify(pack, null, 2)}\n` : `${pack.markdown}\n`,
    );
    return;
  }
  if (command === 'graph' && subcommand === 'compatibility') {
    const result = await application.compatibilityService.assess(graphCompatibilityRequestFromArgs(args.slice(2)));
    process.stdout.write(`${args.includes('--json') ? JSON.stringify(result, null, 2) : result.markdown}\n`);
    return;
  }
  if (command === 'graph' && subcommand === 'paths') {
    const result = await application.pathService.paths(graphPathsRequestFromArgs(args.slice(2)));
    process.stdout.write(`${args.includes('--json') ? JSON.stringify(result, null, 2) : result.markdown}\n`);
    return;
  }
  if (command === 'graph' && subcommand === 'neighbors') {
    const result = await application.explorationService.neighbors(graphNeighborsRequestFromArgs(args.slice(2)));
    process.stdout.write(`${args.includes('--json') ? JSON.stringify(result, null, 2) : result.markdown}\n`);
    return;
  }
  if (command === 'visualize') {
    const outputPath = valueAfter(args, '--output');
    if (!outputPath) throw new Error('visualize requires --output <path>');
    const result = await visualizeContextPack(
      application.queryService,
      impactRequestFromArgs(args),
      {
        outputPath,
        format: valueAfter(args, '--format') as 'dot' | 'html' | 'svg' | undefined,
        force: args.includes('--force'),
        sourceUrlTemplate: valueAfter(args, '--source-url-template'),
      },
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'invariant' && subcommand === 'check') {
    const snapshot = await application.snapshotChecks.read(
      impactRequestFromArgs(args),
      valueAfter(args, '--ref') ?? 'HEAD',
    );
    process.stdout.write(`${JSON.stringify(snapshot.invariants, null, 2)}\n`);
    if (snapshot.invariants.some((item) => item.status !== 'pass')) process.exitCode = 1;
    return;
  }
  if (command === 'diagnostics' && subcommand === 'show') {
    const snapshotId = valueAfter(args, '--snapshot');
    if (!snapshotId)
      throw new Error('diagnostics show requires --snapshot <snapshotId> from a Context Pack');
    const snapshot = await application.snapshotStore.read(snapshotId);
    if (!snapshot) throw new Error('No graph snapshot is available for that identifier');
    process.stdout.write(
      `${JSON.stringify(
        {
          snapshotId,
          diagnostics: snapshot.diagnostics ?? [],
          legacyUnclassified: snapshot.unresolved,
          invariants: snapshot.invariants,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (command === 'ontology' && subcommand === 'compile') {
    const result = await compileOntologyAtExactCheckout(
      application.repository,
      application.ontologyCompiler,
      valueAfter(args, '--ref') ?? 'HEAD',
    );
    process.stdout.write(
      `${JSON.stringify({ digest: result.digest, files: result.rdfFiles }, null, 2)}\n`,
    );
    return;
  }
  throw new Error(
    'Usage: weftlet hydrate|clean-compare|impact scan|diagnostics show --snapshot <id>|invariant check|ontology compile|visualize --output <file.html|file.dot|file.svg>',
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof GraphIdentityConflictError
      ? process.argv.includes('--json') || process.argv.includes('--validation-details')
        ? JSON.stringify(error.report, null, 2) : error.message
      : error instanceof SemanticHydrationError
      ? process.argv.includes('--json') ? JSON.stringify(error.report, null, 2) : error.message
      : error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
