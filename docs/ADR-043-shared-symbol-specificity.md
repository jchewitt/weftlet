# ADR 043: shared-symbol specificity in bounded impact retrieval

Status: shipped and retained in 0.8.1; the private two-assertion acceptance passed
on 2026-11-08. See the [consumer receipt](assessments/consumer-pm-0.8.1-2026-11-08.json)
and [validation record](VALIDATION.md).
Extends [ADR 042](ADR-042-indirect-local-relationships.md). Does not change path search.

## Evidence

0.7.3 still misses the private unconfirmed symbol reference and legacy consumer at 180 facts.
The subsequent sanitized chains supply a more specific signal than distance/family alone:
producer → shared indexed symbol ← worker indexed symbol. The shared object has three distinct
production referrers. The preselected median peers instead approach through file-scope symbols.
A reverse reference is not a forward call. This is pairwise evidence, not a universal ranking proof.

The [frozen public comparison](../evaluations/same-group-retrieval/protocol.md) uses actual
SCIP extraction and strict publication. Both exact targets are reached in round two, inside the
same populated distance/predicate groups as competitors. The reference is seventh within its
source/group; the consumer is first. Baseline ranks are 3,074 and 323. A symmetric control gives
all 136 workers the same producer connection; it cannot establish a unique preferred worker.

## Decision

Use `shared-symbol-witnesses-v4` to interleave a structural specificity queue with the unchanged
v3 baseline waves, over the same reachable set. Each previously unreturned baseline assertion
gets one opportunity for an additional specificity selection. Deduplicate by assertion ID and
retain baseline wave boundaries for the existing evidence-lane balancing. With no usable
witnesses, baseline order and scores are exactly unchanged.

Eligible witnesses require saved SCIP named definitions for repository-scoped indexed symbols,
and exact typed reference endpoints in the same snapshot, commit and extractor version. A direct
matched definition supplies the producer origin. File-scope/module anchors, declaration-only or
unindexed targets, local ordinal identities and unknown adapters cannot supply this signal.
Rank shared objects by the number of distinct production indexed referrers in the reachable
query scope. Repeated occurrences, file-scope imports and test referrers do not inflate that
count. Test assertions remain available, including supported references in their existing
validation lane; this does not certify production implementation.

Within equal specificity, balance references and consumers and round-robin cited source files,
using existing focus/distance/stable ties. A later occurrence from a selectively related worker
can receive a turn before hundreds of unrelated local sources. Every assertion remains eligible;
this adds no fact, confidence, authority, approval, call proof or runtime claim.

A legacy file consumer receives corroborating priority only when its saved SCIP native symbol
key/hash matches a supported typed reference in the same cited file, digest, commit, snapshot and
extractor version. Its first citation may be an import before the later method reference. A shared
file/start line alone is insufficient. This projection-specific ordering does **not** assert a
native-to-legacy identity edge or make the file consumer an exact invocation. Unknown projections
retain baseline ordering. There are no consumer names or fixture target IDs in production code.

## Results, limits and compatibility

On the unchanged positive public graph, the reference/consumer move to **141 / 10**, within the
same 3 × 60 slots at depth three. All 6,417 reachable facts and stored bytes remain identical.
Source diversity falls from 63 to 38 files; this is an explicit relevance/diversity tradeoff.
Two of all 136 predeclared reference/consumer pairs are retrieved together; the denominator is
272 assertions, not just the chosen successful targets.

On the symmetric graph, the targets remain outside the budget at **2,892 / 309**. Zero of 136
pairs appear together. Specificity cannot distinguish equal witnesses, nor promise retrieval
of every relevant occurrence in large groups. The two-mode comparison is evidence for a bounded
heuristic, not private acceptance or a completeness guarantee. Degree is query-scope relative,
not a repository-global count or a confidence score.

Continuation tokens identify v4 and reject prior offsets with restart instructions. No extractor,
assembly, semantic-cache, snapshot, persistence, RDF, SHACL or core contract identity changes.
Existing evidence can be queried without hydration or model calls. The 0.7.1 capacity fix and
shortest-first direct paths remain untouched.

The November 8 consumer replay closes that original two-assertion check on 0.8.1:
the exact private reference/consumer rank **125 / 22**, within the unchanged 180
slots, with all 420,837 reachable facts, returned stored objects and fingerprints
preserved. Its order matches the reported 0.7.4 order. These private ranks are
separate from the public 141 / 10 result above. The replay retains stale-evidence
labels and does not add direct-path, MCP-parity, runtime or universal-recall proof.
