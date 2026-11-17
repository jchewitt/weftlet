# ADR 055: Declared retention reviews before coordinated removal

Status: implemented for review, November 17, 2026. R3a in the
[storage plan](CACHE-RETENTION-PLAN.md). R3b coordination remains outstanding.

## Decision

Add a separate, bounded JSON retention policy with managed profile/repository
bindings, active scopes, explicit previous generations, exact-target released
heads and owner/reason/optional-expiry pins. An empty scaffold protects everything.
Keep this operational policy outside graph configuration so its edits do not
partition semantic caches or authorize model work.

`cache retention plan` builds a read-only review using verified inventory.
`cache retention check` verifies the saved decision payload and re-reads current
inputs; policy, root, limits, file revisions and effective pin states bind the plan
identity. Informational evaluation time is excluded from that stable identity.
Head metadata is hashed from the same bounded read that parses its target.
Inventory revisions include nanosecond modification/change times and link count.
Full JSON checks require a snapshot facts array, while manifest-only inventory
retains its explicitly weaker status.

Candidates are restricted to managed unshared snapshot files and explicitly
released heads. Current/previous/pinned or otherwise head-referenced snapshots
remain protected. A release declaration binds an expected target, and snapshots
list any head-retirement dependencies. Unknown data, semantic artifacts, indexes,
receipts, scratch, links and unsupported ownership remain retained. Expiry affects
only explicitly declared pins, never arbitrary file-age-based scavenging.

## Safety boundary and consequences

This increment provides reviewable data, not an applying collector. Every report
has `canApply: false`. No source, cache object, graph head or artifact is removed
by planning/checking. Init creates only the explicitly selected new policy file.
Missing/conflicting evidence, incomplete inspection or possible lease activity
blocks review readiness. Declared pins do not stand in for an exhaustive search
of external citations; the operator must name exact historical reproduction needs.

R3a does not claim active-reader exclusion or automatic previous-generation
tracking. Those require a shared coordination protocol in R3b across hydration,
query sessions, snapshot transfers, comparison workspaces and collection. Removal
must revalidate under that protocol and respect head dependencies; saved plans
alone cannot authorize it. Dead PIDs or old lock timestamps are insufficient for
recovery. Keep stale-plan checking, crash recovery and actual removal in that
separately testable increment. R4/R5 remain budget enforcement and compact storage.

The policy/plan contracts are versioned; future coordination changes must reject
incompatible plans rather than silently treating R3a reviews as deletion authority.
See the [operator guide](guides/CACHE-RETENTION.md) for commands, precise protections,
inspection limits and recovery-cost uncertainty.
