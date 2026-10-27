import { describe, expect, it } from 'vitest';
import { classifyDocumentSources, parseDocumentClassificationPolicy,
  type DocumentClassificationContext, type DocumentClassificationPolicy } from './document-classification.js';

const context = (overrides: Partial<DocumentClassificationContext> = {}): DocumentClassificationContext => ({
  approvedIntentSources: ['docs/owner.md'], evidenceRoots: ['docs/validation'],
  availableDocuments: ['docs/owner.md', 'docs/feature.md'], ...overrides,
});
const policy = (overrides: Partial<DocumentClassificationPolicy> = {}): DocumentClassificationPolicy => ({
  schemaVersion: 1,
  roles: [{ id: 'features', pattern: 'docs/feature.md', role: 'plan' }],
  owners: [{ id: 'feature-owner', pattern: 'docs/feature.md', ownerDocument: 'docs/owner.md' }],
  ...overrides,
});
const classify = (paths: readonly string[], configuration: Partial<DocumentClassificationContext> = {},
  mappings?: DocumentClassificationPolicy) => classifyDocumentSources(paths, context(configuration), mappings);

describe('document classification policy', () => {
  it('keeps role, source approval and explicit ownership independent', () => {
    const result = classify(['docs/feature.md'], {}, policy());
    expect(result.documents).toEqual([{ path: 'docs/feature.md', sourceRole: 'plan', roleStatus: 'explicit',
      matchedRoleMappings: ['features'], approvedBy: [], sourceAuthority: 'inferred',
      ownership: { status: 'resolved', ownerDocuments: ['docs/owner.md'], mappingIds: ['feature-owner'] } }]);
    expect(result.issues).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.policyDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.documents[0]).not.toHaveProperty('extractionReview');
  });

  it('uses validation before approval for defaults without losing approval metadata', () => {
    const result = classify(['docs/validation/check.md', 'docs/owner.md', 'docs/unknown.md'],
      { approvedIntentSources: ['docs/**'] });
    expect(result.documents.map(document => [document.path, document.sourceRole, document.roleStatus,
      document.approvedBy, document.ownership.status])).toEqual([
      ['docs/owner.md', 'intent', 'default', ['docs/**'], 'missing'],
      ['docs/unknown.md', 'intent', 'default', ['docs/**'], 'missing'],
      ['docs/validation/check.md', 'validation', 'default', ['docs/**'], 'not-required'],
    ]);
    expect(result.documents.every(document => document.sourceAuthority === 'declared')).toBe(true);
    expect(result.issues.map(issue => issue.code)).toEqual(['ownership-missing', 'ownership-missing']);
    expect(result.complete).toBe(false);
  });

  it('retains evidence-root matching for literal files, directories, ./, slashes and directory globs', () => {
    const paths = ['docs/check.txt', 'docs/validation/a.md', 'docs/validation/deep/b.mdx'];
    for (const root of ['docs/validation', './docs/validation/', 'docs\\validation\\', 'docs/valid*', 'docs/validation/**']) {
      const result = classify(paths, { approvedIntentSources: [], evidenceRoots: [root] });
      expect(result.documents.map(document => document.sourceRole)).toEqual(['unclassified', 'validation', 'validation']);
    }
    expect(classify(paths, { evidenceRoots: ['docs/check.txt'] }).documents[0]?.sourceRole).toBe('validation');
    for (const root of ['.', './', '']) {
      const result = classify(paths, { evidenceRoots: [root] });
      expect(result.documents.every(document => document.sourceRole === 'validation')).toBe(true);
      expect(result.complete).toBe(true);
    }
  });

  it('lets an explicit role override a configured default without changing source approval', () => {
    const result = classify(['docs/validation/check.md'], { approvedIntentSources: ['docs/**'] }, policy({
      roles: [{ id: 'reference', pattern: 'docs/validation/check.md', role: 'reference' }], owners: [],
    }));
    expect(result.documents[0]).toMatchObject({ sourceRole: 'reference', roleStatus: 'explicit',
      sourceAuthority: 'declared', approvedBy: ['docs/**'], ownership: { status: 'not-required' } });
    expect(result.complete).toBe(true);
  });

  it('reports unknown roles and missing ownership instead of assuming intent', () => {
    const result = classify(['docs/unknown.md']);
    expect(result.documents[0]).toMatchObject({ sourceRole: 'unclassified', roleStatus: 'default',
      sourceAuthority: 'inferred', approvedBy: [], ownership: { status: 'missing' } });
    expect(result.issues).toEqual([
      { code: 'role-unclassified', severity: 'warning', message: expect.any(String), paths: ['docs/unknown.md'] },
      { code: 'ownership-missing', severity: 'warning', message: expect.any(String), paths: ['docs/unknown.md'] },
    ]);
    expect(result.complete).toBe(false);
  });

  it('does not choose a first role when explicit rules conflict', () => {
    const result = classify(['docs/feature.md'], { approvedIntentSources: ['docs/**'] }, policy({ roles: [
      { id: 'z-plan', pattern: 'docs/**', role: 'plan' },
      { id: 'a-intent', pattern: '**/feature.md', role: 'intent' },
    ] }));
    expect(result.documents[0]).toMatchObject({ sourceRole: 'unclassified', roleStatus: 'ambiguous',
      matchedRoleMappings: ['a-intent', 'z-plan'], sourceAuthority: 'declared', approvedBy: ['docs/**'] });
    expect(result.issues.map(issue => issue.code)).toContain('role-ambiguous');
    expect(result.complete).toBe(false);
  });

  it('allows multiple agreeing role mappings and deduplicates exact owner paths', () => {
    const result = classify(['docs/feature.md'], {}, policy({
      roles: [{ id: 'z-role', pattern: 'docs/feat*.md', role: 'plan' }, { id: 'a-role', pattern: '**/feature.md', role: 'plan' }],
      owners: [{ id: 'z-owner', pattern: 'docs/**', ownerDocument: 'docs/owner.md' },
        { id: 'a-owner', pattern: '**/feature.md', ownerDocument: 'docs/owner.md' }],
    }));
    expect(result.documents[0]).toMatchObject({ sourceRole: 'plan', roleStatus: 'explicit',
      matchedRoleMappings: ['a-role', 'z-role'], ownership: { status: 'resolved',
        ownerDocuments: ['docs/owner.md'], mappingIds: ['a-owner', 'z-owner'] } });
    expect(result.complete).toBe(true);
  });

  it('does not hide explicit owner conflicts on validation or reference documents', () => {
    const result = classify(['docs/feature.md'], {}, policy({
      roles: [{ id: 'reference', pattern: 'docs/feature.md', role: 'reference' }],
      owners: [{ id: 'z-owner', pattern: 'docs/**', ownerDocument: 'docs/owner.md' },
        { id: 'a-owner', pattern: '**/feature.md', ownerDocument: 'docs/other-owner.md' }],
    }));
    expect(result.documents[0]?.ownership).toEqual({ status: 'ambiguous',
      ownerDocuments: ['docs/other-owner.md', 'docs/owner.md'], mappingIds: ['a-owner', 'z-owner'] });
    expect(result.issues[0]).toMatchObject({ code: 'ownership-ambiguous',
      paths: ['docs/feature.md', 'docs/other-owner.md', 'docs/owner.md'] });
    expect(result.complete).toBe(false);
  });

  it('requires an owner to be available before checking source approval', () => {
    for (const approvedIntentSources of [[], ['docs/owner.md']]) {
      const result = classify(['docs/feature.md'], { approvedIntentSources, availableDocuments: ['docs/feature.md'] }, policy());
      expect(result.documents[0]?.ownership.status).toBe('unavailable');
      expect(result.issues.map(issue => issue.code)).toEqual(['ownership-unavailable']);
      expect(result.complete).toBe(false);
    }
  });

  it('keeps a present but unapproved owner unresolved even with an explicit intent role', () => {
    const result = classify(['docs/feature.md'], { approvedIntentSources: [] }, policy({ roles: [
      { id: 'feature', pattern: 'docs/feature.md', role: 'plan' },
      { id: 'owner-intent', pattern: 'docs/owner.md', role: 'intent' },
    ] }));
    expect(result.documents[0]?.ownership.status).toBe('unapproved');
    expect(result.issues.map(issue => issue.code)).toEqual(['ownership-unapproved']);
    expect(result.complete).toBe(false);
  });

  it.each(['validation', 'reference', 'plan'] as const)('does not accept an approved %s document as an intent owner', role => {
    const result = classify(['docs/feature.md'], { approvedIntentSources: ['docs/**'] }, policy({ roles: [
      { id: 'feature', pattern: 'docs/feature.md', role: 'plan' },
      { id: 'owner', pattern: 'docs/owner.md', role },
    ] }));
    expect(result.documents[0]?.ownership.status).toBe('ineligible');
    expect(result.issues.map(issue => issue.code)).toEqual(['ownership-ineligible']);
    expect(result.complete).toBe(false);
  });

  it('rejects a broadly approved validation-root owner and an ambiguous owner role', () => {
    const validation = classify(['docs/feature.md'], { approvedIntentSources: ['docs/**'], evidenceRoots: ['docs/owner.md'] }, policy());
    expect(validation.documents[0]?.ownership.status).toBe('ineligible');
    const ambiguous = classify(['docs/feature.md'], {}, policy({ roles: [
      { id: 'feature', pattern: 'docs/feature.md', role: 'plan' },
      { id: 'owner-intent', pattern: 'docs/owner.md', role: 'intent' },
      { id: 'owner-plan', pattern: 'docs/owner.md', role: 'plan' },
    ] }));
    expect(ambiguous.documents[0]?.ownership.status).toBe('ineligible');
    expect(ambiguous.issues.map(issue => issue.code)).toEqual(['ownership-ineligible']);
  });

  it('does not traverse ownership chains or use cyclic mappings to inherit approval', () => {
    const result = classify(['docs/feature.md', 'docs/owner.md'], {}, policy({ roles: [
      { id: 'features', pattern: 'docs/feature.md', role: 'intent' },
    ], owners: [
      { id: 'a-to-b', pattern: 'docs/feature.md', ownerDocument: 'docs/owner.md' },
      { id: 'b-to-a', pattern: 'docs/owner.md', ownerDocument: 'docs/feature.md' },
    ] }));
    expect(result.documents.map(document => [document.path, document.sourceAuthority, document.ownership.status])).toEqual([
      ['docs/feature.md', 'inferred', 'resolved'], ['docs/owner.md', 'declared', 'unapproved'],
    ]);
    expect(result.complete).toBe(false);
  });

  it('permits an explicit self-owner without inferring self-ownership from approval', () => {
    const withoutMapping = classify(['docs/owner.md']);
    expect(withoutMapping.documents[0]?.ownership.status).toBe('missing');
    const result = classify(['docs/owner.md'], {}, policy({ roles: [], owners: [
      { id: 'self', pattern: 'docs/owner.md', ownerDocument: 'docs/owner.md' },
    ] }));
    expect(result.documents[0]?.ownership.status).toBe('resolved');
    expect(result.complete).toBe(true);
  });

  it('preserves path case, Unicode and spaces and does not guess owner aliases', () => {
    const paths = ['docs/Équipe notes.MDX', 'docs/équipe notes.MDX'];
    const result = classify(paths, { approvedIntentSources: [paths[0]!], availableDocuments: [paths[1]!] }, policy({
      roles: [{ id: 'notes', pattern: 'docs/*', role: 'intent' }],
      owners: [{ id: 'owner', pattern: 'docs/*', ownerDocument: paths[0]! }],
    }));
    expect(result.documents.map(document => document.path)).toEqual(paths);
    expect(result.documents.map(document => document.sourceAuthority)).toEqual(['declared', 'inferred']);
    expect(result.documents.every(document => document.ownership.status === 'unavailable')).toBe(true);
  });

  it('orders output and digest independently of caller array and rule ordering', () => {
    const paths = ['docs/feature.md', 'docs/owner.md'];
    const configuration = context({ approvedIntentSources: ['docs/owner.md', './docs/**'], evidenceRoots: ['checks', './docs/validation/'] });
    const mappings = policy({ roles: [
      { id: 'feature', pattern: './docs/feature.md', role: 'plan' },
      { id: 'owner', pattern: 'docs/owner.md', role: 'intent' },
    ], owners: [
      { id: 'feature-owner', pattern: 'docs/feature.md', ownerDocument: 'docs/owner.md' },
      { id: 'self-owner', pattern: 'docs/owner.md', ownerDocument: 'docs/owner.md' },
    ] });
    const before = structuredClone({ configuration, mappings, paths });
    const first = classifyDocumentSources(paths, configuration, mappings);
    const second = classifyDocumentSources([...paths].reverse(), {
      approvedIntentSources: [...configuration.approvedIntentSources].reverse(),
      evidenceRoots: [...configuration.evidenceRoots].reverse(),
      availableDocuments: [...configuration.availableDocuments].reverse(),
    }, { schemaVersion: 1, roles: [...mappings.roles!].reverse(), owners: [...mappings.owners!].reverse() });
    expect(first).toEqual(second);
    expect({ configuration, mappings, paths }).toEqual(before);
  });

  it('hashes normalized policy and authority rules but excludes availability and selected paths', () => {
    const initial = classify(['docs/feature.md'], {}, policy());
    expect(classify([], { availableDocuments: [] }, policy()).policyDigest).toBe(initial.policyDigest);
    expect(classify(['docs/feature.md'], { approvedIntentSources: ['./docs/owner.md', 'docs/owner.md'],
      evidenceRoots: ['./docs/validation/'] }, policy()).policyDigest).toBe(initial.policyDigest);
    expect(classify(['docs/feature.md'], { approvedIntentSources: [] }, policy()).policyDigest).not.toBe(initial.policyDigest);
    expect(classify(['docs/feature.md'], { evidenceRoots: [] }, policy()).policyDigest).not.toBe(initial.policyDigest);
    expect(classify(['docs/feature.md'], {}, policy({ roles: [] })).policyDigest).not.toBe(initial.policyDigest);
    expect(classify([], {}, { schemaVersion: 1 }).policyDigest).toBe(classify([], {}, { schemaVersion: 1, roles: [], owners: [] }).policyDigest);
  });

  it('returns complete empty source classification without implying traversal or product completeness', () => {
    expect(classify([])).toMatchObject({ documents: [], issues: [], complete: true });
  });

  it.each([
    null, [], {}, { schemaVersion: 2 }, { schemaVersion: 1, unsupported: true },
    { schemaVersion: 1, roles: null }, { schemaVersion: 1, owners: 'docs/owner.md' },
    { schemaVersion: 1, roles: [{ id: 'role', pattern: '**', role: 'unclassified' }] },
    { schemaVersion: 1, roles: [{ id: 'role', pattern: '**', role: 'intent', approved: true }] },
    { schemaVersion: 1, roles: [{ id: 'invalid id', pattern: '**', role: 'intent' }] },
    { schemaVersion: 1, owners: [{ id: 'owner', pattern: '**', ownerDocument: '../owner.md' }] },
    { schemaVersion: 1, owners: [{ id: 'owner', pattern: '**', ownerDocument: 'docs\\owner.md' }] },
    { schemaVersion: 1, owners: [{ id: 'owner', pattern: '**', ownerDocument: 'src/owner.ts' }] },
    { schemaVersion: 1, roles: [{ id: 'same', pattern: '**', role: 'intent' }],
      owners: [{ id: 'same', pattern: '**', ownerDocument: 'docs/owner.md' }] },
  ])('rejects malformed explicit policy %#', invalid => {
    expect(() => parseDocumentClassificationPolicy(invalid)).toThrow();
  });

  it.each(['', '/docs/**', '../docs/**', 'docs/../**', 'docs//**', 'docs/./**', '!docs/**',
    'docs/[abc].md', 'docs/{a,b}.md', 'docs/***/file.md', 'docs/\nfile.md', 'C:/docs/**'])('rejects unsupported pattern %j', pattern => {
    expect(() => parseDocumentClassificationPolicy(policy({ roles: [{ id: 'role', pattern, role: 'intent' }] }))).toThrow();
  });

  it.each(['docs/../owner.md', './docs/owner.md', 'docs\\owner.md', '../owner.md', '/owner.md',
    'docs/*.md', 'docs/owner.md/', 'docs/owner\0.md', 'docs/\uFFFD.md', 'src/worker.ts'])('rejects noncanonical selected or available path %j', path => {
    expect(() => classify([path])).toThrow();
    expect(() => classify([], { availableDocuments: [path] })).toThrow();
  });

  it('bounds policies, patterns, IDs and document collections before classification', () => {
    const manyMappings = Array.from({ length: 1001 }, (_, index) => ({ id: `role-${index}`, pattern: '**', role: 'intent' as const }));
    expect(() => parseDocumentClassificationPolicy(policy({ roles: manyMappings }))).toThrow(/1000/);
    expect(() => parseDocumentClassificationPolicy(policy({ roles: [{ id: 'a'.repeat(129), pattern: '**', role: 'intent' }] }))).toThrow(/128/);
    expect(() => parseDocumentClassificationPolicy(policy({ roles: [{ id: 'role', pattern: 'a'.repeat(4097), role: 'intent' }] }))).toThrow();
    expect(() => classify(Array.from({ length: 10_001 }, (_, index) => `docs/${index}.md`))).toThrow(/10000/);
    expect(() => classify([], { evidenceRoots: Array.from({ length: 1001 }, () => '.') })).toThrow(/1000/);
    expect(() => classify(['docs/owner.md', 'docs/owner.md'])).toThrow(/duplicate/);
    expect(() => classify([], { availableDocuments: ['docs/owner.md', 'docs/owner.md'] })).toThrow(/duplicate/);
  });
});
