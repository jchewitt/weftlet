# ADR 061: Configurable history targets on canonical retention decisions

Status: candidate, November 19, 2026. R4a follows merged recovery PR 106 and
[ADR 060](ADR-060-explicit-cache-recovery.md).

## Decision

Extend the standalone retention policy with optional `history`: a root-wide logical-byte
target with per-repository target/indefinite overrides, or global indefinite retention.
Keep policy outside extraction configuration and preserve existing manual-review behavior
when the field is absent. CLI init accepts an explicit target or indefinite choice.
No default collection is activated by upgrading, installing, querying or hydrating.

Canonical ownership/reference eligibility is evaluated first. History selection can only
reduce that eligible set. Current/previous generations, active pins, retained/unknown heads,
shared files, semantic artifacts, indexes and unknown data remain protected. Indefinite
repository overrides protect history even when the root target is exceeded. Global
indefinite disallows competing repository targets.

Apply repository targets first, then the root target, with oldest filesystem modification
time/path ordering. A selected snapshot brings only its required released-head prerequisites;
count each head once. Do not select an otherwise releasable head merely to save a few bytes.
Mtime is a deterministic operational heuristic, not evidence age, usage or authority.

Report all logical bytes, including undeclared/unattributed content and persistent root
control records. Longest contained declared-profile attribution handles unknown files and
nested profiles without granting deletion eligibility. Transient admission/participant
markers are excluded from target accounting; new journal overhead is not predicted. One
root spanning the user cache provides a shared cross-profile target, not independent quotas
per config hash. Independent/nested coordinated-root migration is not inferred.

Protected overage is a reportable valid outcome, not a build quota or reason to weaken graph
coverage. `status: complete` describes execution of the reviewed actions, not satisfaction
of a byte target. Empty application returns null journal/operation identities and writes no
permanent empty journal. Manual mode's informational byte summary omits controls so ordinary
zero-deletion failure/retry preserves its existing identity contract. Configured mode binds
persistent control-byte observations and requires a fresh plan if those change.

Use the existing exclusive prepare/apply boundary, root/plan/policy revalidation, head-first
execution and durable journal/recovery semantics. Advance planner versions so old prepared
plans cannot silently gain new selection behavior. Snapshot/extractor/semantic identities
are unchanged. Reject reserved coordination path segments in profile declarations.

## Bounded rollout and evidence

R4a is explicit policy-driven preparation/application, including already-oversized caches.
Initial adoption still requires explicit active scopes/pins and reviewed retirement of old
heads. After confirmed head removal, update only that retirement declaration before repeating.
R4b will address opt-in recurring maintenance and migration ergonomics under these same safety
boundaries; it must not pretend that current exact retirement declarations are automatically
idempotent. R5 representation work is separate. No private consumer cache is touched here.

Tests cover cross-profile/root/repository selection, nested attribution, shared prerequisites,
indefinite protection/no-op stability, current graphs exceeding targets, old-cache migration,
legacy/unknown/shared protection, stale policies/heads/mtimes/pins, strict configuration, CLI
setup and packed installation. Deterministic inventory/removal qualification does not claim a
new model run, strict graph validation or physical allocated-byte recovery.
