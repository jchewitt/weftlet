import { persistedJsonDigest, stableJsonDigest, type GraphSnapshot } from '@weftlet/core';
import { assertGraphIdentities } from '../../graph/identity-preflight.js';
import { RdfEvidenceGraph } from '../../graph/rdf.js';
import { readJsonFile } from '../../storage/streaming-json.js';
import { snapshotPath } from '../../storage/storage.js';
import { validDigest } from './contract.js';

export interface TransferProgress { readonly phase: string; readonly completed?: number; readonly total?: number; }
export interface TransferControl { readonly signal?: AbortSignal; readonly onProgress?: (event: TransferProgress) => void; }
export function checkpoint(control: TransferControl, phase: string) {
  control.signal?.throwIfAborted();
  control.onProgress?.({ phase });
}

/** Validate the persisted evidence without executing repository code or reclassifying authority. */
export async function validateTransferredSnapshot(path: string, control: TransferControl) {
  checkpoint(control, 'read-snapshot');
  const snapshot = await readJsonFile<GraphSnapshot>(path);
  const m = snapshot?.manifest;
  if (!m || m.schemaVersion !== 1 || typeof m.repositoryId !== 'string' || !m.repositoryId ||
      !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(m.commitSha) || !validDigest(m.contentDigest) ||
      !validDigest(m.configurationDigest) || !Array.isArray(m.scope) || !m.scope.every(x => typeof x === 'string') ||
      !m.extractorVersions || !/^standalone-graph-v\d+$/.test(m.extractorVersions.assembly ?? '') ||
      !Array.isArray(m.semanticArtifactKeys) || !m.semanticArtifactKeys.every(x => typeof x === 'string') ||
      !Array.isArray(snapshot.facts) || !Array.isArray(snapshot.invariants) || !Array.isArray(snapshot.runtimeEvidence) ||
      !Array.isArray(snapshot.unresolved) || (snapshot.diagnostics !== undefined && !Array.isArray(snapshot.diagnostics))) {
    throw Error('Unsupported or malformed committed hydration snapshot');
  }
  if (m.overlayDigest || m.overlayCapture) throw Error('Snapshot delivery currently supports committed hydration snapshots, not working overlays');
  if (snapshot.invariants.some(result => result.status === 'fail')) throw Error('Snapshot records failed invariant validation');
  snapshotPath('.', m.snapshotId); // Apply the normal safe logical-ID contract.
  const ids = new Set<string>();
  for (const fact of snapshot.facts) {
    if (!fact || typeof fact.id !== 'string' || ids.has(fact.id) || fact.snapshotId !== m.snapshotId ||
        !fact.subject || !fact.object || !fact.provenance || !fact.extractor) throw Error('Invalid or duplicate snapshot assertion');
    ids.add(fact.id);
  }
  checkpoint(control, 'validate-identities');
  assertGraphIdentities(snapshot.facts, { repositoryId: m.repositoryId });
  const report = await new RdfEvidenceGraph(snapshot).validate({ onProgress: event => {
    control.signal?.throwIfAborted();
    control.onProgress?.({ phase: event.phase, completed: event.completed, total: event.total });
  } });
  if (!report.conforms) throw Error(`Imported evidence fails strict graph validation (${report.issues.length} issues); no head was changed`);
  checkpoint(control, 'hash-persisted-graph');
  return { snapshot, persistedGraphDigest: persistedJsonDigest(snapshot) };
}
export const sameValue = (left: unknown, right: unknown) => stableJsonDigest(left) === stableJsonDigest(right);
