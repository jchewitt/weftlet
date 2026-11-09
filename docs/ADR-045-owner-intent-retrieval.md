# ADR 045: intent evidence coverage and exact-owner retrieval

Status: shipped in 0.8.1. The original missing-intent consumer query passed on
2026-11-06 Central; see the [sanitized acceptance record](OWNER-INTENT-081-ACCEPTANCE.md).
Broader task/semantic/current-diff acceptance remains separate.

## Problem

The [owner-intent investigation](OWNER-INTENT-RETRIEVAL.md) records two public
failures and the consumer's distinct same-snapshot absence report. A primary
display category is an inadequate intent coverage metric: an owner-sourced rule
can be a contract or code mapping too. Separately, balancing display categories
only within an ordering wave cannot rescue owner evidence queued behind many
other facts. Generated document containment alone is insufficient semantic recall.

## Reporting

Use one `isProductIntentEvidence` predicate for nonexclusive page coverage and
the overlapping catalog facet. Eligible evidence has explicit declared claim
authority or declared source authority, with absent/intent source role. Explicit
plan, reference, unclassified and validation roles, validation evidence, and
runtime evidence are excluded. Unknown approval remains unknown. This handles
legacy snapshots without `sourceRole` without rewriting them.

Keep existing primary display categories. Count eligible owner-source contracts
in both intent and contract coverage; include them in the Markdown intent section
and the intent catalog. Coverage describes returned evidence, not approved claims,
truth, a percentage, or task completeness. Source approval, assertion authority,
review state and citations remain exact saved values. Approved-source model
assertions remain inferred/unreviewed.

## Ordering

Only an explicit `ownerDocument` activates priority. Match its cited repository
path exactly, preserving case and normalizing slash direction and a leading `./`.
Do not resolve host roots or `..`, match filename prefixes, or substitute labels
or ownership metadata for the citation. Normalized exact citations also seed
impact traversal, so Windows-style owner separators do not lose the anchor.

After existing ranking and category balancing, reserve **at most four leading
positions** for eligible exact-owner evidence. First select assertions excluding
the built-in `document-linker` and `document-evidence-extractor` records. Rotate
among conceptual intent, contracts/invariants and implementation mappings,
retaining baseline task/checklist-sensitive ordering within each group. If fewer
than four assertions exist, generated document links may fill remaining positions.
Unknown/custom extractors are not claimed to be model providers; the distinction
is explicitly assertions versus these known generated-link extractors.

Every remaining fact keeps its prior relative order, with no duplicates or
pruning. Page size, traversal depth and reachable membership are unchanged for
canonical owner paths. Queries without an owner retain their baseline ordering.
At 60 facts this moves at most four positions to owner context, leaving at least
56 positions for the baseline. Smaller pages share the same global ordering.
No policy can guarantee all owner rules or indistinguishable downstream targets
within a fixed page; this policy supplies a bounded owner overview.

`exploration.ownerIntent` reports cited/eligible/assertion counts in the reachable
set, returned eligible/assertion counts, and the up-to-four priority IDs. Counts
use the same nonexclusive intent predicate; they are not the former primary-lane
counts. Zero assertions with positive intent evidence exposes link-only context.
These are query explanations, not new graph facts or approval records.

## Compatibility and validation

Impact ordering becomes `owner-intent-priority-v5`; catalog facets become
`snapshot-catalog-v2`. Old continuations require a restart. Neighbor/path fact
membership and ordering, extraction/semantic cache identities, snapshot schema
and stored bytes are unchanged. Portable reports derive the same coverage and
catalog from the shared predicates; already exported bundles remain frozen.

Tests require exact semantic assertion retrieval, not merely a larger coverage
counter. Public fixtures exercise an owner plus eight changed files, same-source
competition, 65 generated links alongside semantic assertions, legacy and explicit
roles, negative authority/role cases, small pages, continuation exhaustion,
determinism and immutable-byte preservation. Existing real SCIP caller/worker,
indirect-consumer, symmetric-evidence and implementation-coverage checks retain
their original budgets and denominators. Fresh packed-consumer and browser checks
qualify the same application code. No private hydration or paid provider run is
part of this patch. The original reported consumer query subsequently passed at
the same budget with unchanged saved evidence. Its acceptance record distinguishes
retrieval from coverage-accounting changes and does not extend the result to
universal task relevance, full recall or the separate indirect-worker ticket.
