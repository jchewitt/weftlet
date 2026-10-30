import type { GraphExplorationService, GraphPathQueryService, GraphSnapshot } from '@weftlet/core';
import { handleGraphNeighbors } from '../../src/interfaces/graph-exploration.js';
import type { MappingCase, MappingProtocol, MappingState } from './protocol.js';

/** Expected labels are compared only after observations; they never select evidence. */
export async function measureMappingCase(
  services: { explorationService: GraphExplorationService; pathService: GraphPathQueryService },
  snapshot: GraphSnapshot, item: MappingCase, budget: MappingProtocol['budget'],
) {
  const facts = snapshot.facts;
  const definitions = facts.filter(f => f.codeOccurrence?.role === 'definition' &&
    f.provenance.path === item.targetPath && f.subject.label === item.targetName);
  const targetIds = [...new Set(definitions.map(f => f.subject.id))].sort();
  const rulePresent = facts.some(f => f.subject.id === item.ruleId || f.object.id === item.ruleId);
  const mappings = facts.filter(f => f.codeBinding && f.subject.id === item.ruleId &&
    f.predicate === item.predicate && targetIds.includes(f.object.id));
  const fileClaims = facts.filter(f => f.subject.id === item.ruleId && f.predicate === item.predicate &&
    f.object.id === `component:file:${item.targetPath}`);
  const documentReferences = facts.filter(f => f.codeBinding && f.subject.id === `document:${item.document}` &&
    f.predicate === 'references' && targetIds.includes(f.object.id));
  const diagnostics = (snapshot.diagnostics ?? []).filter(d => d.kind === 'implementationGaps' &&
    d.provenance.some(p => p.path === item.document));
  const forbiddenMappings = facts.filter(f => f.codeBinding && f.subject.id === item.ruleId &&
    (item.forbiddenNames ?? []).includes(f.object.label ?? ''));
  const observed: MappingState = !rulePresent ? 'intent-absent' : mappings.length ?
    mappings.every(f => f.object.codeSymbol?.resolution === 'declaration-only') ? 'declaration-only-binding' :
      item.predicate === 'verifiedBy' ? 'explicit-test-binding' : 'explicit-indexed-binding' :
    diagnostics.length ? 'unresolved-selector' : fileClaims.length ? 'file-only-claim' :
      documentReferences.length ? 'document-symbol-reference-only' : 'mapping-absent';

  const pages = [];
  let continuation: string | undefined;
  const returned = new Set<string>();
  for (let index = 0; index < budget.maxPages; index++) {
    const request = { snapshotId: snapshot.manifest.snapshotId, nodeId: item.ruleId,
      direction: 'both' as const, maxFacts: budget.maxFacts, ...(continuation ? { continuation } : {}) };
    const response = await handleGraphNeighbors(services.explorationService, request);
    response.facts.forEach(f => returned.add(f.id));
    pages.push({ request, response });
    continuation = response.selection.continuation;
    if (!continuation) break;
  }
  // Reachability through a document or file is recorded separately from a direct mapping claim.
  const pathRequest = targetIds.length === 1 ? { snapshotId: snapshot.manifest.snapshotId,
    fromNodeId: item.ruleId, toNodeId: targetIds[0]!, direction: 'both' as const,
    predicates: ['implementedBy', 'verifiedBy', 'references', 'contains', 'definedBy'] as const,
    maxDepth: budget.maxDepth, maxPaths: budget.maxPaths, maxSteps: budget.maxSteps } : null;
  const pathResponse = pathRequest ? await services.pathService.paths(pathRequest) : null;
  return { id: item.id, observed, expected: item.expected, matchesExpected: observed === item.expected,
    nextAction: item.nextAction, rulePresent, targetIds, definitions,
    mappings, fileClaims, documentReferences,
    diagnostics, forbiddenMappings, agentQuery: { pages,
      returnedBytes: Buffer.byteLength(JSON.stringify(pages.map(p => p.response))),
      pageBudgetExhausted: Boolean(continuation), allDirectMappingsReturned: mappings.every(f => returned.has(f.id)),
      structuralPaths: { request: pathRequest, response: pathResponse,
        skippedReason: pathRequest ? null : targetIds.length ? 'ambiguous-target' : 'no-indexed-target' } } };
}
