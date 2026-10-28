# ADR 029: exact graph neighborhoods

Status: B1a implemented and locally checked; hosted/merge evidence is recorded in the change PR.
Not yet published in a candidate. B1b path exploration remains open.

`impact.scan` discovers relevant evidence with text/file selectors and bounded traversal. Agents
also need a precise follow-up from a returned node ID. Reusing a node ID as a search term can
match another node's label or citation and widen the result unexpectedly.

## Contract

Add `GraphExplorationService.neighbors`, `weftlet graph neighbors` and the read-only MCP tool
`graph.neighbors`. Require an explicit saved `snapshotId` and exact, case-sensitive `nodeId`.
Never resolve a new default/owner head during follow-up. Missing snapshots fail; missing node
IDs return `absent-from-snapshot`, meaning only that no assertion in this saved scope mentions
the ID. This does not prove the code/entity is absent from the repository or deleted.

Direction is incoming, outgoing or both (default). Empty predicate selection means all relations;
nonempty selection is an OR filter using the core predicate vocabulary. Unknown fields/relations,
invalid bounds and unsupported CLI arguments fail. A page defaults to 60 assertions, with a
maximum of 200. Snapshot IDs are bounded to 256 characters, node IDs to 8192 and continuations
to 2048. Exact IDs are operation inputs, not labels, shell commands or SPARQL fragments.

Read the same lossless RDF/SPARQL projection used by impact queries. Do not refresh, validate
the full graph again, call a provider or change any snapshot/artifact. Preserve each GraphFact
byte-for-value, including source and assertion authority, review state, confidence, citations,
document ownership and node attributes. Multiple citations of an edge remain separate facts;
labels and attributes from different assertions are not silently merged into an authoritative node.
Duplicate fact identities fail rather than being dropped during pagination.

## Bounds and continuation

Order by fact ID with locale-independent string comparison. A continuation binds the operation
version, normalized selectors/page size, snapshot manifest and actual projected facts. Reject
changed snapshots, filters, corrupted cursors, invalid offsets and stale versions. The token is
an integrity binding for query consistency, not an authentication or authorization credential.

Report total incident assertions, selected assertions, filtered assertions, page offset and
remaining assertions. Preserve complete assertions even when several share the same endpoints.
Self-links appear once and do not create a new neighbor. `truncated` describes pending pages of
the selected one-hop neighborhood; it never means the transitive product graph is exhausted.

Return a bounded frontier for neighbors on the current page, their supporting returned fact IDs,
and a count of their other incident assertions that do not touch the focus. Those counts ignore
the request's filters to make further branches visible. Also report how many distinct selected
neighbors have not appeared across this and earlier pages; continuation reaches their evidence.
The frontier does not recursively expand those nodes. Call the same operation with a returned
neighbor ID and the same snapshot to inspect another area. B1b owns multi-hop paths and budgets.

Responses reuse impact coverage semantics and the exact same checkout/overlay freshness helper.
Diagnostics match exact focus/returned-neighbor IDs or overlapping returned citations, with the
same per-kind bounds and explicit omitted/legacy counts as impact reports. A missing node can
still have a relevant extraction-gap diagnostic; unknown legacy text is counted, not dumped.
Historical evidence remains readable, excluded working changes remain explicit, and saved
evidence cannot satisfy a current-diff validation gate. Page coverage is not a repository coverage
percentage or proof of behavior. Extraction gaps and partial document scope remain visible.

## Compatibility and validation

This is an additive query API. Extraction, storage, semantic cache identity and existing
`impact.scan` behavior stay unchanged. The core predicate list becomes the shared runtime/type
vocabulary, frozen at runtime; semantic schema ordering and contents stay identical. No new
backend or language support is introduced. Existing snapshots can be explored without rebuilding.

Use focused graph tests for branching/cycles, exact IDs vs duplicate labels, direction/relations,
parallel provenance, self-links, page/frontier completeness and cursor rejection. Use actual
extraction/SCIP/RDF from the public monorepo fixture for cross-service follow-up and real CLI/MCP
transport. Verify dirty checkout/overlay state and provider-unavailable saved reads. Packed-consumer
tests must discover and call the new tool. B1a does not establish autonomous-agent usefulness,
private consumer acceptance, automatic rule-to-function binding or complete path exploration.
