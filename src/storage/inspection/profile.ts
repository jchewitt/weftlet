import { withManagedCacheAccess } from '../coordination/managed-access.js';
import { inspectJson, InspectionError, type JsonInspectionOptions } from './read.js';
import { RepetitionCounter, countStrings } from './repetition.js';

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const byteLength = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
const arraySections = ['facts', 'invariants', 'runtimeEvidence', 'unresolved', 'diagnostics'];
export interface ProfileOptions extends Omit<JsonInspectionOptions, 'onRecord' | 'manifestOnly'> { maxDistinct?: number }

/** Byte attribution is compact JSON encoding; physical file size is measured separately. */
export async function profileSnapshot(path: string, options: ProfileOptions = {}) {
  return withManagedCacheAccess([path], () => profileSnapshotOwned(path, options), { signal: options.signal });
}
async function profileSnapshotOwned(path: string, options: ProfileOptions) {
  const maxDistinct = options.maxDistinct ?? 100_000;
  if (!Number.isSafeInteger(maxDistinct) || maxDistinct < 1 || maxDistinct > 1_000_000) throw Error('maxDistinct must be between 1 and 1000000');
  const entities = new RepetitionCounter(maxDistinct), provenance = new RepetitionCounter(maxDistinct);
  const strings = new RepetitionCounter(maxDistinct), diagnostics = new RepetitionCounter(maxDistinct);
  const sections = new Map<string, { records: number; compactValueBytes: number }>();
  const fields = new Map<string, { occurrences: number; compactValueBytes: number; compactKeyAndValueBytes: number }>();
  let largestRecord = 0;
  const result = await inspectJson(path, { ...options, onRecord(section, value) {
    if (section === 'facts' && !object(value)) throw new InspectionError('invalid-json', 'Expected a fact object');
    const bytes = byteLength(value); largestRecord = Math.max(largestRecord, bytes);
    const total = sections.get(section) ?? { records: 0, compactValueBytes: 0 };
    total.records++; total.compactValueBytes += bytes; sections.set(section, total);
    if (section === 'facts') {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (!fields.has(key) && fields.size >= 256) throw new InspectionError('limit', 'Fact field diversity limit exceeded');
        const field = fields.get(key) ?? { occurrences: 0, compactValueBytes: 0, compactKeyAndValueBytes: 0 };
        field.occurrences++; field.compactValueBytes += byteLength(item);
        field.compactKeyAndValueBytes += byteLength(key) + 1 + byteLength(item); fields.set(key, field);
      }
      const fact = value as Record<string, unknown>;
      entities.add(fact.subject); entities.add(fact.object); provenance.add(fact.provenance);
      countStrings(fact, strings);
    }
    if (section === 'diagnostics') diagnostics.add(value);
  } });
  const m = result.manifest;
  if (!m || m.schemaVersion !== 1 || typeof m.snapshotId !== 'string' || typeof m.repositoryId !== 'string' ||
      typeof m.commitSha !== 'string' || typeof m.contentDigest !== 'string' || result.sections.facts !== 'array') {
    throw new InspectionError('invalid-json', 'Expected a version-1 snapshot manifest and facts array');
  }
  for (const section of arraySections) {
    if (result.sections[section] && result.sections[section] !== 'array') throw new InspectionError('invalid-json', 'Expected snapshot evidence arrays');
    if (result.sections[section]) {
      const total = sections.get(section) ?? { records: 0, compactValueBytes: 0 };
      total.compactValueBytes += 2 + Math.max(0, total.records - 1); sections.set(section, total);
    }
  }
  const known = [...sections.keys()];
  const compactKnown = 2 + Math.max(0, known.length - 1) + [...sections].reduce((sum, [key, value]) => sum + byteLength(key) + 1 + value.compactValueBytes, 0);
  return { schemaVersion: 1, kind: 'snapshot-representation-profile', snapshot: snapshotSummary(m), physicalBytes: result.bytes, sha256: result.sha256, jsonComplete: result.jsonComplete,
  validation: 'JSON syntax and basic snapshot structure only; strict SHACL and producer content digest are not revalidated',
  measurement: 'UTF-8 compact JSON value bytes; key/colon and array punctuation included where stated. Not a compressed-size estimate.',
  sections: Object.fromEntries([...sections].sort()), factFields: Object.fromEntries([...fields].sort()),
  compactKnownSectionBytes: compactKnown, physicalMinusCompactKnownBytes: result.bytes - compactKnown,
  unprofiledRootFields: Object.keys(result.sections).filter(key => !sections.has(key)).sort(), largestRecordBytes: largestRecord,
  repetition: { entities: entities.report(), provenance: provenance.report(), factStrings: strings.report(), diagnostics: diagnostics.report() },
  limitations: ['Repetition categories overlap; do not add their byte counts together or treat them as guaranteed savings.',
    'Equal node IDs alone do not establish equivalent records; full payload fingerprints preserve differing labels, authority and provenance.',
    'Source-document bytes are not recorded by legacy snapshots. Artifact count does not bound indexed-code or snapshot size.',
    'Distinct-value limits disclose incomplete repetition tracking; every record still contributes to section and field byte totals.'] };
}

function snapshotSummary(m: Record<string, unknown>) {
  return {
    snapshotId: m.snapshotId, repositoryId: m.repositoryId, commitSha: m.commitSha, contentDigest: m.contentDigest,
    semanticArtifactCount: Array.isArray(m.semanticArtifactKeys) ? m.semanticArtifactKeys.length : null,
    selectedDocumentSourceBytes: null,
    selectedDocumentCount: object(m.documentSelection) && Array.isArray(m.documentSelection.semanticPaths) ? m.documentSelection.semanticPaths.length : null,
    codeInventory: object(m.codeInventory) && Array.isArray(m.codeInventory.files) ? {
      files: m.codeInventory.files.length,
      indexed: m.codeInventory.files.filter(file => object(file) && file.indexed === true).length,
      indexUnknown: m.codeInventory.files.filter(file => !object(file) || typeof file.indexed !== 'boolean').length,
      projects: Array.isArray(m.codeInventory.projects) ? m.codeInventory.projects.length : null,
    } : null,
  };
}
