import { syntheticSnapshot } from '../benchmark-shacl.mjs';
import { createHash } from 'node:crypto';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const scenarios = ['cold', 'repeat', 'rebuild', 'manifest-only', 'insert', 'update', 'delete', 'rename',
  'invalid-confidence', 'invalid-shared-kind', 'repair-delete'];

/** Worst-case metadata density; not a claim about the private consumer's distribution. */
export function syntheticFixture(count, topology) {
  const snapshot = syntheticSnapshot(count, topology === 'document-rich' ? 'shared' : topology);
  if (topology === 'document-rich') for (const [index, fact] of snapshot.facts.entries()) {
    fact.sourceRole = ['intent', 'plan', 'validation', 'reference'][index % 4];
    fact.sourcePolicyDigest = hash('public-owner-policy');
    fact.sourceOwnership = index % 4 < 2
      ? { status: 'resolved', ownerDocuments: ['docs/public-owner.md'], mappingIds: ['public-owner'] }
      : { status: 'not-required', ownerDocuments: [], mappingIds: [] };
  }
  snapshot.manifest.contentDigest = hash(JSON.stringify(snapshot.facts));
  return snapshot;
}

/** Public benchmark edits. These are complete candidate graphs, never a production delta validator. */
export function scenarioSnapshot(base, scenario) {
  if (['cold', 'repeat', 'rebuild'].includes(scenario)) return structuredClone(base);
  if (scenario === 'repair-delete') {
    const repaired = scenarioSnapshot(base, 'invalid-shared-kind');
    repaired.facts.pop();
    repaired.manifest = structuredClone(base.manifest);
    return repaired;
  }
  const snapshot = structuredClone(base);
  const last = snapshot.facts.at(-1);
  if (!last) throw new Error('Benchmark edits need a nonempty fixture');
  if (scenario === 'manifest-only') snapshot.manifest.generatedAt = '2026-01-02T00:00:00.000Z';
  else if (scenario === 'insert') snapshot.facts.push({ ...structuredClone(last), id: `${last.id}-insert` });
  else if (scenario === 'update') last.confidence = last.confidence === 0.75 ? 0.85 : 0.75;
  else if (scenario === 'delete') snapshot.facts.pop();
  else if (scenario === 'invalid-confidence') last.confidence = 2;
  else if (scenario === 'invalid-shared-kind') snapshot.facts.push({ ...structuredClone(last),
    id: `${last.id}-conflict`, subject: { ...last.subject, kind: last.subject.kind === 'Document' ? 'Component' : 'Document' } });
  else if (scenario === 'rename') {
    const id = snapshot.facts.flatMap(f => [f.subject.id, f.object.id]).find(id => id.startsWith('component:file:'));
    if (!id) throw new Error('Rename benchmark needs an actual physical file identity');
    const path = id.slice('component:file:'.length);
    const renamed = path.replace(/([^/]+)$/, 'renamed-$1');
    for (const fact of snapshot.facts) {
      for (const node of [fact.subject, fact.object]) if (node.id === id) {
        node.id = `component:file:${renamed}`; node.label = renamed;
      }
      if (fact.provenance.path === path) fact.provenance = { ...fact.provenance,
        path: renamed, digest: hash(`${fact.provenance.digest}:rename`) };
    }
  } else throw new Error(`Unknown scenario ${scenario}`);
  snapshot.manifest.contentDigest = hash(JSON.stringify(snapshot.facts));
  return snapshot;
}

export function expectedConformance(scenario) { return !scenario.startsWith('invalid-'); }
export function normalized(report) {
  return { conforms: report.conforms, issues: [...report.issues].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
}
