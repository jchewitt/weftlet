# ADR 034: Remaining business-to-symbol mapping gaps

Status: B3b deterministic assessment complete, 2026-10-29. A bounded inference proposal is
justified for review; no model quality result or inference implementation is claimed.

## Evidence

The [public study](../evaluations/mapping-gaps/README.md) froze ten cases and source hashes in
`01f7cb6` before measurement. [The recorded run](../evaluations/mapping-gaps/results/2026-10-29.json)
used clean evaluator commit `e3a3d375733121c1c9a3006ce17a5b765dbafc8d`, real SCIP and ordinary
hydration/publication through strict RDF/SHACL. Its offline prose grammar recognizes only the
inventoried rule/workflow and file-claim sentences; it does not evaluate language-model quality.

All ten observed classifications match the predeclared states. The graph has 111 facts.
Cold hydration extracted eight documents in 849 ms; the repeat extracted zero, reused eight
and retained snapshot identity/content digest in 841 ms. These tiny-fixture timings are not a
monorepo performance claim. Exact neighborhoods returned every direct binding within budget,
with no forbidden misleading-name mappings. Structural paths were intentionally bounded;
seven searches report truncation, one exhausts with an absent rule and two are skipped for
ambiguous or unindexed targets. No completeness claim is made for truncated paths.

| Observed case | Count | Meaning / appropriate response |
| --- | ---: | --- |
| Explicit implementation binding | 1 | Rule points to the declared indexed function, with both source proofs. Still a declaration, not proof of compliance. |
| Explicit test binding | 1 | Rule points to a test function. No test execution is claimed. |
| Declaration-only binding | 1 | Declaration resolves; the implementation body is absent. Index the implementation before claiming coverage. |
| File-only claims | 2 | A file association survives. Neither a misleading matching name nor ordinary prose supplies an exact selector. |
| Document-symbol reference only | 1 | Two rules share a document; proximity does not assign either rule to either function. |
| Unresolved selectors | 3 | Ambiguous name, excluded source and stale selector remain cited gaps. Qualify, index or repair the source respectively. |
| Missing intent | 1 | Code exists without an owner rule. Owner intent must be supplied; the evaluator cannot approve inferred business policy. |

The file-only and co-located cases can have structural paths to the desired symbol. Those
paths are not equivalent to an `implementedBy` assertion. This distinction prevents graph
reachability or returned implementation counts from overstating semantic mapping coverage.
All explicit bindings remain inferred/unreviewed assertions with declared source authority and
retained subject evidence. Neither source approval nor syntax upgrades their review state.

## Decision and next boundary

Keep explicit bindings as the deterministic path. Do not automatically add mapping edges based
on name similarity, document co-location or shortest paths. Three cases justify evaluating an
optional proposal pass: the two file claims and the shared-document reference. Repair missing
evidence/configuration before invoking a model for the other gaps.

A separate, opt-in proposal experiment should:

- Limit candidates to existing cited business IDs and current indexed code definitions in an
  explicit repository/domain scope. Preserve document and code revisions, spans and digests.
- Run coverage checks first; distinguish ambiguous, stale, excluded, external/declaration-only
  and missing-intent cases. Permit abstention; never synthesize approved intent.
- Emit a separate inferred, unreviewed mapping proposal with rationale and supporting evidence.
  A proposal is neither an approved mapping nor proof that code satisfies the rule.
- Use a distinct extraction/cache identity, bounded candidates/output/cost, cancellation and
  privacy-safe progress. Retain unchanged artifacts without allowing stale code evidence.
- Predeclare positive and misleading-name/cross-domain negatives before a live evaluation.
  Report precision, misses, abstentions, citation validity, retrieval usefulness and cost
  separately. Compare against explicit bindings and file-level context; require evidence that
  the additional pass improves agent decisions.

This is a proposal specification, not authorization for paid runs or automatic promotion. The
B3b inference implementation/evaluation or a scoped deferral remains a maintainer decision
before 1.0 qualification. Continue the already requested B3c static-call work independently.
Bulk intent generation, document backfill, approval UI and hosted AI remain in the 2.0 plan.

## CI reliability follow-up

PR #58's successful retry and main checks resolved its immediate failed run. Older Windows
runs also hit the 30-second frozen-study test limit and worker-update timeout. The verifier now
reads selected immutable Git blobs in one length-framed batch instead of launching Git once
per file. Test fixture inputs are cached only where immutable; each disposable repository's
dirty-content/CRLF checks still read fresh bytes. Yielding between synchronous cases lets worker
updates flush. Binary/CRLF/empty blobs and malformed frames are covered. The original timeout,
negative assertions, frozen B2 labels and Git-content safety checks are retained.
