import { describe, expect, it } from 'vitest';
import type { GraphFact, GraphNodeKind } from '@weftlet/core';
import { assertGraphIdentities, GraphIdentityConflictError, inspectGraphIdentities } from './identity-preflight.js';

const repositoryId = 'public/identity-preflight';
const nodeId = 'component:file:src/service.spec.ts';

function fact(index: number, kind: GraphNodeKind = 'Evidence'): GraphFact {
  return { id: `assertion-${index}`,
    subject: { id: nodeId, kind, label: 'Public service spec', attributes: { approved: false } },
    predicate: 'consumes', object: { id: 'contract:client', kind: 'Contract', label: 'Client contract' },
    provenance: { path: `src/service-${index}.spec.ts`, startLine: index + 1, endLine: index + 2,
      digest: `digest-${index}`, commitSha: 'a'.repeat(40) },
    extractor: { id: index ? 'public-contract-extractor' : 'public-file-extractor', version: '1' },
    confidence: 0.95, snapshotId: 'public-snapshot', authority: 'inferred',
    sourceAuthority: 'declared', extractionReview: 'unreviewed' };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe('graph identity preflight', () => {
  it('accepts empty facts without claiming SHACL conformance', () => {
    expect(assertGraphIdentities([], { repositoryId })).toEqual({ schemaVersion: 1,
      kind: 'graph-identity-preflight', category: 'extraction-gap', phase: 'validate-identities',
      passed: true, shaclValidated: false, factCount: 0, nodeCount: 0, conflictCount: 0, conflicts: [] });
  });

  it('accepts repeated identities, labels, attributes, duplicates and consistent self-references', () => {
    const first = fact(0);
    const changed = { ...first, subject: { ...first.subject, label: 'Another label', attributes: { approved: true } } };
    const self = { ...first, object: { ...first.subject } };
    expect(assertGraphIdentities([first, first, changed, self], { repositoryId }))
      .toMatchObject({ passed: true, shaclValidated: false, factCount: 4, nodeCount: 2, conflictCount: 0 });
  });

  it('attributes both ends of an incompatible self-reference without deduplicating occurrences', () => {
    const value = fact(0);
    const self = { ...value, object: { ...value.subject, kind: 'Component' as const } };
    const report = inspectGraphIdentities([self, self], { repositoryId, includeDetails: true });
    expect(report).toMatchObject({ passed: false, shaclValidated: false, factCount: 2, nodeCount: 1, conflictCount: 1 });
    expect(report.conflicts[0]!.kinds).toEqual(['Evidence', 'Component']);
    expect(report.conflicts[0]!.occurrences.map(({ factIndex, side, kind }) => ({ factIndex, side, kind })))
      .toEqual([{ factIndex: 0, side: 'subject', kind: 'Evidence' },
        { factIndex: 0, side: 'object', kind: 'Component' },
        { factIndex: 1, side: 'subject', kind: 'Evidence' },
        { factIndex: 1, side: 'object', kind: 'Component' }]);
    expect(new Set(report.conflicts[0]!.occurrences.map(value => value.factRef)).size).toBe(1);
    expect(report.conflicts[0]!.details).toEqual({ nodeId });
  });

  it('retains exact cited producer and review attribution in copied opt-in details', () => {
    const values = freeze([fact(0), fact(1, 'Component')]);
    const before = JSON.stringify(values);
    const report = inspectGraphIdentities(values, { repositoryId, includeDetails: true });
    expect(report.conflicts[0]!.occurrences).toHaveLength(2);
    for (const [index, occurrence] of report.conflicts[0]!.occurrences.entries()) {
      const value = values[index]!;
      expect(occurrence.details).toEqual({ nodeId, nodeKind: value.subject.kind, factId: value.id,
        extractor: value.extractor, provenance: value.provenance, confidence: value.confidence,
        authority: 'inferred', sourceAuthority: 'declared', extractionReview: 'unreviewed' });
      expect(occurrence.details!.extractor).not.toBe(value.extractor);
      expect(occurrence.details!.provenance).not.toBe(value.provenance);
      expect(occurrence.details).not.toHaveProperty('label');
      expect(occurrence.details).not.toHaveProperty('attributes');
    }
    expect(JSON.stringify(values)).toBe(before);
  });

  it('joins subject and object occurrences from separate sources and retains every conflicting kind', () => {
    const values = [fact(0), ...(['Component', 'Document'] as const).map((kind, index) => ({
      ...fact(index + 1), subject: { id: 'workflow:client', kind: 'Workflow' as const, label: 'Client flow' },
      object: { id: nodeId, kind, label: 'Cited repository file' },
    }))];
    const report = inspectGraphIdentities(values, { repositoryId });
    expect(report).toMatchObject({ conflictCount: 1, nodeCount: 3 });
    expect(report.conflicts[0]!.kinds).toEqual(['Evidence', 'Component', 'Document']);
    expect(report.conflicts[0]!.occurrences.map(({ factIndex, side, kind }) => ({ factIndex, side, kind })))
      .toEqual([{ factIndex: 0, side: 'subject', kind: 'Evidence' },
        { factIndex: 1, side: 'object', kind: 'Component' },
        { factIndex: 2, side: 'object', kind: 'Document' }]);
  });

  it('does not invent approval or authority fields when source records omit them', () => {
    const values = [fact(0), fact(1, 'Component')].map(({ authority: _authority,
      sourceAuthority: _sourceAuthority, extractionReview: _review, ...value }) => value);
    const report = inspectGraphIdentities(values, { repositoryId, includeDetails: true });
    for (const occurrence of report.conflicts[0]!.occurrences) {
      expect(occurrence.details).not.toHaveProperty('authority');
      expect(occurrence.details).not.toHaveProperty('sourceAuthority');
      expect(occurrence.details).not.toHaveProperty('extractionReview');
    }
  });

  it('checks conceptual identities too and does not reinterpret or canonicalize them', () => {
    const values = [fact(0), fact(1, 'Component')].map(value => ({ ...value,
      subject: { ...value.subject, id: 'business:contract-policy' } }));
    const report = inspectGraphIdentities(values, { repositoryId, includeDetails: true });
    expect(report.conflictCount).toBe(1);
    expect(report.conflicts[0]!.details!.nodeId).toBe('business:contract-policy');
    expect(values.map(value => value.subject.kind)).toEqual(['Evidence', 'Component']);
  });

  it('uses stable repository-scoped references across default and detailed reports', () => {
    const values = [fact(0), fact(1, 'Component')];
    const first = inspectGraphIdentities(values, { repositoryId });
    expect(inspectGraphIdentities(values, { repositoryId })).toEqual(first);
    const detailed = inspectGraphIdentities(values, { repositoryId, includeDetails: true });
    const other = inspectGraphIdentities(values, { repositoryId: 'public/other' });
    expect(detailed.conflicts[0]!.nodeRef).toBe(first.conflicts[0]!.nodeRef);
    expect(other.conflicts[0]!.nodeRef).not.toBe(first.conflicts[0]!.nodeRef);
    for (const key of ['factRef', 'sourceRef', 'extractorRef'] as const) {
      expect(detailed.conflicts[0]!.occurrences[0]![key]).toBe(first.conflicts[0]!.occurrences[0]![key]);
      expect(other.conflicts[0]!.occurrences[0]![key]).not.toBe(first.conflicts[0]!.occurrences[0]![key]);
      expect(first.conflicts[0]!.occurrences[0]![key]).toMatch(/^identity-[a-z]+-[a-f0-9]{64}$/);
    }
  });

  it('never copies arbitrary kinds, identifiers, source paths or extractor names into default reports', () => {
    const secret = 'PRIVATE_DIAGNOSTIC_SENTINEL';
    const values = [fact(0), fact(1)].map((value, index) => ({ ...value, id: `${secret}-fact-${index}`,
      subject: { id: `${secret}-node`, kind: `${secret}-kind-${index}` as GraphNodeKind, label: `${secret}-label` },
      provenance: { ...value.provenance, path: `${secret}-path`, digest: `${secret}-digest`, commitSha: `${secret}-commit` },
      extractor: { id: `${secret}-extractor`, version: `${secret}-version` }, snapshotId: `${secret}-snapshot` }));
    const report = inspectGraphIdentities(values, { repositoryId: secret });
    expect(report.conflictCount).toBe(1);
    expect(new Set(report.conflicts[0]!.kinds).size).toBe(2);
    for (const kind of report.conflicts[0]!.kinds) expect(kind).toMatch(/^unknown-kind-[a-f0-9]{64}$/);
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(report.conflicts[0]).not.toHaveProperty('details');
    expect(report.conflicts[0]!.occurrences.every(value => value.details === undefined)).toBe(true);
    const detailed = inspectGraphIdentities(values, { repositoryId, includeDetails: true });
    expect(detailed.conflicts[0]!.occurrences[0]!.details!.nodeKind).toBe(`${secret}-kind-0`);
    expect(new GraphIdentityConflictError(detailed).message).not.toContain(secret);
  });

  it('reports all late conflicts and every occurrence without a document, fact or hop cutoff', () => {
    const values = Array.from({ length: 2205 }, (_, index) => ({ ...fact(index),
      subject: { ...fact(index).subject, id: `component:file:src/case-${index}.test.ts` } }));
    for (const index of [0, 1100, 2204]) values.push({ ...fact(index, 'Component'),
      subject: { ...values[index]!.subject, kind: 'Component' }, id: `conflict-${index}` });
    const report = inspectGraphIdentities(values, { repositoryId });
    expect(report).toMatchObject({ factCount: 2208, nodeCount: 2206, conflictCount: 3, shaclValidated: false });
    expect(report.conflicts.map(value => value.occurrences.map(item => item.factIndex)))
      .toEqual([[0, 2205], [1100, 2206], [2204, 2207]]);
  });

  it('throws a typed safe failure while leaving the complete report available to the caller', () => {
    const values = [fact(0), fact(1, 'Component')];
    const report = inspectGraphIdentities(values, { repositoryId });
    try {
      assertGraphIdentities(values, { repositoryId });
      expect.fail('Conflicting graph must be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(GraphIdentityConflictError);
      const failure = error as GraphIdentityConflictError;
      expect(failure.code).toBe('node-kind-conflict');
      expect(failure.report).toEqual(report);
      expect(failure.message).toContain('--validation-details');
      expect(failure.message).toContain('Full SHACL validation was not run');
      expect(failure.message).not.toContain(nodeId);
      expect(failure.message).not.toContain(values[0]!.provenance.path);
    }
  });

  it('does not replace other graph checks or claim that a single kind is a canonical kind', () => {
    const value = { ...fact(0, 'Component'), confidence: -1,
      provenance: { ...fact(0).provenance, startLine: 3, endLine: 1 } };
    expect(assertGraphIdentities([value], { repositoryId })).toMatchObject({ passed: true, shaclValidated: false });
    expect(value.subject.kind).toBe('Component');
  });
});
