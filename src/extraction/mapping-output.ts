import type { MappingProposalOutput, MappingProposalPlan } from '@weftlet/core';
import { SemanticProviderError } from './semantic-process.js';

const citation = { type: 'object', additionalProperties: false, required: ['startLine', 'endLine'],
  properties: { startLine: { type: 'integer', minimum: 1 }, endLine: { type: 'integer', minimum: 1 } } };
export const mappingOutputSchema = {
  type: 'object', additionalProperties: false, required: ['decision', 'reason', 'proposals'],
  properties: { decision: { type: 'string', enum: ['proposed', 'abstained'] }, reason: { type: 'string', minLength: 1, maxLength: 1000 },
    proposals: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false,
      required: ['symbolId', 'rationale', 'confidence', 'documentCitation', 'codeCitation'], properties: {
        symbolId: { type: 'string', minLength: 1, maxLength: 8192 }, rationale: { type: 'string', minLength: 1, maxLength: 1000 },
        confidence: { type: 'number', minimum: 0, maximum: 1 }, documentCitation: citation, codeCitation: citation } } } },
};
function fail(): never { throw new SemanticProviderError('invalid-output', 'Invalid mapping output or unsupported citation; no proposal was saved'); }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail();
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail();
  return value;
}
function lines(value: unknown) {
  const r = record(value, ['startLine', 'endLine']);
  if (!Number.isSafeInteger(r.startLine) || !Number.isSafeInteger(r.endLine) || Number(r.startLine) < 1 || Number(r.endLine) < Number(r.startLine)) fail();
  return { startLine: Number(r.startLine), endLine: Number(r.endLine) };
}
/** Provider schemas, cache hits and module output all pass the same fail-closed checks. */
export function validateMappingOutput(value: unknown, plan: MappingProposalPlan): MappingProposalOutput {
  const r = record(value, ['decision', 'reason', 'proposals']);
  if (!['proposed', 'abstained'].includes(String(r.decision)) || !Array.isArray(r.proposals) || r.proposals.length > plan.candidates.length ||
      (r.decision === 'abstained') !== (r.proposals.length === 0)) fail();
  const seen = new Set<string>();
  const proposals = r.proposals.map(value => {
    const p = record(value, ['symbolId', 'rationale', 'confidence', 'documentCitation', 'codeCitation']);
    const symbolId = string(p.symbolId, 8192), candidate = plan.candidates.find(c => c.node.id === symbolId);
    if (!candidate || seen.has(symbolId)) fail(); seen.add(symbolId);
    if (typeof p.confidence !== 'number' || !Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 1) fail();
    const documentCitation = lines(p.documentCitation), codeCitation = lines(p.codeCitation);
    // A line elsewhere in a shared owner document cannot support this rule's proposal.
    if (!plan.subjectEvidence.some(f => documentCitation.startLine >= f.provenance.startLine && documentCitation.endLine <= f.provenance.endLine) ||
        codeCitation.startLine < candidate.body.startLine || codeCitation.endLine > candidate.body.endLine) fail();
    return { symbolId, rationale: string(p.rationale), confidence: p.confidence, documentCitation, codeCitation };
  }).sort((a, b) => a.symbolId < b.symbolId ? -1 : a.symbolId > b.symbolId ? 1 : 0);
  return { decision: r.decision as MappingProposalOutput['decision'], reason: string(r.reason), proposals };
}
