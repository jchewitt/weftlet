import type { DiagnosticReport, GraphFact, GraphNode, SourceSpan } from '@weftlet/core';
import { contextPackEvidenceAuthority } from '../../graph/authority.js';
import { evidenceSources } from '../evidence-sources.js';
import { sourceLink } from '../source-links.js';
import { byId, element, navigationButton } from './dom.js';

function source(parent: HTMLElement, span: SourceSpan, template?: string) {
  const label = `${span.path}:${span.startLine}–${span.endLine}`;
  let link: string | undefined;
  try { link = sourceLink(span, template); } catch { /* Keep a saved citation even if it cannot form a safe host link. */ }
  if (link) { const anchor = element('a', label); anchor.href = link; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; parent.append(anchor); }
  else parent.append(element('span', label));
  parent.append(element('small', `Commit ${span.commitSha} · digest ${span.digest}`));
}
export function showGaps(container: HTMLElement, report: DiagnosticReport) {
  container.replaceChildren();
  const names = { missingIntent: 'Missing intent', ambiguousIntent: 'Ambiguous intent', implementationGaps: 'Implementation gaps', runtimeGaps: 'Runtime gaps', drift: 'Drift' };
  for (const [key, title] of Object.entries(names)) {
    const section = report[key as keyof typeof names];
    if (!section.items.length && !section.omittedRelevant) continue;
    const detail = element('details'), summary = element('summary', `${title} · ${section.items.length + section.omittedRelevant}`);
    detail.append(summary);
    for (const item of section.items) {
      const article = element('article'); article.append(element('p', item.reason));
      for (const span of item.provenance) source(article, span);
      detail.append(article);
    }
    if (section.omittedRelevant) detail.append(element('p', `${section.omittedRelevant} additional relevant records are outside this bounded summary.`));
    container.append(detail);
  }
  if (report.unclassifiedLegacyCount) container.append(element('p', `${report.unclassifiedLegacyCount} legacy diagnostics have no reliable category.`));
  if (!container.childElementCount) container.append(element('p', 'No diagnostic records in this selection. This does not prove complete coverage.'));
}
export function showAssertions(facts: readonly GraphFact[], enter: (id: string) => void, template?: string) {
  const container = byId('evidence'); container.replaceChildren();
  const groups = new Map<string, HTMLDetailsElement>();
  for (const predicate of new Set(facts.map(fact => fact.predicate))) {
    const group = element('details'); group.className = 'relationship-group';
    group.append(element('summary', `${predicate} · ${facts.filter(fact => fact.predicate === predicate).length} assertions`));
    groups.set(predicate, group); container.append(group);
  }
  for (const fact of facts) {
    const detail = element('details'); detail.dataset.factId = fact.id;
    detail.append(element('summary', `${fact.predicate} · ${contextPackEvidenceAuthority(fact)}`));
    detail.append(element('p', `Source: ${fact.sourceAuthority ?? 'unspecified'} · Review: ${fact.extractionReview ?? 'unspecified'} · Confidence: ${fact.confidence}`));
    if (fact.sourceRole) detail.append(element('p', `Source role: ${fact.sourceRole}`));
    if (fact.sourceOwnership) detail.append(element('p', `Ownership: ${fact.sourceOwnership.status} · ${fact.sourceOwnership.ownerDocuments.join(', ') || 'no resolved owner document'}`));
    navigationButton(detail, fact.subject.label, `From · ${fact.subject.kind}`, () => enter(fact.subject.id));
    navigationButton(detail, fact.object.label, `To · ${fact.object.kind}`, () => enter(fact.object.id));
    const citation = element('p'); source(citation, fact.provenance, template); detail.append(citation);
    for (const proof of evidenceSources(fact)) {
      const p = element('p', `${proof.role}: `); source(p, proof.provenance, template); detail.append(p);
    }
    detail.append(element('p', `Assertion ${fact.id}`), element('p', `Extractor ${fact.extractor.id}@${fact.extractor.version}`));
    const raw = element('details'); raw.append(element('summary', 'Full saved assertion'));
    const pre = element('pre', JSON.stringify(fact, null, 2)); raw.append(pre); detail.append(raw);
    groups.get(fact.predicate)!.append(detail);
  }
}
export function showFocus(node: GraphNode | undefined, facts: readonly GraphFact[], enter: (id: string) => void, template?: string, paths = true) {
  byId('kind').textContent = node?.kind.toUpperCase() ?? 'SAVED EVIDENCE';
  byId('title').textContent = node?.label ?? 'Follow the why.';
  byId('intro').textContent = node ? 'Enter a connected item to explore its scope. Arrows retain the saved direction; static links do not prove runtime causality.'
    : 'Start with an intent item and follow its contracts, implementation and downstream evidence.';
  showAssertions(facts, enter, template);
  if (node) {
    const id = element('span', `Exact node: ${node.id}`); id.className = 'node-id'; byId('intro').append(id);
    if (!paths) return;
    const from = element('button', 'Use as path start'), to = element('button', 'Use as path target');
    from.onclick = () => { byId<HTMLInputElement>('from-node').value = node.id; };
    to.onclick = () => { byId<HTMLInputElement>('to-node').value = node.id; };
    byId('intro').append(from, to);
  }
}
