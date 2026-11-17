# ADR 054: Read-only inventory and streamed representation profiling

Status: implemented for review, November 17, 2026. R2 in the
[storage plan](CACHE-RETENTION-PLAN.md); no release or consumer cleanup claim.

## Decision

Add data-only CLI paths `cache usage` and `cache profile` before application/provider
initialization. Inventory covers explicit roots or the user cache plus configured
stores, deduplicates overlapping roots, and reports logical and available allocated
bytes by class/profile/repository. Filesystem links are not traversed; hard-linked
ordinary files are counted by exact device/inode identity. Unknown content is not
parsed. Snapshot prefix metadata and complete JSON/hash inspection have distinct
states. Malformed, changed, limited and unreadable objects remain visible.

Profiling streams JSON using the existing parser dependency, with bounded record,
depth, root-field and fingerprint-map limits. It attributes compact UTF-8 bytes by
section/fact field and measures repeated complete entities/provenance/string values.
Hashes replace private text in counters. Exact stored bytes and their digest remain
separate from compact encoding measurements. Equal IDs alone never justify merging
records; authority/provenance differences remain part of full-payload identity.

Use one opened handle and before/after identity, length and nanosecond timestamp
checks for each inspected file. Reject linked ancestors/leaves and report observed
concurrent mutations. This is read-only observation, not a hostile-process atomic
filesystem census or the future GC coordination protocol. Cancellation stops work
without editing cache files. No hydration, extraction, index or compiler runs are
started by inspection commands.

## Boundaries

R2 recognizes known layout but does not assert deletion ownership. Heads and lease
markers are evidence of references/possible activity, not active-scope registrations,
permanent pins or permission to remove old work. Unsupported pin/archive/active
states are explicitly not evaluated. Full JSON and SHA-256 inspection does not
rerun SHACL or validate the producer content digest. Repository attribution uses
profile manifests and leaves ambiguous/unbound data visible.

Allocation is unavailable on Windows; inode identity is preserved without number
precision loss. Filesystem compression/shared extents and future build peaks are
not inferred. Repetition classes overlap and are not promised compression ratios.
No retention configuration, extraction identity, cache partition or snapshot format
changes in this increment. R3/R4 own deletion coordination and budget enforcement.
R5 should use the [measured public corpus](assessments/storage-profile-r2.md) to
choose format experiments and exact semantic/query equivalence tests.
