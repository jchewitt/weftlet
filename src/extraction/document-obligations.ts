import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Nodes } from 'mdast';
import { obligationContractNode, parseObligationDeclaration, repositoryFileNode,
  type ExtractionContext, type GraphDiagnostic, type GraphFact, type SourceSpan } from '@weftlet/core';
import type { GitRepository } from '../repository/git.js';
import type { BindingSource } from './document-code-bindings.js';
import { parseUniqueJson } from '../infrastructure/unique-json.js';
import { sha256, stableJson } from '../infrastructure/util.js';

export const documentObligationIdentity = { id: 'document-obligation-extractor', version: '1.0.0' } as const;
interface DeclarationBlock { readonly content: string; readonly provenance: SourceSpan }

function blocks(source: BindingSource, commitSha: string): readonly DeclarationBlock[] {
  const result: DeclarationBlock[] = [];
  const visit = (node: Nodes): void => {
    if (node.type === 'code' && node.lang === 'weftlet-obligation') result.push({ content: node.value,
      provenance: { path: source.path, digest: source.digest, commitSha,
        startLine: node.position!.start.line, endLine: node.position!.end.line } });
    if ('children' in node) for (const child of node.children) visit(child);
  };
  visit(fromMarkdown(source.content));
  return result;
}

/** Exact opt-in declarations only. Prose interpretation, inferred transport joins and policy verdicts are separate. */
export async function extractDocumentObligations(repository: Pick<GitRepository, 'listEntriesAt' | 'readFileAt'>,
  context: ExtractionContext, sources: readonly BindingSource[]): Promise<{ facts: readonly GraphFact[]; diagnostics: readonly GraphDiagnostic[] }> {
  const selected = sources.map(source => ({ source, blocks: blocks(source, context.commitSha) })).filter(item => item.blocks.length);
  if (!selected.length) return { facts: [], diagnostics: [] };
  if (selected.reduce((sum, item) => sum + item.blocks.length, 0) > 500) throw new Error('Obligation sources exceed the 500-declaration bound; no partial extraction');
  const entries = new Map((await repository.listEntriesAt(context.commitSha)).map(entry => [entry.path, entry]));
  const regular = (path: string) => { const entry = entries.get(path); return entry?.type === 'blob' && ['100644', '100755'].includes(entry.mode); };
  const texts = new Map<string, string>();
  const read = async (path: string) => {
    if (!texts.has(path)) texts.set(path, await repository.readFileAt(context.commitSha, path));
    return texts.get(path)!;
  };
  const facts: GraphFact[] = [], diagnostics: GraphDiagnostic[] = [];
  const gap = (reason: string, provenance: readonly SourceSpan[], relatedNodeIds: readonly string[]) => {
    const item = { reason: `Contract obligation: ${reason}`, provenance, relatedNodeIds,
      kind: 'implementationGaps' as const, evidenceScope: 'source' as const };
    diagnostics.push({ ...item, id: sha256(stableJson({ ...item, extractor: documentObligationIdentity })) });
  };
  for (const { source, blocks } of selected) {
    if (!regular(source.path) || sha256(source.content) !== source.digest || await read(source.path) !== source.content) {
      gap('source does not match regular committed bytes.', blocks.map(block => block.provenance), [repositoryFileNode(source.path).id]); continue;
    }
    if (source.metadata.sourceRole === 'validation') {
      gap('validation sources cannot declare producer guarantees or consumer requirements.', blocks.map(block => block.provenance), [repositoryFileNode(source.path).id]); continue;
    }
    for (const block of blocks) {
      let declaration;
      try {
        if (Buffer.byteLength(block.content) > 65_536) throw new Error('Declaration exceeds 64 KiB');
        declaration = parseObligationDeclaration(parseUniqueJson(block.content));
      } catch {
        gap('invalid declaration: use bounded schemaVersion 1 JSON with unique supported keys; no relationship emitted.', [block.provenance], [repositoryFileNode(source.path).id]); continue;
      }
      const subject = repositoryFileNode(declaration.endpoint), object = obligationContractNode(context.repositoryId, declaration.contract);
      if (!regular(declaration.endpoint)) {
        gap('endpoint is missing or is not a regular committed file; no relationship emitted.', [block.provenance], [subject.id, object.id]); continue;
      }
      const endpoint = await read(declaration.endpoint);
      const assertion = { subject, object, predicate: declaration.role === 'guarantee' ? 'emits' as const : 'consumes' as const,
        provenance: block.provenance, extractor: documentObligationIdentity, confidence: 1,
        authority: 'inferred' as const, extractionReview: 'deterministic' as const, ...source.metadata,
        contractObligation: { method: 'explicit-markdown' as const, repositoryId: context.repositoryId, declaration,
          endpointSource: { path: declaration.endpoint, digest: sha256(endpoint), commitSha: context.commitSha,
            startLine: 1, endLine: endpoint.split('\n').length } } };
      facts.push({ ...assertion, id: sha256(stableJson(assertion)), snapshotId: context.snapshotId });
    }
  }
  diagnoseObligationGroups(facts, gap);
  return { facts: facts.sort((a, b) => a.id.localeCompare(b.id)), diagnostics: diagnostics.sort((a, b) => a.id.localeCompare(b.id)) };
}

function diagnoseObligationGroups(facts: readonly GraphFact[], gap: (reason: string, provenance: readonly SourceSpan[], related: readonly string[]) => void): void {
  const identities = new Map<string, GraphFact[]>();
  for (const fact of facts) {
    const key = stableJson([fact.provenance.path, fact.contractObligation!.declaration.id]);
    const group = identities.get(key) ?? []; group.push(fact); identities.set(key, group);
  }
  for (const group of identities.values()) if (group.length > 1) gap('duplicate declaration ID within a source; all cited assertions retained for review.',
    group.map(fact => fact.provenance), [...new Set(group.flatMap(fact => [fact.subject.id, fact.object.id]))]);
  const contracts = new Map<string, GraphFact[]>();
  for (const fact of facts) { const group = contracts.get(fact.object.id) ?? []; group.push(fact); contracts.set(fact.object.id, group); }
  for (const group of contracts.values()) if (new Set(group.map(fact => fact.contractObligation!.declaration.role)).size < 2) {
    gap('only one side of this contract has structured obligations in the selected documents; other producers/consumers and compatibility remain unknown.',
      group.map(fact => fact.provenance), [group[0]!.object.id]);
  }
}
