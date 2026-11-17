# ADR 052: explicit verified snapshot delivery

Status: implemented for review; qualification is recorded in [VALIDATION.md](VALIDATION.md).
Date: November 16, 2026 (UTC).

## Decision

Add `snapshot export` and `snapshot import` for immutable committed hydration
snapshots. A directory bundle contains `manifest.json`, `snapshot.json`, and
optional `semantic-<hash>.json` artifacts. Filenames are fixed or hashed, independent
of logical snapshot IDs and source paths. The manifest retains the producing
repository, commit, scope, configuration, coverage and extractor/ontology/model
identities. It records the exporting toolkit version separately, not as a claim
about which toolkit originally produced historical evidence.

The manifest binds every payload's byte length and SHA-256, and a canonical digest
of the complete persisted snapshot. Import requires the expected manifest SHA-256
from a trusted channel. The manifest cannot authenticate itself: this is an
integrity contract, not a signature or proof that a producer's assertions are true.
Exports contain private evidence/citations; adding semantic artifacts also includes
raw extraction output. Transfer never includes the entire repository, executable
adapters, credentials, indexes or compiler scratch by walking their directories.

## Digest compatibility

Hydration's existing `contentDigest` hashes pre-persistence logical data. The legacy
canonical encoding retains object properties with `undefined`, whereas JSON drops
them. Other assembly families also use different logical envelopes. Consequently,
the original digest cannot always be reconstructed from a saved JSON snapshot.

Preserve it byte-for-byte as `producerContentDigest: preserved-not-recomputed` in
the transfer report. Add `persistedGraphDigest` using the existing streaming
`persistedJsonDigest` encoding over the complete persisted graph. Export computes
this from saved bytes; import recomputes and compares it after verifying those
bytes against the trusted manifest. Do not rename it `contentDigest`, change
extraction/cache identity, or claim an independent clean build. No migration of
historical snapshots is necessary.

## Validation and publication

Read configuration as data. Do not construct the application, load its adapter,
call providers, index sources or compile ontology. Identity preflight, full strict
SHACL and deterministic code/binding/call/obligation evidence checks run on both
export and import. Repeated fact IDs and mismatched fact snapshot IDs are rejected.
Saved failed invariants are rejected; import does not rerun project-specific
invariant evaluators. Queries and existing current-diff checks remain responsible
for their normal freshness and policy requirements.

Import stages verified copies under an operation-owned directory, checks all
immutable collisions, then installs complete files using no-overwrite links.
Existing bytes must match exactly, including metadata/formatting. Normal snapshot
and semantic stores retain their existing formats. Semantic adoption additionally
requires the artifact's exact Git source revision and matching source/model/
prompt/extractor/adapter/ontology contract. A snapshot-only import can be queried
without those reusable cache entries.

Default import is by ID only. Explicit `--activate --expect-head <id|none>` requires
matching configuration, extraction versions and default/agent scope identity.
Historical commits remain labeled stale. A cooperating per-head exclusive lock
serializes normal writers and the final compare-and-swap; the manifest and payload
are installed before that last head operation. A conflicting head update leaves
the winner intact. Already installed valid, unselected files may remain if a later
installation or head activation fails. They are not removed speculatively.

## Filesystem and resource boundary

Reject symlinks/junctions in transfer paths and their ancestors, hardlinked input
files, unlisted bundle entries, unsafe names and byte-budget violations. Stream
copy/hashing and JSON parsing avoid graph-sized strings. Strict validation still
loads the graph object and requires memory proportional to its size.

Default payload allowance is 2 GiB, configurable up to 16 GiB, plus at most 1 MiB
for the manifest. Preflight available space with a 256 MiB safety floor; actual
copy counters enforce the operation's declared payload limit. This is not a
global disk reservation or cache cap. Concurrent unrelated disk users can consume
free space. R1–R5 will coordinate global budgeting/GC; the import lease records PID,
start time and reserved payload bytes, but no current GC consumes that record.

Normal failure/cancellation removes only this operation's staging directory.
Cancellation is checked during copying and at validation phase/group boundaries.
A process crash can leave staging or a head lock. Never steal an old lock merely
because of age; confirm the writer stopped before manual recovery. Local directories
must be controlled by the user: this is not an OS sandbox against another process
with permission to mutate ancestor directories. Artifact installation currently
requires staging and destination on the same filesystem for atomic linking.

## Bounded first release

Committed hydration snapshots are supported. Working overlays and architecture-only
snapshots are rejected. Delivery does not fetch CI artifacts, upload to an archive,
refresh desktop clients, or grant source/assertion approval. Those operations have
separate trust and lifecycle requirements. The [guide](guides/SNAPSHOT-DELIVERY.md)
provides the explicit CI/download/import/reconnect flow.
