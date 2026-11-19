# Bounded local graph storage

Status: maintainer-supplied consumer handoff dated November 9 Central, received
November 10, 2026. This records an upstream change request, not released settings
or permission to delete a consumer's files. Scheduling is separate from the
[0.10 provider/onboarding work](RELEASE-09-10-PLAN.md); implementation should use
small independently qualified increments.

## Outcome and evidence

**Maintainer clarification, November 18, 2026:** the proposed 10 GiB value is a
configurable **retention target for accumulated local history**, not a hard limit
on a graph, extraction coverage or a necessary build. This supersedes the original
handoff's hard-cap and write-growth enforcement proposals. Keep the complete usable
current evidence for active scopes, a small rollback allowance and reusable semantic
artifacts. A necessary graph may exceed the target and must remain buildable and
queryable when the filesystem has capacity.

R4 should support a user-cache-wide target across repositories, checkouts and
profiles, optional repository targets, and an explicit **keep indefinitely** mode.
A proposed 10 GiB target is 10,737,418,240 bytes, not a released default. Indefinite
retention disables automatic history eviction; explicit operator removal remains a
separate reviewed action. Temporary operation-owned cleanup still applies, and
indefinite retention is not a backup guarantee.

Report current/previous/pinned/reusable/temporary/historical bytes separately. Only
eligible history can be reclaimed under the selected policy. If protected evidence
alone exceeds a target, retain it, report the overage and its protection reasons,
and offer an explicit target/pin/archive choice. Never reject a necessary graph,
truncate facts, narrow scope or delete current evidence merely to meet this target.
Actual disk exhaustion and an independently configured free-space safety floor
remain operational constraints, distinct from retention policy. Estimates and
transient peak reporting help operators plan capacity; they are not an implicit
10 GiB build quota. The R4a candidate implements the optional standalone `history` policy described in
[ADR 061](ADR-061-configurable-history-selection.md); no default collector is activated.
Recurring maintenance remains R4b work. These options are not in published 0.10.0.

Consumer observations on installed 0.9.0 (not independently measured upstream):

- 100.306 GiB logical cache size, including 346 full snapshots across profiles.
- One scope: 21 semantic documents plus code indexing, 574,407 facts / 178,003 nodes.
  Normal snapshot JSON: 1,118,830,628 bytes; clean copy: 1,130,318,788 bytes.
- Shared semantic artifacts: 8,495,108 bytes, about 8.10 MiB. Legacy semantic
  artifacts also exist and are protected. Document budgets do not bound code graph
  or total disk size.
- Consumer-approved cleanup removed exactly 98 redundant comparison snapshots
  and their 98 SHA-256-identical SCIP counterparts: 35,674,254,403 logical bytes.
  Reported remaining size: 67.081 GiB. All 105 head targets and 814 protected
  head/semantic files survived, with unchanged protected fingerprints. A fresh
  CLI read the retained current graph and returned a one-node intent catalog page.
- Those are bounded consumer cleanup/query checks, not a new hydration, complete
  reference search or strict-validation claim. The private deletion journal stays
  with the consumer. No further cleanup or private cache access is authorized here.

Upstream source inspection at `4ce9a922a6c4b911d661e7e1aa754257ce5b1d58`
confirms the mechanisms: `ContextGraphHydrator.compareClean()` hydrates with a
`clean-${Date.now()}` suffix and a separate `-clean` head, compares digests and
retains that output. `FileSnapshotStore.write()` publishes complete immutable
JSON; `ScipTypeScriptIndexer.index()` keys its artifact by snapshot identity.
`resolveStorageRoot()` partitions by config/checkout without user-wide retention.
`runtimeEvidencePolicy.retentionDays` governs evidence eligibility, not disk GC.

## R1 implementation update — November 17, 2026

