import { codeEvidenceDescription } from './code-description.js';
import { sourceLocation } from '@weftlet/core';
import type { GraphNeighborhood } from '@weftlet/core';
import { contextPackEvidenceAuthority } from './authority.js';
import { coverageDescription } from './coverage.js';
import { documentSelectionDescription } from './document-role-description.js';
import { diagnosticSummary } from './diagnostics.js';

const quoted = (value: string) => JSON.stringify(value).replace(/[\\`*_{}\[\]()<>!|]/g, '\\$&');

export function renderGraphNeighborhood(result: Omit<GraphNeighborhood, 'markdown'>): string {
  const { snapshot, focus, selection, frontier, evidenceState } = result;
  return [
    '# Exact graph neighborhood',
    `Snapshot: ${quoted(snapshot.snapshotId)} (${snapshot.commitSha})`,
    `Configuration: ${snapshot.configurationDigest ?? 'legacy/unknown'}; scope: ${snapshot.scope?.map(quoted).join(', ') ?? 'legacy/unknown'}`,
    ...[documentSelectionDescription(snapshot.documentSelection)].filter(Boolean),
    `Node: ${quoted(focus.nodeId)}; ${focus.status}`,
    `Direction: ${selection.direction}; predicates: ${selection.predicates.join(', ') || 'all'}`,
    `Incident assertions: ${selection.incidentFacts}; matching: ${selection.matchingFacts}; filtered out: ${selection.filteredFacts}`,
    `Page: ${selection.returnedFacts} assertions at offset ${selection.offset}; remaining: ${selection.remainingFacts}; truncated: ${selection.truncated}`,
    ...(selection.continuation ? [`Continuation: ${selection.continuation}`] : []),
    ...(evidenceState ? [
      `Stale relative to checkout: ${evidenceState.stale}; configuration matches: ${evidenceState.configurationMatches}; extraction compatible: ${evidenceState.extractionCompatible ?? 'unknown'}`,
      `Excluded working changes: ${evidenceState.excludedWorkingChanges.map(quoted).join(', ') || '(none)'}`,
      ...(evidenceState.overlayFreshness ? [`Overlay freshness: ${evidenceState.overlayFreshness}`] : []),
    ] : []),
    'This is one-hop saved evidence. It does not validate the current diff or establish complete repository coverage.',
    coverageDescription(result.coverage),
    ...result.coverage.gaps.map(gap => `GAP: ${gap}`),
    '', '## Cited assertions',
    ...result.facts.map(fact => `- [${contextPackEvidenceAuthority(fact)}] ${quoted(fact.subject.id)} —${fact.predicate}→ ${quoted(fact.object.id)} ` +
      `(${quoted(sourceLocation(fact.provenance))}–${fact.provenance.endLine}${fact.provenance.endColumn === undefined ? '' : `:${fact.provenance.endColumn}`}; confidence ${fact.confidence}; source ${fact.sourceAuthority ?? 'unspecified'}; extraction ${fact.extractionReview ?? 'unspecified'}${codeEvidenceDescription(fact) ? `; ${codeEvidenceDescription(fact)}` : ''})`),
    '', '## Scoped diagnostics',
    ...diagnosticSummary(result).map(item => `- ${quoted(item)}`),
    '', '## Further exploration',
    `Selected neighbors: ${frontier.totalNeighbors}; not yet returned across these pages: ${frontier.remainingNeighbors}.`,
    ...frontier.neighbors.map(node => `- ${quoted(node.nodeId)}: ${node.otherIncidentFacts} incident assertions outside this focus neighborhood; use graph.neighbors with the same snapshot to inspect them.`),
    'Counts concern the saved scope. Absence or an exhausted page is not proof that a product dependency does not exist.',
  ].join('\n');
}
