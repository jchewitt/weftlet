# ADR 059: Reviewed removal under exclusive cache coordination

Status: R3b3a candidate after 0.10.0. Builds on [managed lifecycles](ADR-057-managed-cache-lifecycles.md)
and [atomic generations](ADR-058-atomic-head-generations.md). Explicit interrupted-owner
recovery remains R3b3b; automatic/configurable history retention remains R4.

## Decision

Keep the observational `retention plan/check` contract non-destructive. Add separate
`retention prepare/apply` operations for an exact explicitly activated root. Preparation
holds exclusive maintenance while reading complete JSON and hashes and evaluating the
same canonical profile/head/pin rules used by observational review. It binds the root ID,
current policy, scan limits, evidence inventory, candidate identities and dependencies
into an explicit plan ID. Nested managed roots, incomplete scans, invalid/dangling
references and unknown directory identities block preparation. At most 10,000 eligible
files are included in one batch. This is a removal bound, not a graph/build-size cap.

Apply requires the prepared report and exact `--expect-plan` ID, rereads the supplied
policy under admission, drains active readers/writers, and recomputes the whole decision
before unlinking. Old observational reports are ineligible. Pin expiry changes, new heads,
changed files/ownership/policy and different inventory limits invalidate preparation.
The application also rereads the external policy before each unlink. Policy changes
during a partial operation stop further work; they cannot undo earlier approved removals.

The root's reserved `.weftlet-coordination` subtree is excluded from the evidence-state
digest. Its changing gate, participants and journals cannot make every plan stale.
Directory device/inode identities are retained while volatile directory timestamps,
allocation and link counts are normalized. Complete entry enumeration and file revisions
still detect evidence additions/removals and changed files. Nested control directories
are not excluded. Other unknown files remain visible, protected and identity-bound.

Eligible objects are limited to unshared verified snapshot files and explicitly retired
head files. Heads are removed before dependent snapshots; any failure stops the loop.
Current/previous/pinned/undeclared-head references, shared files, semantic artifacts,
indexes, receipts and unknown data remain protected by the shared rules. No recursive
removal or provider request is performed. Existing snapshot bytes and semantic identities
are not rewritten. An evicted explicit historical ID remains absent, never a newer graph.

## Journal and failure boundary

Apply first creates an owned `.pending` marker and JSONL journal under the root's
`removals` control directory. It syncs the selected candidate identities, then a separate
intent before each unlink. Each candidate is checked for containment, ordinary/unshared
file type, revision and full SHA-256; its revision and policy are rechecked after intent.
The journal records each completed unlink and a complete/partial result. Only a synced
terminal result permits removal of the exact owned pending marker.

Ordinary cancellation or I/O failure returns a partial result and leaves remaining files
intact. There is no rollback promise: an already retired head stays retired. Reprepare
from actual remaining state, updating declarations only for retirements confirmed by the
journal. An unchanged zero-deletion failure can retry the same reviewed plan. Logical
removed bytes are not a promise of recovered allocated disk capacity.

Journal creation/sync/finalization failure leaves a pending blocker or reports uncertain
completion. A process kill can leave the maintenance gate as well. Preparation refuses
pending journals; admission never steals gates/participants by age or PID. Preserve this
state for explicit recovery in R3b3b. This slice does not supply automatic replay, an
emergency force-unlock or cleanup of interrupted files. Existing evidence is not treated
as disposable merely because a marker is old.

This is a cooperating local-filesystem protocol. All clients must be upgraded/quiesced
at activation. It does not defend against a hostile same-user process racing filesystem
operations, nor claim distributed locking or power-loss transactional durability.
Filesystem sync ordering is tested through injected failures; actual disk-loss recovery
and private consumer caches are separate qualification.

## Validation

Public tests cover exact removal and retained byte/query identity, independent-process
readers, stale/old/tampered plans, pin expiry, policy rereads, bounded/incomplete scans,
links/junctions, nested ownership, long logical IDs, failed head retirement, cancellation,
post-intent replacement and journal failures before/after unlink. A fresh packed consumer
runs the new CLI on isolated public fixtures. See [validation](VALIDATION.md) and the PR
for actual Linux/Windows results and remaining limits.