Implemented for review in [ADR 053](ADR-053-temporary-clean-comparison.md): isolated
independent builds, read-only validated semantic reuse, compact success/failure
receipts and operation-owned cleanup. Repeated successful comparisons no longer
retain full graph/index/compiler copies or clean heads. Hard-kill recovery and
cross-process GC remain R3; the candidate does not delete old output or implement
the global budget. R2 follows below.

## R2 implementation update — November 17, 2026

Implemented for review in [ADR 054](ADR-054-cache-inventory-profile.md): read-only
`cache usage` across roots/profiles and streamed `cache profile` byte attribution.
See the [guide](guides/CACHE-INSPECTION.md) and [public measurements](assessments/storage-profile-r2.md).
Metadata-only previews, full JSON/byte checks, unknown allocation and unsupported
pin/archive/active-scope states are explicitly distinguished. R3 will define those
coordination/ownership states before they can authorize any deletion. R2 does not
implement a budget, change semantic identity or prune historical consumer files.

## R3a implementation update — November 17, 2026

The non-destructive declaration/review portion is implemented for review in
[ADR 055](ADR-055-declared-retention-reviews.md): separate policy scaffolding,
current/previous/pin protections, explicit exact-target head retirement, per-object
reasons/dependencies/recovery notes, and stale decision-plan checking. See the
[guide](guides/CACHE-RETENTION.md). All reports have `canApply: false`.

R3 is not complete: **R3b** must integrate reader/writer/GC leases, active-scope
registration, transactional current/previous tracking and crash recovery before
applying a reviewed plan. R3a's manual previous declaration and observational scan
are not substitutes for those contracts. Existing cache files remain untouched.

## R3b1 implementation update — November 17, 2026 (Central)

[ADR 056](ADR-056-cache-coordination.md) adds the internal operation-scoped
coordination foundation: concurrent shared activity, exclusive maintenance after
draining participants, bounded/cancellable waiting, owned-marker cleanup and a
scoped snapshot facade. Interrupted owners remain visible blockers. Independent
process tests exercise these boundaries; no collector or automatic recovery exists.

Complete R3b through independently reviewed increments:

- **R3b2a — Lifecycle adoption (merged PR 103):** [ADR 057](ADR-057-managed-cache-lifecycles.md)
  binds explicit managed roots and complete hydration/query/comparison/delivery,
  shared-artifact and viewer operations. Ordered admission, tracked children and
  a quiesced legacy-client migration preserve unmarked-cache compatibility.
- **R3b2b — Current/previous references (merged PR 104):** [ADR 058](ADR-058-atomic-head-generations.md)
  atomically publishes both pointers under existing head CAS locks, preserves
  previous on unchanged publication, and adds inventory/retention protection for
  both references. Concurrent publication and failure recovery are qualified with
  public regressions. No removal yet.
- **R3b3a — Reviewed removal (merged PR 105):** [ADR 059](ADR-059-coordinated-retention-removal.md)
  adds exclusively coordinated preparation and exact-plan application, head-first
  removal and synced per-file journals. Observational R3a plans remain ineligible.
- **R3b3b — Explicit recovery (merged PR 106):** [ADR 060](ADR-060-explicit-cache-recovery.md)
  adds exact-state offline review/application for supported interrupted owner/journal
  records. Quiescence, preserved control archives, live-owner vetoes and head/candidate
  reconciliation prevent automatic replay. Malformed/unknown records remain blockers;
  see the [recovery guide](guides/CACHE-RECOVERY.md).


Lifecycle activation does not enable collection. Parent-wide inventory and
retention reports remain observational until R3b3. R4 retention policy and R5
compact storage follow these safety boundaries; necessary graph/build size is
not capped by the proposed history-retention target.

## R4a implementation update — November 19, 2026

[ADR 061](ADR-061-configurable-history-selection.md) adds optional root-wide/repository
logical-byte targets and indefinite retention to the separate retention policy. Canonical
eligibility still protects current/previous/pins, unknown data, indexes and reusable artifacts.
Oldest eligible history and necessary released-head prerequisites are selected only as needed;
protected overages are reported without blocking necessary graphs. Existing oversized caches
are covered by public migration tests. See the [guide](guides/CACHE-HISTORY.md).

