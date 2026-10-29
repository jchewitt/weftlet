import { codeEvidenceDescription } from './code-description.js';
import { sourceLocation } from '@weftlet/core';
import type { GraphPaths } from '@weftlet/core';
import { contextPackEvidenceAuthority } from './authority.js';
import { coverageDescription } from './coverage.js';
import { diagnosticSummary } from './diagnostics.js';
import { documentSelectionDescription } from './document-role-description.js';

const quoted = (value: string) => JSON.stringify(value).replace(/[\\`*_{}\[\]()<>!|]/g, '\\$&');

export function renderGraphPaths(result: Omit<GraphPaths, 'markdown'>): string {
  const { snapshot, endpoints, search, frontier, evidenceState } = result;
  return [
    '# Cited evidence paths',
    `Snapshot: ${quoted(snapshot.snapshotId)} (${snapshot.commitSha}); configuration: ${snapshot.configurationDigest ?? 'unknown'}`,
    `Scope: ${snapshot.scope?.map(quoted).join(', ') ?? 'unknown'}`,
    documentSelectionDescription(snapshot.documentSelection),
    `From ${quoted(endpoints.from.nodeId)} (${endpoints.from.status}) to ${quoted(endpoints.to.nodeId)} (${endpoints.to.status})`,
    `Direction: ${search.direction}; predicates: ${search.predicates.join(', ') || 'all'}; order: ${search.order}`,
    `Depth: ${search.maxDepth}; paths on page: ${result.paths.length}/${search.maxPaths}; stop: ${search.stopReason}; truncated: ${search.truncated}`,
    `Candidate steps: ${search.examinedSteps} new + ${search.replayedSteps} replay; ${search.totalSteps}/${search.searchLimit} total ceiling.`,
    `Unexamined prefixes: ${frontier.pending.length}; depth-limited extensions: ${frontier.depthLimited.count} (${frontier.depthLimited.omitted} examples omitted).`,
    ...(search.continuation ? [`Continuation (same request): ${search.continuation}`] : []),
    ...(search.depthLimitReached ? ['Depth limit reached: restart with a larger maxDepth or explore a frontier node. Continuation does not lift the depth bound.'] : []),
    ...(search.stopReason === 'search-limit' ? ['Total search limit reached: narrow the relations or explore an intermediate node; no further continuation is available.'] : []),
    ...(evidenceState ? [`Stale: ${evidenceState.stale}; configuration matches: ${evidenceState.configurationMatches}; extraction compatible: ${evidenceState.extractionCompatible ?? 'unknown'}; overlay freshness: ${evidenceState.overlayFreshness ?? 'not an overlay'}`,
      `Excluded working changes: ${evidenceState.excludedWorkingChanges.map(quoted).join(', ') || '(none)'}`] : []),
    'Paths are cited associations, not proof of causality, business compatibility or current-diff validation. A completed search covers only the selected saved facts and depth; absence is not proof of no product dependency.',
    coverageDescription(result.coverage), ...result.coverage.gaps.map(quoted),
    '', '## Paths',
    ...result.paths.map((path, index) => `${index + 1}. ${path.nodeIds.map(quoted).join(' → ')}; facts: ${path.factIds.map(quoted).join(', ') || '(zero-length identity path)'}`),
    '', '## Supporting assertions',
    ...result.facts.map(fact => `- ${quoted(fact.id)} [${contextPackEvidenceAuthority(fact)}] ${quoted(fact.subject.id)} —${fact.predicate}→ ${quoted(fact.object.id)} (${quoted(sourceLocation(fact.provenance))}–${fact.provenance.endLine}${fact.provenance.endColumn === undefined ? '' : `:${fact.provenance.endColumn}`}; confidence ${fact.confidence}; source ${fact.sourceAuthority ?? 'unspecified'}; extraction ${fact.extractionReview ?? 'unspecified'}${codeEvidenceDescription(fact) ? `; ${codeEvidenceDescription(fact)}` : ''})`),
    '', '## Unexplored frontier',
    ...frontier.pending.map(item => `- ${quoted(item.nodeId)} via ${item.viaFactIds.map(quoted).join(', ') || '(start)'}: ${item.remainingCandidates} candidates; next ${quoted(item.nextFactId)}`),
    ...frontier.depthLimited.examples.map(item => `- Depth boundary: ${quoted(item.nodeId)} → ${quoted(item.nextNodeId)} via ${quoted(item.nextFactId)}`),
    '', '## Scoped diagnostics', ...diagnosticSummary(result).map(quoted),
  ].filter(line => line !== undefined).join('\n');
}
