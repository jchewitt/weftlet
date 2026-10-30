# ADR 037: Advisory comparison of selected contract constraints

Status: implemented for the next candidate, 2026-10-30. Qualification and live usefulness remain B6.

## Problem and decision

[Explicit obligations](ADR-036-contract-obligation-declarations.md) retain both sides of a queue
or stored-data boundary. A graph connection alone cannot establish that their rules agree.
Add `graph.compatibility`, a read-only comparison of two exact saved assertion IDs, shared by
the public API, CLI and MCP. Discover the IDs through `impact.scan` or `graph.neighbors`.
This is a bounded numeric assessment of declarations, separate from code fulfillment, source
approval, runtime delivery and deterministic architecture policy. It never returns a CI pass/fail.

```sh
weftlet graph compatibility --snapshot <id> --producer-fact <fact-id> --consumer-fact <fact-id> --json
```

MCP fields are `snapshotId`, `producerFactId`, `consumerFactId`. The public
`SnapshotContractCompatibilityService` accepts a snapshot reader and exposes `assess(request)`.
The application wrapper adds current checkout/configuration/overlay evidence state. The raw
service has no checkout knowledge; its `evidenceState` is absent. Neither reads a mutable head,
hydrates, invokes a model/indexer, changes a snapshot, or promotes historical evidence into a
current-diff result. Missing storage/invalid snapshot identity is an error; missing assertions
within a readable snapshot produce `unknown` with any surviving evidence retained.

## Numeric meaning

The two assertions must be a producer `guarantee` and consumer `requirement` on the same exact
repository/scoped/transport/versioned contract. Known matching domain, metric and unit are
required. Missing units or versions are unknown, including two absent versions. No conversion,
name-based equivalence, implicit ownership, elapsed-time model or data transformation is inferred.
Limits are JSON/JavaScript numbers, finite and no larger in magnitude than `MAX_SAFE_INTEGER`;
comparisons use their represented values, without claiming arbitrary decimal precision.

At a shared explicit measurement stage, `at-most`, `at-least` and `equal` define inclusive
half-lines or singleton sets. These are statements about allowed values, not observed values.

| Result | Meaning |
| --- | --- |
| `compatible-constraints` | Producer's allowed set is a subset of the consumer's set at the same stage. |
| `insufficient-guarantee` | Sets overlap, but the producer permits some values the consumer rejects. This is not a contradiction. |
| `disjoint-constraints` | No untransformed value at that same stage satisfies both declarations. This is a documented range incompatibility, not proof of a product violation. |
| `revalidation-required` | Different stages or an overlapping insufficient guarantee, with explicit required consumer revalidation. Inspect the check and rejection behavior; its implementation is not inferred. |
| `unknown` | Missing assertions/context, unrelated contracts, unmatched domains/metrics/units, unsupported numbers, competing declarations or relevant extraction gaps prevent this assessment. |

For example, collection allows readings up to 600 seconds old; execution requires at most 60
seconds and explicitly revalidates. Different measurement stages prevent a direct contradiction
claim. The fixture executes a consumer freshness check separately and retrieves its indexed
implementation/test references; the assessment still says `fulfillment: not-evaluated`. It does
not prove eventual delivery, successful execution or availability when stale records are rejected.
A same-stage producer minimum of 120 seconds versus a consumer maximum of 60 is disjoint,
even if revalidation is required: no *same untransformed accepted value* satisfies both.

## Evidence and bounds

Responses retain at most the two selected facts unchanged, including source/endpoint citations,
commit, digests, statement, approval and review metadata. Assessment authority is inferred,
or draft when a selected fact is draft; `gateEligible` is always false. Shared returned-page
coverage describes only those assertions. The contract and endpoint IDs support further
neighborhood exploration to implementations, tests and other business declarations.

The service uses the lossless RDF fact projection shared by other queries. It scans saved facts
for competing declarations of the same endpoint/role/domain/stage/metric, conservatively choosing
no winner even if duplicate limits agree. At most 20 competing IDs are returned, with total and
omitted counts; exact contract neighborhoods provide cited continuation. There is no all-pairs
Cartesian scan. Projection/context work still scales with the saved graph; this is not an indexed
incremental graph database or a large private-workload performance claim.

Structural validation is restricted to the selected two records on reads, retaining strict
SHACL and obligation identity/provenance checks. Hydration still validates the complete graph
before publication. Relevant intent/ambiguity/implementation gaps block a numeric verdict;
runtime gaps remain visible because runtime fulfillment is never evaluated. This does not claim
all omitted documents are complete. Old snapshots, configuration changes and draft overlays stay
explicit and ineligible for current-diff validation.

This query-only increment leaves assembly 11, the obligation extractor identity, provider,
prompt and semantic cache unchanged. No graph migration or cache invalidation is needed.

## Acceptance and remaining scope

[The public protocol](../evaluations/contract-compatibility/README.md) declares source cases,
expected outcomes and query bounds before execution. Actual committed Markdown extraction,
real SCIP, RDF/SHACL, impact → neighborhood → pair comparison → symbol/test retrieval, strict
authority/provenance negatives, shared API/CLI/MCP, saved dirty queries, repeat cache reuse and
draft rename/delete invalidation are exercised. A finite-set oracle checks all 81 combinations
of the three operators and three boundary values. Fresh packed-consumer smoke checks the public
service, installed MCP discovery and honest unknown/missing-snapshot handling.

This covers explicit structured numeric obligations only. Free-form logical reconciliation,
automated inference/approval, multiple-property satisfiability, formal temporal compatibility,
product-wide guarantees and approval/backfill UI remain outside this increment. Hard gates
still require explicit approved deterministic policy; a model suggestion is not such a policy.
See [validation](VALIDATION.md) and the [remaining queue](1.0-WORK-QUEUE.md).
