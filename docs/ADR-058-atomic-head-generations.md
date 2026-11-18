# ADR 058: Atomic current and previous snapshot generations

Status: R3b2b candidate after 0.10.0. Builds on [ADR 057](ADR-057-managed-cache-lifecycles.md).

## Decision

A snapshot head stores its current and immediate prior distinct published ID in
one JSON record: `{ "schemaVersion": 1, "snapshotId": "B", "previousSnapshotId": "A" }`.
First publication omits the predecessor. The existing per-head lock serializes
ordinary and compare-and-swap publishers; one atomic replacement commits both
references. Readers observe one complete generation record. Republishing B leaves
the record and bytes unchanged, including its predecessor A. Publishing C advances
to C/B; an explicit rollback to A advances to A/C.

The new target's immutable manifest is checked before taking the short lock.
Inside the lock, the store reads the current head, checks the optional expected
current ID and verifies that the old current snapshot is still an ordinary file.
It does not parse that potentially multi-GiB graph again under the lock. Existing
managed operation admission protects the whole lifecycle from future maintenance.
A malformed head, missing new/current target, failed CAS or failed replacement
leaves the prior record in place. An error after a filesystem commit can still
require reading the head to determine the outcome; no power-loss durability or
distributed-filesystem transaction guarantee is added.

`withSnapshotAccess(root, callback)` now exposes `readHeadState(name)`. Read and
consume the selected snapshot within that callback when it must remain protected.
The file-store-specific state is not a new mandatory method on the neutral
`SnapshotStore` interface; custom stores retain their existing contract.

## Compatibility and retention

Legacy `{ "snapshotId": "A" }` heads remain readable. An unchanged publication
preserves their exact bytes and does not invent historical predecessors. The next
distinct publication records A as previous. Legacy long filenames remain intact;
when both old and normalized head files exist, retention inspection continues to
flag the ambiguity for explicit disposition rather than deleting either.

New writers record generations in both marked and unmarked roots. Older writers
can overwrite an unmarked record without preserving its predecessor. Reliable
coordinated retention requires the managed-root quiescence/upgrade procedure and
compatible writers throughout; generation metadata alone never authorizes GC.
Snapshot bytes, content digests, extraction identities and reusable artifacts are
unchanged. No new extraction or historical snapshot rewrite is performed.

Inventory links both references, including undeclared heads. Active-scope review
protects the tracked predecessor plus any additional manually declared rollback
snapshot or pin. Explicit retirement of a head binds both references into removal
ordering. Missing/malformed references block review; plans remain `canApply: false`.
The planner version changes to `declared-retention-v2`, invalidating older saved
plans without changing graph or extraction identities.

This retains one immediate predecessor, not every previously successful release
and not a new business-validation claim. Explicit pins remain necessary for other
required history. R3b3 will add reviewed removal and interrupted-operation recovery.
R4 will add configurable history targets and indefinite retention. The proposed
10 GiB history target will not cap a necessary graph or silently reduce coverage.

## Qualification

Public regressions cover unchanged bytes, rotation/rollback, legacy heads, rejected
records, publication failure/retry, competing processes/CAS, atomic reader views,
ordinary-file checks without reparsing the old graph, inspection/plan protection,
manual rollback, retirement ordering and stale plans. The installed-package smoke
exercises the public state API. Linux and Windows results are recorded in
[validation](VALIDATION.md) and the candidate PR; no consumer cache is modified.
