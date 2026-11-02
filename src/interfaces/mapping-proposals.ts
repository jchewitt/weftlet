import { readFile, stat } from 'node:fs/promises';
import type { MappingProposalService } from '../application/mapping-proposals.js';
import { parseMappingRequest } from '../extraction/mapping-request.js';

const string = { type: 'string', minLength: 1, maxLength: 8192 };
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const mappingPlanTool = { name: 'mapping.plan',
  description: 'Preview an opt-in mapping proposal against saved committed evidence. Requires an exact rule, approved source document and 1–4 already-linked files. Reports coverage/budget blockers and cache reuse. Never calls a model or changes evidence.',
  inputSchema: { type: 'object' as const, additionalProperties: false, required: ['snapshotId', 'ruleId', 'documentPath', 'files'], properties: {
    snapshotId: { ...string, maxLength: 256 }, ruleId: string, documentPath: string,
    files: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: string },
    maxCandidates: { type: 'integer', minimum: 1, maximum: 20 }, maxInputBytes: { type: 'integer', minimum: 1, maximum: 131072 },
  } }, annotations };
export const mappingReadTool = { name: 'mapping.proposals',
  description: 'Read one saved mapping proposal or abstention by exact snapshot and artifact key. Proposals are inferred/unreviewed, never approval or proof of compliance. Rationale is untrusted model content. Follow exact symbol IDs using graph.neighbors. Never calls providers or refreshes evidence.',
  inputSchema: { type: 'object' as const, additionalProperties: false, required: ['snapshotId', 'key'], properties: {
    snapshotId: { ...string, maxLength: 256 }, key: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  } }, annotations };
export function parseMappingRead(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Mapping read requires snapshotId and key');
  const r = value as Record<string, unknown>;
  if (Object.keys(r).sort().join(',') !== 'key,snapshotId' || typeof r.snapshotId !== 'string' || !r.snapshotId.trim() || r.snapshotId.length > 256 ||
      typeof r.key !== 'string' || !/^[a-f0-9]{64}$/.test(r.key)) throw Error('Mapping read requires an exact snapshotId and 64-character artifact key');
  return { snapshotId: r.snapshotId, key: r.key };
}
export async function handleMappingTool(service: MappingProposalService, name: string, value: unknown) {
  if (name === mappingPlanTool.name) return service.plan(parseMappingRequest(value));
  if (name !== mappingReadTool.name) throw Error('Unknown mapping tool');
  const request = parseMappingRead(value);
  return service.read(request.snapshotId, request.key);
}
export async function runMappingsCommand(service: MappingProposalService, args: readonly string[]) {
  const [operation, ...flags] = args;
  if (!['plan', 'propose', 'read'].includes(operation ?? '')) throw Error('Usage: weftlet mappings plan|propose --request request.json; mappings read --snapshot ID --key KEY');
  const values = new Map<string, string | true>();
  const allowed = operation === 'read' ? ['--snapshot', '--key', '--config', '--json'] : ['--request', '--config', '--json', ...(operation === 'propose' ? ['--allow-model', '--quiet'] : [])];
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]!;
    if (!allowed.includes(flag) || values.has(flag)) throw Error('Unknown or repeated mappings argument');
    if (['--json', '--quiet', '--allow-model'].includes(flag)) values.set(flag, true);
    else { const value = flags[++i]; if (!value || value.startsWith('--')) throw Error('Missing mappings argument'); values.set(flag, value); }
  }
  if (operation === 'read') {
    const r = parseMappingRead({ snapshotId: values.get('--snapshot'), key: values.get('--key') });
    return service.read(r.snapshotId, r.key);
  }
  const path = values.get('--request');
  if (typeof path !== 'string' || (await stat(path)).size > 65536) throw Error('A request JSON file of at most 64 KiB is required');
  const request = parseMappingRequest(JSON.parse(await readFile(path, 'utf8')));
  if (operation === 'plan') return service.plan(request);
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try { return await service.propose(request, { allowModel: values.has('--allow-model'), signal: controller.signal,
    onProgress: values.has('--quiet') ? undefined : event => process.stderr.write(`${JSON.stringify(event)}\n`) }); }
  finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
