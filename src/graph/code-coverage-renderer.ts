import type { CodeCoverageReport } from '@weftlet/core';
import { codeCoverageDescription } from './code-coverage-projection.js';
const quoted = (value: string) => JSON.stringify(value).replace(/[\\`*_{}\[\]()<>!|]/g, '\\$&');

export function renderCodeCoverage(report: Omit<CodeCoverageReport, 'markdown'>): string {
  const { snapshot, evidenceState, selection, overview } = report;
  return ['# Saved repository code coverage', `Snapshot: ${quoted(snapshot.snapshotId)} (${snapshot.commitSha}); configuration ${snapshot.configurationDigest ?? 'unknown'}`,
    codeCoverageDescription(overview),
    `View: ${report.view}; project: ${quoted(selection.projectRoot ?? '(all boundaries)')}; ${report.projectStatus ?? 'all'}; offset ${selection.offset}; ${selection.remaining}/${selection.total} items remain.`,
    ...(selection.continuation ? [`Continuation (same request): ${selection.continuation}`] : []),
    ...(evidenceState ? [`Stale: ${evidenceState.stale}; configuration matches: ${evidenceState.configurationMatches}; extraction compatible: ${evidenceState.extractionCompatible ?? 'unknown'}; overlay freshness: ${evidenceState.overlayFreshness ?? 'not an overlay'}`,
      `Excluded working changes: ${evidenceState.excludedWorkingChanges.map(quoted).join(', ') || '(none)'}`] : []),
    '', ...report.projects.map(p => `- ${quoted(p.root)}: ${p.counts.files} files; ${p.counts.requested} requested; ${p.counts.indexed} indexed; ${p.counts.indexUnknown} index unknown; ${p.connectedProjects} connected package boundaries. Use this exact projectRoot to page files.`),
    ...report.files.map(f => `- ${quoted(f.path)} (${quoted(f.nodeId)}): code roots ${f.codeRootSelected}; requested ${f.requested}; indexed ${f.indexed ?? 'unknown'}; ${f.unresolvedReferences} unresolved references; ${f.declarationOnlyReferences} declaration-only references; ${f.implementationGaps} cited gaps. Inspect graph.neighbors at this file ID for retained evidence.`),
    '', '## Measurement limits', ...overview.limitations.map(item => `- ${item}`),
  ].join('\n');
}
