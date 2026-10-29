# ADR 030: bounded cited dependency paths

Status: B1b implemented for the next candidate. Hosted validation and merge identity are recorded
in the change PR; this entry does not announce npm publication or private consumer acceptance.

## Meaning and scope

`GraphPathQueryService.paths`, `weftlet graph paths` and MCP `graph.paths` take an explicit saved
snapshot ID and exact `fromNodeId`/`toNodeId`. They enumerate simple paths of cited assertions:
no node repeats, a target ends a path, parallel assertions produce distinct alternatives, and
self-links do not create cycles. Equal endpoints that occur in the saved graph yield one
zero-length identity path with no supporting assertion, even if a relation filter excludes all
their edges. An absent endpoint never establishes a path or absence from the actual product.

Outgoing (default), incoming and both directions refer to assertion subject/object order.
Following incoming or undirected evidence does not reverse or rewrite the original assertion.
An empty predicate list selects all relations; a nonempty list is an OR filter. Paths establish
cited associations, not causality, compatible business obligations or behavior verification.
They preserve authority, review state, source citations and node variants on every returned fact.

Read the same lossless RDF/SPARQL projection as other queries. Preserve its existing explicit
100,000-fact projection ceiling; exceeding it fails rather than truncating silently. No model,
indexer, SHACL rerun or graph write is involved. Duplicate fact IDs and mismatched stored snapshot
IDs fail. Responses reuse coverage, scoped diagnostic and checkout/overlay-state helpers.
Coverage describes the page's supporting evidence, not a repository completion percentage;
historical/draft evidence cannot validate the current diff. Document selection omissions remain
in snapshot metadata. An exhausted search says nothing about excluded or unextracted dependencies.

## Enumeration, work and continuation

Use deterministic depth-first traversal with adjacency sorted by assertion ID, independent of
locale. This is not a shortest-path or importance ranking: alternatives reached later can be
shorter or more relevant. Do not interpret the first path as the preferred design.

Defaults are depth 8 (maximum 32), five paths per page (maximum 20) and 1,000 new candidate-edge
examinations per page (maximum 10,000). Every considered edge counts, including cycles and depth
cuts. A search has a hard total ceiling of 100,000 examinations across continuations. Graph
loading, RDF projection and adjacency preparation are separate work, not included in that
candidate count. Adjacency sorts are O(E log E); the existing RDF projection also orders facts.
There is no wall-clock latency guarantee.

Continuations bind the operation version, normalized selectors and page budgets, saved manifest,
actual facts and diagnostics. A cursor carries only a step offset, never an external stack or
assertions. Bounded replay reconstructs state and verifies the offset is a valid page boundary.
Responses report replayed and new steps separately. Replay is at most the total ceiling; a DFS
stack is at most depth + 1. This trades bounded repeated CPU work for stateless continuation
without snapshot/cache writes or a large serialized queue. Tokens provide query consistency,
not authentication. Changing selectors, depth, budgets or saved evidence requires restarting.
Cumulative cost over many tiny pages can exceed one search's ceiling because replay is repeated;
clients should normally retain the default work budget.

The page includes only its completed paths and the union of their unchanged supporting facts.
Work-limited pages may be empty and still have a continuation. Returned path count is not a
count of all possible paths. A continuation can lead to a final empty page after dead ends/cycles.

Report every active DFS prefix with its fact-ID prefix, next candidate fact ID and remaining
adjacency-candidate count. These are not counts of valid paths. Depth cuts retain a total count,
up to 20 concrete extension examples and an explicit omitted-example count. Frontier IDs refer
to saved assertions; use `graph.neighbors` at that node/snapshot to retrieve their full citations.

`truncated` is true if pending work or any depth cut remains. A page/path limit supplies a
continuation. Exhausting the search within the requested depth can still have `truncated: true`
and no continuation: increase depth and restart, or explore a frontier node separately. Reaching
the total work ceiling likewise retains frontier and says `search-limit`, without continuation;
narrow relations or choose an intermediate node. None of these states silently reports no impact.

## Viewer parity and compatibility

The offline HTML viewer embeds the same dependency-free search function used by the service.
It searches only the displayed Context Pack and selected authority/relation layers; it cannot
fetch the full snapshot or turn a filtered page into complete repository evidence. Its first/next
path controls use one result per page, 1,000 new examinations, selectable direction/relation/depth
and the same total ceiling. Changing selection resets continuation. Targets show exact IDs next
to labels. Each highlighted edge is an unchanged fact from that displayed pack.

The prior viewer-only shortest-path implementation is replaced by shared deterministic
enumeration; labels now say "cited path" rather than promising a shortest route. `impact.scan`
and `graph.neighbors` remain unchanged. No extraction identity, semantic artifact/cache key,
snapshot format, dependency, rule policy or language support changes.

## Validation boundary

Compare against an independent oracle on every directed four-node graph; test parallel
assertions, cycles, self-links, competing branches, deep paths, relation/direction filters,
empty work pages, truncated depth, bounded frontier examples and the cumulative ceiling.
Reject malformed/stale/non-boundary continuations. Compare supporting facts with RDF queries
and preserve snapshots with deleted or excluded endpoints.

Exercise actual public prose extraction, SCIP and RDF/SHACL across services through CLI/MCP,
including unavailable providers/indexers, dirty checkouts and captured/stale overlays. Verify
fresh installed CLI/MCP assets and continuation. Execute rendered viewer controls in a small
DOM test harness and compare every highlighted path with the RDF service; this is script and
projection parity, not interactive browser rendering or autonomous-agent usefulness evidence.

B1a/B1b mechanisms are implemented; qualification and live product usefulness remain B6. B2's
Graphify/SCIP comparison is next. No backend replacement or business compatibility inference
is implied by paths through the existing evidence graph.
