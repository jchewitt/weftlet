# ADR 041: useful relationships within bounded retrieval

Status: query-only patch; validation and publication status are recorded in VALIDATION.md.

## Evidence and scope

The maintainer reports successful 0.7.1 hydration, strict validation, persistence/reload and
unchanged repeat on the consumer's 561,777-fact graph, preserving all 18 cached artifacts.
Two subsequent failures concern retrieval: a known direct path was displaced by deep branches,
and specific consumer assertions were displaced by standard-library references.

The consumer independently confirmed that the missing `references` and `consumes` assertions
exist in the same snapshot and are reachable in expansion round two. Their calculated balanced
positions were 24,801 and 69,207, outside three pages of 60 assertions at depth three. The
diagnostic reproduced all 180 original result IDs in order without fetching larger pages or
modifying evidence. This is ranking displacement for those assertions, not missing extraction.
No private source, artifact or prompt was imported into this repository.

## Path order

Replace fact-ID depth-first traversal with breadth-first traversal. Adjacency preparation places
edges closing on the exact target first, then sorts by fact ID. A known direct edge therefore
appears before unrelated branches consume the first page. All distinct simple paths and parallel
assertions remain eligible; no global visited-node pruning is introduced. Completed paths are
ordered by nondecreasing edge count, not business importance or causal confidence.

Retain the existing depth, page, candidate-step and cumulative work limits, including counted
cycle/depth-cut examinations. Graph loading/indexing is still outside the candidate-step budget.
The FIFO queue allocates at most one parent-linked prefix per examined edge, bounded by 100,001
including the root. Return exact pending counts, 32 pending-prefix examples and an explicit
omitted count; retain the existing bounded depth-cut examples. Stateless replay validates page
boundaries. `simple-evidence-paths-v2` rejects old cursors; the shared HTML engine uses the same
search. No full-graph completeness or latency guarantee is added.

## Impact order

Keep the reachable set, extraction, depth semantics and evidence-lane balancing unchanged.
The `local-relationships-diversity-v2` policy revises the existing weighted-distance/source
diversity heuristic:

- A citation-only match seeds local endpoints before unresolved symbol endpoints. Referencing a
  common library symbol in a changed function must not make all its co-users distance-zero peers.
- Edges touching a `CodeSymbol` with `no-indexed-definition` cost at least eight, and assertions
  touching such a symbol receive eight additional ordering points. Explicit node/label/native-symbol
  anchor-text matches exempt that node. Missing definitions are not classified as proven libraries;
  omitted repository code can also be unindexed. All those assertions remain retrievable.
- Allocate early slots within each provenance source to saved local `calls`, their exact cited
  reference proofs, and legacy file-to-symbol consumers matching saved local callable identities.
  Other cross-file references follow before local occurrence detail. Existing product intent,
  queue/data contracts, validation and adapter assertions retain their ordinary category.
- Within these categories use distance, focus and stable semantic tie keys. Add the per-source
  ordinal to the distance score, then retain the existing evidence-lane balancing among equal
  scores. Distant relationships still pay distance; local variable repetition cannot consume
  all of a file's early slots before its consumer relationship is considered.

These are explainable ordering signals, not business rules or authority changes. A file-level
`consumes` relationship still does not establish invocation; a saved static call does not prove
runtime execution. Explicit library-symbol queries remain supported. Pagination retains every
reachable assertion exactly once; old ranking cursors fail with restart instructions.

## Acceptance and compatibility

The frozen [public protocol](../evaluations/relationship-retrieval/protocol.md) uses three actual
TypeScript producer/queue/worker/test flows, real SCIP and call extraction, and deterministic
cited prose. It scores 36 specific calls, callsite references and legacy consumers separately
from 12-file discovery. The budget remains depth three, three pages of 60, all 540 assertions
in the denominator. Compare the same immutable saved snapshot and unchanged reachable counts.
Report standard-library share independently of the production unindexed-symbol heuristic.

Also check a 1,500-branch direct-edge case at 1,000 steps, every directed four-node graph against
an exhaustive path oracle, continuation/replay, incoming/both directions, authority/citation
preservation, shared viewer parity, explicit library queries and strict extraction/publication.

No extractor/assembly identity, semantic cache, persisted encoding, RDF constraints or snapshot
content changes. Existing 0.7.1 snapshots use the new ordering without hydration or model calls.
The 0.7.1 streaming/canonical-hash fixes remain intact. This public regression does not close
private consumer acceptance; TradePilot must retry the original cases with unchanged budgets.
