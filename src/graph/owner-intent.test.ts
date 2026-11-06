import { expect, it } from 'vitest';
import { citesOwner, normalizeOwnerDocument, prioritizeOwnerIntent } from './owner-intent.js';
import { ownerFact, ownerPath } from '../../examples/owner-intent/fixture.js';

const workflow = { id: 'workflow:fulfill', kind: 'Workflow' as const, label: 'Fulfillment' };

it('retains baseline order without an owner or eligible owner evidence', () => {
  const inferred = ownerFact('inferred', 'routesThrough', workflow, { sourceAuthority: 'inferred' });
  const plan = ownerFact('plan', 'routesThrough', workflow, { sourceRole: 'plan' });
  const validation = ownerFact('validation', 'routesThrough', workflow, { sourceRole: 'validation' });
  const original = [validation, inferred, plan];
  expect(prioritizeOwnerIntent(original, undefined).facts).toBe(original);
  expect(prioritizeOwnerIntent(original, undefined).report(original)).toBeUndefined();
  const result = prioritizeOwnerIntent(original, ownerPath);
  expect(result.facts).toEqual(original);
  expect(result.report(original)).toMatchObject({ citedFacts: 3, intentFacts: 0, assertionFacts: 0, priorityFactIds: [] });
});

it('prioritizes exact citations, normalizing separators without matching names, ownership metadata or path prefixes', () => {
  expect(normalizeOwnerDocument('./')).toBe('./');
  const actual = ownerFact('actual', 'routesThrough', workflow);
  const unrelated = [ownerPath + '.bak', 'docs/intent/Reservation-owner.md', '/host/' + ownerPath, 'docs/other.md']
    .map((path, i) => ({ ...actual, id: `unrelated-${i}`, subject: { ...actual.subject, label: ownerPath },
      provenance: { ...actual.provenance, path }, sourceOwnership: { status: 'resolved' as const, ownerDocuments: [ownerPath], mappingIds: [] } }));
  const original = [...unrelated, actual];
  for (const owner of [ownerPath, '.\\docs\\intent\\reservation-owner.md']) {
    expect(unrelated.map(fact => citesOwner(fact, owner))).toEqual([false, false, false, false]);
    const result = prioritizeOwnerIntent(original, owner);
    expect(result.facts).toEqual([actual, ...unrelated]);
    expect(result.report(result.facts)).toMatchObject({ citedFacts: 1, intentFacts: 1, assertionFacts: 1,
      returnedFacts: 1, returnedAssertions: 1, priorityFactIds: ['actual'] });
  }
});

it('prefers assertions over built-in generated links, caps priority and retains all remaining relative order', () => {
  const links = Array.from({ length: 8 }, (_, i) => ownerFact(`link-${i}`, 'contains', workflow,
    { extractor: { id: i % 2 ? 'document-linker' : 'document-evidence-extractor', version: '1' } }));
  const claims = Array.from({ length: 9 }, (_, i) => ownerFact(`assertion-${i}`, 'routesThrough', workflow,
    { extractor: { id: 'custom-provider', version: '1' } }));
  const result = prioritizeOwnerIntent([...links, ...claims], ownerPath);
  expect(result.facts).toEqual([...claims.slice(0, 4), ...links, ...claims.slice(4)]);
  expect(result.report(result.facts.slice(0, 1))).toMatchObject({ citedFacts: 17, intentFacts: 17,
    assertionFacts: 9, returnedFacts: 1, returnedAssertions: 1, priorityFactIds: claims.slice(0, 4).map(fact => fact.id) });
  const fallback = prioritizeOwnerIntent(links, ownerPath);
  expect(fallback.facts).toEqual(links);
  expect(fallback.report(links.slice(0, 2))).toMatchObject({ assertionFacts: 0, returnedFacts: 2, returnedAssertions: 0 });
});
