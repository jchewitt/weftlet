import { sha256, stableJson, type ExtractorIdentity, type GraphFact, type GraphNodeKind,
  type SourceSpan } from '@weftlet/core';

/** Diagnostic detail is an invocation option, not extraction policy or a cache identity input. */
export interface GraphIdentityPreflightOptions {
  readonly repositoryId: string;
  readonly includeDetails?: boolean;
}

export type ReportedIdentityKind = GraphNodeKind | `unknown-kind-${string}`;

export interface GraphIdentityOccurrenceDetails {
  readonly nodeId: string;
  readonly nodeKind: GraphNodeKind;
  readonly factId: string;
  readonly extractor: ExtractorIdentity;
  readonly provenance: SourceSpan;
  readonly confidence: number;
  readonly authority?: GraphFact['authority'];
  readonly sourceAuthority?: GraphFact['sourceAuthority'];
  readonly extractionReview?: GraphFact['extractionReview'];
}

export interface GraphIdentityOccurrence {
  readonly factIndex: number;
  readonly side: 'subject' | 'object';
  readonly kind: ReportedIdentityKind;
  readonly factRef: string;
  readonly sourceRef: string;
  readonly extractorRef: string;
  readonly details?: GraphIdentityOccurrenceDetails;
}

export interface GraphIdentityConflict {
  readonly nodeRef: string;
  readonly kinds: readonly ReportedIdentityKind[];
  readonly occurrences: readonly GraphIdentityOccurrence[];
  readonly details?: { readonly nodeId: string };
}

export interface GraphIdentityPreflightReport {
  readonly schemaVersion: 1;
  readonly kind: 'graph-identity-preflight';
  readonly category: 'extraction-gap';
  readonly phase: 'validate-identities';
  readonly passed: boolean;
  /** A passing identity preflight never establishes full graph conformance. */
  readonly shaclValidated: false;
  readonly factCount: number;
  readonly nodeCount: number;
  readonly conflictCount: number;
  readonly conflicts: readonly GraphIdentityConflict[];
}

const publicKinds: ReadonlySet<string> = new Set<GraphNodeKind>([
  'Project', 'Document', 'Capability', 'Workflow', 'Component', 'Contract', 'Evidence',
  'Invariant', 'Snapshot', 'Provider', 'PersistenceModel', 'Scope',
]);

/** Find the single-kind constraint's conflicts without constructing RDF or changing any fact. */
export function inspectGraphIdentities(facts: readonly GraphFact[],
  options: GraphIdentityPreflightOptions): GraphIdentityPreflightReport {
  const identities = new Map<string, Set<GraphNodeKind>>();
  for (const fact of facts) for (const node of [fact.subject, fact.object]) {
    let kinds = identities.get(node.id);
    if (!kinds) identities.set(node.id, kinds = new Set());
    kinds.add(node.kind);
  }
  const ref = (domain: string, ...values: readonly unknown[]) =>
    `identity-${domain}-${sha256(stableJson(['graph-identity-preflight-v1', options.repositoryId, domain, ...values]))}`;
  const reportedKind = (kind: GraphNodeKind): ReportedIdentityKind => publicKinds.has(kind)
    ? kind : `unknown-kind-${sha256(stableJson(['graph-identity-kind-v1', options.repositoryId, kind]))}`;
  const conflicts = new Map<string, { nodeRef: string; kinds: ReportedIdentityKind[];
    occurrences: GraphIdentityOccurrence[]; details?: { nodeId: string } }>();
  for (const [id, kinds] of identities) if (kinds.size > 1) {
    conflicts.set(id, { nodeRef: ref('node', id), kinds: [...kinds].map(reportedKind), occurrences: [],
      ...(options.includeDetails ? { details: { nodeId: id } } : {}) });
  }
  // The common conflict-free path allocates no evidence reports. Preserve every conflicting
  // occurrence, including duplicate fact IDs and the two ends of a self-reference.
  if (conflicts.size) for (const [factIndex, fact] of facts.entries()) {
    const sides = (['subject', 'object'] as const).filter(side => conflicts.has(fact[side].id));
    if (!sides.length) continue;
    const references = { factRef: ref('fact', fact.id), sourceRef: ref('source', fact.provenance.path),
      extractorRef: ref('extractor', fact.extractor.id, fact.extractor.version) };
    for (const side of sides) {
      const node = fact[side];
      conflicts.get(node.id)!.occurrences.push({ factIndex, side, kind: reportedKind(node.kind), ...references,
        ...(options.includeDetails ? { details: {
          nodeId: node.id, nodeKind: node.kind, factId: fact.id,
          extractor: { id: fact.extractor.id, version: fact.extractor.version },
          provenance: { path: fact.provenance.path, startLine: fact.provenance.startLine,
            endLine: fact.provenance.endLine, digest: fact.provenance.digest, commitSha: fact.provenance.commitSha },
          confidence: fact.confidence,
          ...(fact.authority === undefined ? {} : { authority: fact.authority }),
          ...(fact.sourceAuthority === undefined ? {} : { sourceAuthority: fact.sourceAuthority }),
          ...(fact.extractionReview === undefined ? {} : { extractionReview: fact.extractionReview }),
        } } : {}) });
    }
  }
  return { schemaVersion: 1, kind: 'graph-identity-preflight', category: 'extraction-gap',
    phase: 'validate-identities', passed: conflicts.size === 0, shaclValidated: false,
    factCount: facts.length, nodeCount: identities.size, conflictCount: conflicts.size,
    conflicts: [...conflicts.values()] };
}

/** The message is safe even when the caller explicitly requested local report details. */
export class GraphIdentityConflictError extends Error {
  readonly code = 'node-kind-conflict';
  constructor(readonly report: GraphIdentityPreflightReport) {
    super(`Graph identity preflight found ${report.conflictCount} node kind conflict(s) across ${report.factCount} facts. ` +
      'Full SHACL validation was not run. Use --validation-details for local node and cited evidence details. ' +
      'Correct the extractor or assertion identity disagreement, then retry; no graph facts were rewritten by this check.');
    this.name = 'GraphIdentityConflictError';
  }
}

export function assertGraphIdentities(facts: readonly GraphFact[],
  options: GraphIdentityPreflightOptions): GraphIdentityPreflightReport {
  const report = inspectGraphIdentities(facts, options);
  if (!report.passed) throw new GraphIdentityConflictError(report);
  return report;
}