This slice uses explicit coordinated prepare/apply, with journal-free no-ops. It does not
start automatic collection on update/hydration. R4b will qualify opt-in recurring maintenance
and adoption ergonomics, including the exact-retirement-declaration boundary. One exact
managed root spanning user-cache profiles supports a shared target; independently activated
roots do not silently become one coordinated budget. R5 compact representation is separate.

## Bounded tasks

| Task | Deliverable and acceptance |
| --- | --- |
| R1 — Independent temporary clean comparisons | Build and strictly validate independently in an operation-owned snapshot/index workspace, reading validated shared semantic artifacts. On success write a compact receipt binding source SHA, scope/config/tool identities, both digests, check result and timestamp; remove only that workspace. Repeated comparisons must not accumulate permanent graph/index copies or clean heads. Failures/cancellation preserve the normal head and save bounded diagnostics. Full failure payload retention is explicit and budgeted. |
| R2 — Inventory and representation profile | Measure logical/allocated bytes per class, per repository/profile and total. Profile actual public large-graph bytes by section/field, repeated entities/provenance/strings and indexes before choosing a new format. Inventory must distinguish owned, unknown, corrupt, active, pinned and archived data; a prefix read is not an integrity verdict. No deletion in this increment. |
| R3 — Coordination and retention plans | Define active-scope registration, explicit owner/reason/expiry pins, current/previous references and cross-process read/write/GC leases. Produce a dry-run plan with sizes, reasons, references, protection, recovery cost and reclaim estimate; reject stale plans before applying. Legacy heads are not automatically permanent active-scope registrations. Unknown objects remain protected until classified. |
| R4 — Configurable history retention | Account across profiles with optional repository targets and explicit indefinite retention. Reclaim only eligible unpinned history under coordinated policy, preserve current/previous/pinned evidence and reusable artifacts, and report protected overages without blocking a necessary graph or narrowing coverage. Report temporary peaks and real disk capacity separately; retention settings do not change extraction identity. |
| R5 — Compact/deduplicated evidence | Choose format from R2 measurements. Evaluate interned entities/provenance/strings, compressed/chunked/query-oriented records, separate integrity-bound manifests and content-addressed normalized SCIP blobs. Preserve exact logical identity, authority, citations, facts and query equivalence. Similar payloads cannot merge distinct provenance. Include legacy reads and migration/rollback qualification. |
| R6 — Explicit private archive/restore | Optional user-configured NAS/object destination with authenticated/encrypted transfer, checksums, producing config/tool identities, required semantic/index artifacts and receipts. Verify remote bytes and restore before any approved eviction. Keep a local archive index; failures never authorize deletion. Restores remain historical and never substitute for current-commit acceptance. |

R1 can ship separately to stop successful-comparison accumulation. It does not
implement the retention target or authorize sweeping the existing 67 GiB consumer cache.
R2 profiling informs R5; R3 coordination is a prerequisite to destructive pruning
and retention-policy application. Do not collapse all six tasks into one release diff.

## Storage and safety contract

- Preserve current compatible snapshots for actively registered scopes and the
  selected prior known-good generation. Pins protect additional historical graphs
  when automatic retention is enabled; indefinite retention keeps history without
  requiring a pin for every generation. Existing pointers need explicit
  migration/disposition, not silent deletion.
- Semantic artifacts are a separate cheap reusable store. Preserve valid retained
  graph references and a bounded cold reuse allowance; recovery cost must expose
  which evictions could require model work. Pruning never invokes a model.
- Reuse byte-identical normalized SCIP blobs only with complete identity/integrity
  and live-reference accounting. Index rebuilds need exact sources/tools, not a model.
- Keep compact receipts, manifests and cited bounded context independently from
  large graph payloads. An inventory listing every ID is not a permanent pin.
