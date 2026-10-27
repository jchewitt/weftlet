import { planDocumentCoverage, type DocumentCoverageOptions, type DocumentCoveragePlan } from '../application/document-coverage.js';
import { open } from 'node:fs/promises';
import { parseDocumentClassificationPolicy } from '../extraction/document-classification.js';

const traversalFlags = ['--entry', '--root', '--document-policy', '--max-read-documents', '--max-read-bytes', '--max-document-bytes'];
const usage = 'Usage: weftlet documents plan --entry <document> [--entry <document>] [--root <path>] [--document-policy <json-file>] [--config <file>] [--ref <commit>] [--json] [--max-read-documents <count>] [--max-read-bytes <bytes>] [--max-document-bytes <bytes>]';

export function parseDocumentCoverageArgs(args: readonly string[]): { configPath?: string; policyPath?: string; json: boolean; options: DocumentCoverageOptions } | undefined {
  if (args[0] !== 'documents') {
    if (args.some(arg => traversalFlags.some(flag => arg === flag || arg.startsWith(`${flag}=`)))) {
      throw new Error('Document traversal options are supported only by documents plan; they do not change hydration selection.');
    }
    return undefined;
  }
  if (args[1] !== 'plan') throw new Error(usage);
  const values = new Map<string, string[]>();
  let json = false;
  for (let index = 2; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === '--json') { if (json) throw new Error(usage); json = true; continue; }
    if (![...traversalFlags, '--config', '--ref'].includes(flag)) throw new Error(usage);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(usage);
    if (values.has(flag) && flag !== '--entry' && flag !== '--root') throw new Error(usage);
    values.set(flag, [...(values.get(flag) ?? []), value]);
  }
  if (!values.has('--entry')) throw new Error(usage);
  const number = (flag: string): number | undefined => {
    const value = values.get(flag)?.[0];
    if (value === undefined) return undefined;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${flag} must be a positive integer`);
    return Number(value);
  };
  return { configPath: values.get('--config')?.[0], policyPath: values.get('--document-policy')?.[0], json, options: {
    entryPoints: values.get('--entry')!, roots: values.get('--root'), ref: values.get('--ref')?.[0],
    maxReadDocuments: number('--max-read-documents'), maxReadBytes: number('--max-read-bytes'),
    maxDocumentBytes: number('--max-document-bytes'),
  } };
}

export function formatDocumentCoverage(plan: DocumentCoveragePlan): string {
  const lines = [
    `Prospective document coverage: ${plan.repositoryId}`,
    `Commit: ${plan.commitSha} (requested ${JSON.stringify(plan.ref)})`,
    `Configuration: ${plan.configurationDigest}; coverage: ${plan.coverageDigest}`,
    'Hydration selection unchanged; no extraction/cache estimate.',
    `Entry points: ${plan.entryPoints.map(path => JSON.stringify(path)).join(', ')}`,
    `Roots: ${plan.roots.map(path => JSON.stringify(path)).join(', ')}`,
    `Coverage: ${plan.coverage.complete ? 'complete within supported local scope' : 'incomplete'}; budget comparison: ${plan.budgets.withinLimits ? 'within limits' : 'blocked'}`,
    `Source classification: ${plan.classification.complete ? 'complete' : 'gaps'}; policy: ${plan.classification.policyDigest}. This is separate from traversal/budget readiness.`,
    `Discovered documents: ${plan.budgets.documents}/${plan.budgets.maxDocuments}; bytes: ${plan.budgets.bytes}; maximum per extraction source: ${plan.budgets.maxSourceBytes}`,
    `Read limits: ${plan.limits.maxReadDocuments} documents, ${plan.limits.maxReadBytes} total bytes, ${plan.limits.maxDocumentBytes} bytes per document`,
  ];
  for (const document of plan.documents) lines.push(`- ${JSON.stringify(document.path)}: ${document.status}, ${document.bytes} bytes; ${document.role}; role ${document.sourceRole} (${document.roleStatus}); source ${document.sourceAuthority}, extraction ${document.extractionReview}; owner ${document.ownership.status} ${document.ownership.ownerDocuments.map(path => JSON.stringify(path)).join(', ')}; ${document.entryPoint ? 'entry point' : 'linked document'}`);
  for (const link of plan.links) lines.push(`Link ${JSON.stringify(link.sourcePath)}:${link.startLine}-${link.endLine}: ${link.status}${link.path ? ` ${JSON.stringify(link.path)}` : ''}`);
  for (const issue of plan.issues) lines.push(`${issue.severity.toUpperCase()} [${issue.code}]: ${issue.message}`);
  for (const issue of plan.classification.issues) lines.push(`CLASSIFICATION ${issue.severity.toUpperCase()} [${issue.code}]: ${issue.message} ${issue.paths.map(path => JSON.stringify(path)).join(', ')}`);
  if (plan.coverage.unvisited.length) lines.push(`Unread frontier: ${plan.coverage.unvisited.map(path => JSON.stringify(path)).join(', ')}`);
  if (plan.excludedWorkingChanges.length) lines.push(`Working changes excluded: ${plan.excludedWorkingChanges.map(path => JSON.stringify(path)).join(', ')}`);
  lines.push(...plan.assumptions.map(note => `Note: ${note}`));
  return `${lines.join('\n')}\n`;
}

async function readDocumentPolicy(path: string) {
  const handle = await open(path, 'r');
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > 65_536) throw new Error('Document policy must be a JSON file of at most 65536 bytes');
    const buffer = Buffer.alloc(65_537);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > 65_536) throw new Error('Document policy exceeds 65536 bytes');
    let parsed: unknown;
    try { parsed = JSON.parse(buffer.subarray(0, length).toString('utf8')); }
    catch { throw new Error('Document policy must contain valid JSON'); }
    return parseDocumentClassificationPolicy(parsed);
  } finally { await handle.close(); }
}

export async function runDocumentCoverage(args: readonly string[], defaultConfig: () => string): Promise<boolean> {
  const parsed = parseDocumentCoverageArgs(args);
  if (!parsed) return false;
  const options = parsed.policyPath ? { ...parsed.options, documentPolicy: await readDocumentPolicy(parsed.policyPath) } : parsed.options;
  const plan = await planDocumentCoverage(parsed.configPath ?? defaultConfig(), options);
  process.stdout.write(parsed.json ? `${JSON.stringify(plan, null, 2)}\n` : formatDocumentCoverage(plan));
  if (!plan.ready) process.exitCode = 1;
  return true;
}
