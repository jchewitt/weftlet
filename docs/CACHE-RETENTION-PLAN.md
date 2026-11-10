# Bounded local graph storage

Status: maintainer-supplied consumer handoff dated November 9 Central, received
November 10, 2026. This records an upstream change request, not released settings
or permission to delete a consumer's files. Scheduling is separate from the
[0.10 provider/onboarding work](RELEASE-09-10-PLAN.md); implementation should use
small independently qualified increments.

## Outcome and evidence

Provide a configurable **10 GiB (10,737,418,240 bytes) user-cache-wide budget**
across repositories, checkouts and configuration profiles, with optional repository
sub-budgets. Keep usable current evidence for active scopes, a small rollback
allowance and reusable semantic artifacts. Old full graphs are disposable unless
explicitly pinned or archived. A per-profile 10 GiB allowance does not meet this goal.
The policy/default for other installations must be stated explicitly before rollout.

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

## Bounded tasks

| Task | Deliverable and acceptance |
| --- | --- |
| R1 — Independent temporary clean comparisons | Build and strictly validate independently in an operation-owned snapshot/index workspace, reading validated shared semantic artifacts. On success write a compact receipt binding source SHA, scope/config/tool identities, both digests, check result and timestamp; remove only that workspace. Repeated comparisons must not accumulate permanent graph/index copies or clean heads. Failures/cancellation preserve the normal head and save bounded diagnostics. Full failure payload retention is explicit and budgeted. |
| R2 — Inventory and representation profile | Measure logical/allocated bytes per class, per repository/profile and total. Profile actual public large-graph bytes by section/field, repeated entities/provenance/strings and indexes before choosing a new format. Inventory must distinguish owned, unknown, corrupt, active, pinned and archived data; a prefix read is not an integrity verdict. No deletion in this increment. |
| R3 — Coordination and retention plans | Define active-scope registration, explicit owner/reason/expiry pins, current/previous references and cross-process read/write/GC leases. Produce a dry-run plan with sizes, reasons, references, protection, recovery cost and reclaim estimate; reject stale plans before applying. Legacy heads are not automatically permanent active-scope registrations. Unknown objects remain protected until classified. |
| R4 — Enforced global budget | Account for permanent data and temporary peaks across all profiles, plus repository sub-budgets and a free-disk floor. Preflight, reserve under a lease and enforce growth during writes/index/build output. If required current/pinned data and build space cannot fit, report the minimum and explicit operator choices; preserve current evidence and never narrow source scope or raise model budgets silently. |
| R5 — Compact/deduplicated evidence | Choose format from R2 measurements. Evaluate interned entities/provenance/strings, compressed/chunked/query-oriented records, separate integrity-bound manifests and content-addressed normalized SCIP blobs. Preserve exact logical identity, authority, citations, facts and query equivalence. Similar payloads cannot merge distinct provenance. Include legacy reads and migration/rollback qualification. |
| R6 — Explicit private archive/restore | Optional user-configured NAS/object destination with authenticated/encrypted transfer, checksums, producing config/tool identities, required semantic/index artifacts and receipts. Verify remote bytes and restore before any approved eviction. Keep a local archive index; failures never authorize deletion. Restores remain historical and never substitute for current-commit acceptance. |

R1 can ship separately to stop successful-comparison accumulation. It does not
implement the global cap or authorize sweeping the existing 67 GiB consumer cache.
R2 profiling informs R5; R3 coordination is a prerequisite to destructive pruning
and hard-budget enforcement. Do not collapse all six tasks into one release diff.

## Storage and safety contract

- Current compatible snapshots for actively registered scopes and at most one
  prior known-good generation are budgeted; extra historical graphs require pins.
  Existing pointers need explicit migration/disposition, not silent deletion.
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
- Pins do not silently exceed the cap. Report the pinned/current minimum, precise
  protections and explicit budget/unpin/archive/scope choices. Retention settings
  are operational and must not alter semantic identity or create a new profile.
- Report logical versus allocated/deduplicated bytes, steady use versus build peak,
  selected-document bytes versus indexed-code/output bytes. Estimates alone do
  not constitute a hard cap, especially for subprocess-produced files.
- Git can reconstruct source, but not necessarily identical model artifacts or an
  available old tool/model environment. Exact-evidence archives are opt-in.
- Suggested `cache usage`, `cache prune --dry-run`, `cache pin/unpin` and archive
  commands are proposals. Do not document them as available before implementation.

## Regression matrix

Qualification includes repeated independent strict clean comparisons without
permanent growth; active/current/previous/pinned preservation across old profiles;
global/repository accounting and disk-floor enforcement; build peak reservations;
concurrent readers/writers/GC; stale-plan refusal; cancellation/crash recovery;
failed extraction/validation/publication preserving the last usable graph;
semantic reuse without hidden paid recovery; explicit archive failure/restore
identity; and Windows reparse-point/long-path containment. Missing or archived
historical IDs must report that state, never silently resolve to newer evidence.

For every stage retain exact version/commit, deterministic test scope, byte
accounting and limitations. Consumer acceptance and any private archival trial
remain consumer-owned; no destination or service has been configured upstream.