- Leases, not file age alone, distinguish active work from abandoned scratch.
  Account for concurrent work, crash grace periods and publication ordering so
  readers cannot observe deleted live objects, dangling heads or partial graphs.
- Current/previous/pinned evidence may exceed a retention target. Report the
  protected minimum and precise reasons, then offer explicit target/unpin/archive
  choices. Never silently evict it or require reduced graph coverage to meet the
  target. Indefinite retention must not trigger automatic historical eviction.
  Retention settings are operational and must not alter semantic identity or
  create a new profile.
- Report logical versus allocated/deduplicated bytes, steady use versus build peak,
  selected-document bytes versus indexed-code/output bytes. Estimates alone do not
  predict exact peak usage, especially for subprocess-produced files. Retention
  policy is not a per-operation write quota.
- Git can reconstruct source, but not necessarily identical model artifacts or an
  available old tool/model environment. Exact-evidence archives are opt-in.
- `cache usage` and `cache profile` are implemented R2 candidate commands.
  `cache prune --dry-run`, `cache pin/unpin` and archive commands remain proposals.
  Do not document these future commands as available before implementation.

## Existing-cache upgrades

R4 acceptance must include a project adopting the update with history already above
its configured target. The target applies to eligible existing history as well as future
accumulation; it is not merely a limit on newly created snapshots.

First explicitly adopt the cache under coordination, stop older clients, identify its
profiles/active scopes and declare additional historical pins. Produce a complete usage
and migration preview; old head pointers and unknown files are not silently disposable.
Once declarations and policy are reviewed, reconcile eligible superseded history toward
the configured user-wide target (plus optional repository targets). Lowering a target
later must follow the same rules. The exact configuration and automatic invocation points
remain R4 work; merely upgrading the package must not initiate an unexplained sweep.

Test over-target migration, repeat idempotence, stale plans/concurrent publishers, multiple
profiles, protected overage, unknown/legacy objects and an explicit indefinite-retention
mode. Preserve the current and tracked previous graphs, pins and reusable semantic artifacts.
If those protected bytes exceed the target, report the excess and reasons while keeping the
necessary graph usable. Never truncate coverage, silently remove pins, force a model call,
or reject a required graph merely to meet the history target. Necessary build space and
actual disk exhaustion remain separate operational concerns.

## Long-term history and backup guidance

Indefinite local retention can consume the available disk and does not protect
against disk loss. For historical evidence that must be recoverable, use an
explicit private backup/archive destination with access controls and encryption.
Preserve exact snapshot bytes, source/config/tool identities, checksums, required
semantic artifacts and indexes, and validation receipts. Verify a restore before
any separately approved local eviction. Git restores source, but cannot guarantee
identical historical model outputs. Restored evidence remains historical.

The existing S6 export/import is a verified snapshot-transfer mechanism, not an
automated backup service or a promise of complete semantic-artifact coverage.
Follow its manifest and explicit artifact-selection limits. R6 archive/restore
and the 2.0 remote/database storage work can supply managed long-term retention
later; a remote query backend alone is not a backup or an archival durability
contract. No cloud destination, upload or archival automation is enabled here.

## Regression matrix

Qualification includes repeated independent strict clean comparisons without
permanent growth; active/current/previous/pinned preservation across old profiles;
global/repository retention accounting; configurable/indefinite retention;
complete graphs larger than the target; protected-overage reports and separate
real-disk capacity failures;
concurrent readers/writers/GC; stale-plan refusal; cancellation/crash recovery;
failed extraction/validation/publication preserving the last usable graph;
semantic reuse without hidden paid recovery; explicit archive failure/restore
identity; and Windows reparse-point/long-path containment. Missing or archived
historical IDs must report that state, never silently resolve to newer evidence.

For every stage retain exact version/commit, deterministic test scope, byte
accounting and limitations. Consumer acceptance and any private archival trial
remain consumer-owned; no destination or service has been configured upstream.
