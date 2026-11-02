import { repositoryFileNode, type GraphFact, type GraphSnapshot, type MappingProposalInput, type MappingProposalPlan,
  type MappingProposalRequest } from '@weftlet/core';
import type { GitRepository } from '../repository/git.js';
import { sha256 } from '../infrastructure/util.js';
import { jsonDigest } from '../infrastructure/json-digest.js';
import { projectCodeCoverage } from '../graph/code-coverage-projection.js';
import { snapshotContext } from '../graph/snapshot-context.js';
import { mappingCandidates } from './mapping-candidates.js';
import { mappingVersion, parseMappingRequest } from './mapping-request.js';
import { mappingPrompt } from './mapping-prompt.js';
import { mappingOutputSchema } from './mapping-output.js';

const business = new Set(['Invariant', 'Capability', 'Workflow', 'Contract']);
const eligibleSubject = (fact: GraphFact, ruleId: string, documentPath: string) =>
  !fact.codeBinding && !fact.codeOccurrence && fact.provenance.path === documentPath &&
  [fact.subject, fact.object].some(node => node.id === ruleId && business.has(node.kind)) &&
  fact.sourceAuthority === 'declared' && (fact.sourceRole === undefined || fact.sourceRole === 'intent') &&
  (!fact.sourceOwnership || ['resolved', 'not-required'].includes(fact.sourceOwnership.status));

function mappingScope(snapshot: GraphSnapshot, request: Required<MappingProposalRequest>) {
  const { manifest, facts } = snapshot;
  const issues: { code: string; path?: string }[] = [];
  const problem = (code: string, path?: string) => { issues.push({ code, ...(path ? { path } : {}) }); };
  if (manifest.overlayDigest) problem('committed-snapshot-required');
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(manifest.commitSha)) problem('immutable-commit-required');
  const subjectEvidence = facts.filter(f => eligibleSubject(f, request.ruleId, request.documentPath));
  if (!subjectEvidence.length) problem('approved-intent-source-required');
  const kinds = new Set(facts.flatMap(f => [f.subject, f.object].filter(n => n.id === request.ruleId).map(n => n.kind)));
  if (kinds.size !== 1) problem('ambiguous-or-missing-rule');
  if (facts.some(f => f.subject.id === request.ruleId && f.predicate === 'implementedBy' && f.object.kind === 'CodeSymbol')) problem('explicit-symbol-binding-exists');
  if (snapshot.diagnostics?.some(d => ['ambiguousIntent', 'missingIntent'].includes(d.kind) && d.relatedNodeIds.includes(request.ruleId))) problem('intent-gap-requires-review');
  if (snapshot.diagnostics?.some(d => d.kind === 'implementationGaps' && d.provenance.some(s => s.path === request.documentPath))) problem('document-mapping-gap-requires-repair');
  const coverage = projectCodeCoverage(snapshot);
  if (coverage.overview.status !== 'recorded') problem('recorded-code-coverage-required');
  const associations: GraphFact[] = [];
  for (const path of request.files) {
    if (repositoryFileNode(path).kind === 'Evidence') problem('validation-code-is-not-implementation', path);
    if (coverage.files.find(f => f.path === path)?.indexed !== true) problem('file-not-observed-in-index', path);
    const linked = facts.filter(f => f.provenance.path === request.documentPath &&
      [request.ruleId, repositoryFileNode(request.documentPath).id].includes(f.subject.id) &&
      ['references', 'implementedBy'].includes(f.predicate) && f.object.id === repositoryFileNode(path).id);
    if (!linked.length) problem('file-not-linked-from-selected-rule-or-document', path);
    associations.push(...linked);
  }
  return { issues, problem, subjectEvidence, associations };
}

