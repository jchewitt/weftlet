# ADR 057: Explicit managed roots and complete operation lifetimes

Status: R3b2a candidate, November 18, 2026. Builds on [ADR 056](ADR-056-cache-coordination.md).
No removal or automatic retention is enabled.

## Decision

Make coordination an explicit operational migration, outside graph configuration.
`cache coordination enable --root <directory> --acknowledge-quiescence` writes a
versioned `.weftlet-coordination/root.json` descriptor with a random root ID.
The operator must stop all clients, including old binaries and custom readers,
and serialize activation before using this command. The acknowledgement cannot
detect uncooperative processes. Existing unmarked caches retain their behavior,
including reads without creating control directories.

Activation requires a dedicated ordinary directory tree and a complete metadata
scan (at most 100,000 entries). It rejects links/junctions, overlapping managed
ancestors/descendants and filesystem roots. It does not read graph payloads or
change extraction/configuration identity. Invalid or unsupported descriptors fail
closed. Discovery resolves existing physical prefixes so an external alias into a
managed descendant cannot bypass its owner; aliases escaping an owner are rejected.
This is cooperative local-filesystem coordination, not protection against hostile
same-user path replacement or a distributed lock protocol.

## Operation boundaries

`withManagedCacheAccess(paths, callback, options)` discovers all owners first,
deduplicates and acquires them in stable order. Nested operations reuse those roots
and reject a newly requested managed owner. This avoids incremental lock-order
inversion. Admission waits are bounded and cancellable; running callbacks retain
protection until they settle. A separate async context for each tracked child lets
it finish nested work even after its parent callback returns or throws. Started
guarded promises drain before release; an escaped async context cannot start work
after its operation ends. Callers must still await their promises to observe errors.

The application factory and standalone entry points span hydration, semantic plan
and adoption, overlays, saved queries/checks/mapping proposals, independent clean
comparisons, snapshot transfers, profiling and explorer requests/exports. Transfer
input/output owners are included. Explorer construction and each complete request
are protected; an idle server does not retain a permanent activity record.

Raw snapshot/artifact/proposal methods protect their own I/O. `file()` and raw
SCIP/compiler methods require a caller-owned scope when managed, because returned
paths remain useful after the method finishes. Their promises are tracked too.
`withSnapshotAccess` offers callback-based file consumption. Custom integrations
must declare additional storage roots and finish streams/file use inside their
callback; returning a filename or stream does not extend its lifetime. A custom
hydrator's comparison root is included before workspace/receipt writes.

Extractor and invariant batches settle every started task before propagating
failure, including synchronous adapter throws. Shared protection does not serialize
writers: existing immutable publication and head CAS locks still resolve conflicts.
No snapshot format, fact, citation, authority, semantic key or digest changes.

## Deliberate remaining work

Atomic current/previous head bookkeeping is R3b2b. Reviewed removal and interrupted
owner recovery remain R3b3; no age/PID stealing or deletion command is added here.
Root descriptors do not establish that old clients have upgraded. Parent-wide
inventories and retention reviews remain observational: they can include managed
descendants without holding their complete root set, and cannot authorize deletion.

R4 will implement configurable history-retention targets and indefinite retention.
The proposed 10 GiB target applies to eligible accumulated history, not a necessary
build or graph; protected overages remain visible. Remote archives are later work.

## Qualification

Public regressions cover activation, malformed/overlapping ownership, aliases,
nested roots, waiting cancellation, tracked children, raw producer lifetimes,
real TypeScript indexing and strict hydration, unchanged reuse, independent clean
comparison, saved queries, transfer, profiling and failure preservation. Mocked
process boundaries for producer-lifetime tests do not qualify Docker/SELinux or a
live provider. Exact outcomes belong in [validation](VALIDATION.md).
