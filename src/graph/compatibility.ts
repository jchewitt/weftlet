import type { CompatibilityReason, ContractCompatibilityAssessment, ContractCompatibilityReport, ContractCompatibilityRequest,
  ContractCompatibilityService, GraphFact, GraphSnapshot, SnapshotStore } from '@weftlet/core';
import { RdfEvidenceGraph } from './rdf.js';
import { snapshotContext } from './snapshot-context.js';
import { selectDiagnostics } from './diagnostics.js';
import { parseContractCompatibilityRequest } from './compatibility-request.js';
import { compareDeclaredConstraints } from './constraint-comparison.js';
import { compatibilityContext } from './compatibility-context.js';
import { renderContractCompatibility } from './compatibility-renderer.js';
import { coverageForFacts } from './coverage.js';

const conditions = [
  'Only the two selected numeric declarations are compared, within this saved scope; other product obligations may exist.',
  'Matching metric/unit names assume the same meaning. No unit conversion, transformations or elapsed-time model is inferred.',
  'Source approval and assertion review stay on the cited facts. This assessment supplies no policy approval or CI pass/fail.',
  'Implementation correctness, runtime delivery, consumer rejection/availability and current-diff validity are not established.',
] as const;

async function assessSelected(snapshot: GraphSnapshot, facts: readonly GraphFact[], context: ContractCompatibilityReport['context'],
  diagnostics: ContractCompatibilityReport['diagnostics']): Promise<ContractCompatibilityAssessment> {
  const base = { version: 'declared-constraint-comparison-v1' as const, scope: 'selected-assertion-pair' as const,
    authority: facts.some(fact => fact.authority === 'draft') ? 'draft' as const : 'inferred' as const,
    gateEligible: false as const, fulfillment: 'not-evaluated' as const, conditions };
  const unknown = (...reasons: CompatibilityReason[]): ContractCompatibilityAssessment => ({ ...base, status: 'unknown', reasons });
  if (facts.length !== 2) return unknown('missing-assertion');
  if (facts.some(fact => !fact.contractObligation || fact.snapshotId !== snapshot.manifest.snapshotId ||
      fact.provenance.commitSha !== snapshot.manifest.commitSha)) return unknown('invalid-evidence');
  // Bound structural validation to these two records. Never revalidate the complete saved graph on a read query.
  if (!(await new RdfEvidenceGraph({ ...snapshot, facts }).validate()).conforms) return unknown('invalid-evidence');
  const [producer, consumer] = facts;
  if (producer!.object.id !== consumer!.object.id) return unknown('different-contracts');
  const gaps: CompatibilityReason[] = [];
  if (context.competingFacts) gaps.push('competing-declarations');
  if (['missingIntent', 'ambiguousIntent', 'implementationGaps'].some(key => {
    const section = diagnostics[key as 'missingIntent' | 'ambiguousIntent' | 'implementationGaps'];
    return section.items.length || section.omittedRelevant;
  })) gaps.push('extraction-gaps');
  if (gaps.length) return unknown(...gaps);
  return { ...base, ...compareDeclaredConstraints(producer!.contractObligation!.declaration, consumer!.contractObligation!.declaration) };
}

/** Read-only exact pair assessment over the same lossless RDF facts used by exploration and visualization. */
export class SnapshotContractCompatibilityService implements ContractCompatibilityService {
  constructor(private readonly store: Pick<SnapshotStore, 'read'>) {}
  async assess(input: ContractCompatibilityRequest): Promise<ContractCompatibilityReport> {
    const request = parseContractCompatibilityRequest(input), snapshot = await this.store.read(request.snapshotId);
    if (!snapshot) throw new Error('No graph snapshot is available for that identifier');
    if (snapshot.manifest.snapshotId !== request.snapshotId) throw new Error('Saved snapshot identity does not match the requested identifier');
    const all = await new RdfEvidenceGraph(snapshot).facts();
    const byId = new Map(all.map(fact => [fact.id, fact]));
    if (byId.size !== all.length) throw new Error('Duplicate fact identities prevent exact compatibility selection');
    const facts = [request.producerFactId, request.consumerFactId].flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
    const context = compatibilityContext(all, facts);
    const diagnostics = selectDiagnostics(snapshot, {}, facts, [], [], new Set(context.contractNodeIds));
    const assessment = await assessSelected(snapshot, facts, context, diagnostics);
    const plain = { snapshot: snapshotContext(snapshot.manifest), selection: request, facts,
      coverage: coverageForFacts(facts, snapshot), assessment, context, diagnostics };
    return { ...plain, markdown: renderContractCompatibility(plain) };
  }
}