async function readMappingSources(repository: Pick<GitRepository, 'listEntriesAt' | 'readFileAt'>,
  snapshot: GraphSnapshot, request: Required<MappingProposalRequest>, scope: ReturnType<typeof mappingScope>) {
  const { manifest, facts } = snapshot, { issues, problem, subjectEvidence, associations } = scope;
  const excluded: MappingProposalPlan['excluded'][number][] = [];
  const candidates: MappingProposalInput['candidates'][number][] = [];
  let observed = 0;
  let document: MappingProposalInput['document'] | undefined;
  if (!issues.length) {
    const entries = new Map((await repository.listEntriesAt(manifest.commitSha)).map(e => [e.path, e]));
    const sourcePaths = [request.documentPath, ...request.files];
    for (const path of sourcePaths) {
      const entry = entries.get(path);
      if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) problem('regular-committed-source-required', path);
      else if (entry.size === undefined || entry.size > 1_048_576) problem('source-read-budget-exceeded', path);
    }
    if (!issues.length) for (const path of sourcePaths) {
      const text = await repository.readFileAt(manifest.commitSha, path), digest = sha256(text);
      const proofs = path === request.documentPath ? [...subjectEvidence, ...associations] :
        facts.filter(f => f.codeOccurrence?.role === 'definition' && f.provenance.path === path);
      if (proofs.some(f => f.provenance.commitSha !== manifest.commitSha || f.provenance.digest !== digest ||
          f.provenance.startLine < 1 || f.provenance.endLine < f.provenance.startLine || f.provenance.endLine > text.split('\n').length)) { problem('source-proof-mismatch', path); continue; }
      if (path === request.documentPath) {
        document = { source: { path, startLine: 1, endLine: text.split('\n').length, digest, commitSha: manifest.commitSha }, text };
      } else {
        const result = mappingCandidates(path, text, digest, manifest.commitSha, proofs, request);
        observed += result.observed;
        candidates.push(...result.candidates); result.issues.forEach(code => problem(code, path));
        if (result.excluded) excluded.push({ path, reason: 'declaration-ambient-or-unnamed-callable', count: result.excluded });
      }
    }
  }
  return { candidates, document, excluded, observed,
    enumerationComplete: issues.every(issue => issue.code === 'input-budget-exceeded') && observed === candidates.length };
}

/** Selection/coverage checks run before source reads and before constructing any provider. */
export async function prepareMappingProposal(repository: Pick<GitRepository, 'listEntriesAt' | 'readFileAt'>,
  snapshot: GraphSnapshot, value: MappingProposalRequest): Promise<{ plan: MappingProposalPlan; input?: MappingProposalInput }> {
  const request = parseMappingRequest(value), { manifest } = snapshot;
  if (manifest.snapshotId !== request.snapshotId) throw Error('Mapping snapshot identity mismatch');
  const scope = mappingScope(snapshot, request), { issues, problem, subjectEvidence, associations } = scope;
  const { candidates, document, excluded, observed, enumerationComplete } = await readMappingSources(repository, snapshot, request, scope);
  candidates.sort((a, b) => a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0);
  if (!candidates.length) problem('no-indexed-implementation-candidates');
  if (candidates.length > request.maxCandidates) problem('candidate-budget-exceeded');
  const input = document ? { ruleId: request.ruleId, document, subjectEvidence, associations, candidates } : undefined;
  const inputBytes = input ? Buffer.byteLength(mappingPrompt(input)) + Buffer.byteLength(JSON.stringify(mappingOutputSchema)) : 0;
  if (inputBytes > request.maxInputBytes) problem('input-budget-exceeded');
  const plan: MappingProposalPlan = { version: mappingVersion, request, snapshot: snapshotContext(manifest),
    snapshotDigest: jsonDigest(snapshot), ready: !issues.length, issues, subjectEvidence, associations,
    candidates: candidates.map(({ text: _text, ...candidate }) => candidate), excluded,
    candidateEnumeration: { complete: enumerationComplete, observed, returned: candidates.length },
    inputBytes, inputDigest: jsonDigest(input ?? null) };
  return { plan, ...(plan.ready ? { input } : {}) };
}
