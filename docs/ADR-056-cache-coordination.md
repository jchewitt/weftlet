# ADR 056: Operation-scoped cache coordination

Status: R3b1 implemented for review, November 17, 2026 (Central). This is an
internal foundation. [ADR 057](ADR-057-managed-cache-lifecycles.md) adds the R3b2a
lifecycle candidate; head tracking and removal remain R3b2b/R3b3.

## Problem

A head lock serializes pointer updates, but cannot keep a graph alive while a
reader copies it or a build prepares publication. A lease around `file(id)` alone
ends before its returned filename is consumed. Retention needs a boundary around
the complete operation, including asynchronous work still using its files.

## Protocol

Within one explicitly selected cache root, `.weftlet-coordination/participants/`
holds uniquely named activity records. A shared activity may be a reader or a
writer. It admits alongside other activities, leaving immutable publication and
existing head CAS locks responsible for writer conflicts.

An exclusively created `gate.lock` serializes admission. Shared admission creates
its participant before releasing the gate. Maintenance holds the gate while all
existing participants drain, and throughout its own callback. New participants
cannot enter during that interval. Participant release needs no gate, so existing
activities can drain. An unknown participant entry also blocks maintenance.

Records contain a protocol version, random operation ID, mode, PID and start time.
PID and time are diagnostic only. Release verifies directory and file identities,
ordinary/unshared file status and exact marker bytes before removing only its own
record. Links/junctions and changed roots are rejected. Control directories remain;
concurrent users never race to remove/recreate them. Cooperation among processes
with local filesystem exclusive-create semantics is required; hostile same-user
mutations and network/distributed filesystem semantics are not covered.

Waiting is bounded (10 seconds by default, at most 300 seconds) and cancellable.
The timeout covers admission/drain, not a running operation. Callback cancellation
is cooperative: an abort never releases protection while the callback still runs.
Errors propagate; if both an operation and cleanup fail, both errors are retained.
The API is non-reentrant: a maintenance callback cannot acquire shared access on
the same root. Nested independent roots need an ordered acquisition design before
multi-root production adoption.

## Scoped snapshot access

`withSnapshotAccess` supplies a scoped store facade inside shared activity. One
lease spans head lookup, snapshot reads, write/publication and `withFile` copy
callbacks. Calls already started settle before release, even if the outer callback
returns early or throws. Calls through a facade retained after the scope are
rejected. Callers must still await operation promises and consume filenames within
`withFile`; returning a stream/path for later use does not extend protection.

This facade retains `FileSnapshotStore`'s logical identities, immutable bytes and
head CAS semantics. It changes no extraction identity, evidence authority, graph
format or model budget. The existing raw store and current application paths are
unchanged; the facade is not yet exported through the package's public API.

## Interrupted owners and activation boundary

A crash leaves its marker. An abandoned participant blocks maintenance but permits
other shared activity; an abandoned gate blocks all new admission. Nothing steals
a marker based on elapsed time or a missing PID. Bounded, reviewed recovery under
confirmed quiescence is still required in R3b3. This conservative initial behavior
does not claim automatic crash recovery.

The retention inventory recognizes these records as possible activity and blocks
review readiness. Empty control directories are retained without claiming active
work. A future applying collector must distinguish its own verified coordination
record from other activity while revalidating a plan; it cannot ignore all markers.

**No applying collector is enabled.** Existing binaries/raw consumers do not obey
this protocol. Before deletion, adopt complete hydration, semantic/index/compiler
writes, saved-query loading, comparison and export/import lifecycles; define root
binding across shared artifacts/profiles; establish an explicit managed-cache
migration with old clients quiesced. Add transactional current/previous references,
then reviewed removal and interrupted-operation recovery. A marker alone cannot
make an existing cache safe for collection. R4 configurable history retention follows that work.

## Qualification

Public tests use real files and independent Node processes for concurrent shared
access, draining, exclusive exclusion and killed owners. Additional cases cover
cancellation, failed callbacks, changed marker ownership, linked/swapped control
roots, unknown participant records, separate roots, retention reporting, exact
snapshot-byte preservation and pending scoped copy operations. Native Windows
runs in hosted onboarding; its open-handle directory protection is distinguished
from the actual POSIX directory-swap test. See [validation](VALIDATION.md) for
observed results rather than treating configured CI as a pass.
