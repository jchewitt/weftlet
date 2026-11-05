import type { GraphFact, GraphSnapshot, SnapshotStore } from '@weftlet/core';
import { stableJsonDigest } from '../infrastructure/util.js';
import { RdfEvidenceGraph } from './rdf.js';
import { projectCodeCoverage } from './code-coverage-projection.js';

/** Optional storage revision: must change on replacement/edit/delete, not just manifest changes. */
export type RevisionedSnapshotReader = Pick<SnapshotStore, 'read'> & {
  readRevision?(snapshotId: string): Promise<string | undefined>;
};

function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}

/** One immutable, lossless projection. No extraction, inference or snapshot writes. */
export class SnapshotEvidenceIndex {
  readonly byFact = new Map<string, GraphFact>();
  readonly adjacency = new Map<string, readonly GraphFact[]>();
  readonly digest: string;
  readonly code: ReturnType<typeof projectCodeCoverage>['overview'];
  private constructor(readonly snapshot: GraphSnapshot) {
    const adjacency = new Map<string, GraphFact[]>();
    for (const fact of snapshot.facts) {
      if (this.byFact.has(fact.id)) throw new Error('Duplicate fact identities prevent stable graph pagination');
      this.byFact.set(fact.id, fact);
      for (const id of new Set([fact.subject.id, fact.object.id])) {
        const entries = adjacency.get(id) ?? [];
        entries.push(fact); adjacency.set(id, entries);
      }
    }
    for (const [id, facts] of adjacency) this.adjacency.set(id, Object.freeze(facts));
    this.digest = stableJsonDigest({ manifest: snapshot.manifest, facts: snapshot.facts,
      diagnostics: snapshot.diagnostics, unresolved: snapshot.unresolved });
    this.code = projectCodeCoverage(snapshot).overview;
    freeze(this.code);
  }
  static async create(saved: GraphSnapshot): Promise<SnapshotEvidenceIndex> {
    const facts = await new RdfEvidenceGraph(saved).facts();
    // Projection already copies facts. Copy only other fields, without another graph-sized copy.
    const { facts: _facts, ...metadata } = saved;
    const snapshot = { ...structuredClone(metadata), facts };
    freeze(snapshot);
    return new SnapshotEvidenceIndex(snapshot);
  }
  binding(version: string, query: unknown): string {
    return stableJsonDigest({ version, query, evidenceDigest: this.digest });
  }
}

/** At most one retained snapshot. Readers without a revision capability are never cached. */
export class SnapshotIndexReader {
  private cached?: { id: string; revision: string; index: SnapshotEvidenceIndex };
  private pending?: { id: string; revision: string; result: Promise<SnapshotEvidenceIndex> };
  constructor(private readonly store: RevisionedSnapshotReader) {}

  async read(id: string): Promise<SnapshotEvidenceIndex> {
    const revision = await this.store.readRevision?.(id);
    if (revision !== undefined && this.cached?.id === id && this.cached.revision === revision) return this.cached.index;
    if (revision !== undefined && this.pending?.id === id && this.pending.revision === revision) return this.pending.result;
    const result = this.load(id, revision);
    const pending = revision === undefined ? undefined : { id, revision, result };
    this.pending = pending;
    try { return await result; }
    finally { if (this.pending === pending) this.pending = undefined; }
  }
  private async load(id: string, revision: string | undefined): Promise<SnapshotEvidenceIndex> {
    const saved = await this.store.read(id);
    if (!saved) { if (this.cached?.id === id) this.cached = undefined; throw new Error('No graph snapshot is available for that identifier'); }
    if (saved.manifest.snapshotId !== id) throw new Error('Saved snapshot identity does not match the requested identifier');
    const index = await SnapshotEvidenceIndex.create(saved);
    if (revision !== undefined) {
      if (await this.store.readRevision?.(id) !== revision) throw new Error('Snapshot changed while loading; restart the query');
      this.cached = { id, revision, index };
    }
    return index;
  }
}
