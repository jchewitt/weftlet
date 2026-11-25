// Modified for standalone extraction; see docs/extraction-manifest.json.
import type { ImpactQueryService, ImpactScanRequest } from "@weftlet/core";

export const impactScanToolName = 'impact.scan';

export async function handleImpactScan(service: ImpactQueryService, request: ImpactScanRequest) {
  return service.scan(request);
}

export const impactScanTool = {
  name: impactScanToolName,
  description:
    'Return a bounded, provenance-bearing impact Context Pack for a task, document, file, symbol, or capability. An explicit ownerDocument gives up to four early positions to exact owner-cited intent evidence, preferring assertions over generated document links. Inspect ownerIntent counts, citations, review and continuation; priority does not prove task relevance or completeness.',
  inputSchema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      snapshotId: { type: 'string' },
      ownerDocument: { type: 'string' },
      task: { type: 'string' },
      checklistItems: { type: 'array', items: { type: 'string' } },
      changedFiles: { type: 'array', items: { type: 'string' } },
      symbols: { type: 'array', items: { type: 'string' } },
      capabilities: { type: 'array', items: { type: 'string' } },
      maxFacts: { type: 'integer', minimum: 1, maximum: 200 },
      maxDepth: { type: 'integer', minimum: 1, maximum: 128 },
      continuation: { type: 'string', maxLength: 2048 },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
