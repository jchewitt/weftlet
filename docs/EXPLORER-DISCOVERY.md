# Saved-evidence discovery

Development milestone V1 adds `graph.catalog` and `graph.fact` to the CLI, MCP and public
query contract. The existing `visualize` command still exports one bounded impact page;
the new explorer application is a separate increment.

```sh
weftlet graph catalog --snapshot <id> --view intent --max-nodes 24 --json
weftlet graph catalog --snapshot <id> --view all --search 'reservation' --json
weftlet graph fact --snapshot <id> --fact <assertion-id> --json
weftlet graph neighbors --snapshot <id> --node <node-id> --json
```

Catalog discovery examines the whole **saved snapshot**, independently of impact ranking
or its returned page. It defaults to intent concept/document nodes. Search is a literal,
case-insensitive substring of saved node IDs, labels and citation paths. Supported facets
are `intent`, `contracts`, `implementation`, `evidence`, and `all`; they overlap. Stable kind
and exact-ID ordering is navigation order, not a relevance score or approval decision.

Intent includes existing product-intent lane evidence and assertions from sources explicitly
classified as intent. It can therefore expose unreviewed or inferred assertions, with separate
assertion authority, source authority and extraction-review counts. Plans and validation
documents do not become approved intent. Code endpoints are reachable through neighborhoods;
they do not fill the initial intent catalog merely because a document links to them.

Each node entry is a presentation representative, chosen deterministically from its matching
assertions. It names that assertion and its citation. The node does not acquire a universal
approval badge. Exact assertion details retain differing labels/attributes, ownership,
confidence, extractor versions and all code/binding/call evidence.

Results include snapshot commit, content/configuration digests, selected scope and document
coverage, snapshot-wide facet/gap counts, and explicit pagination. Normal application queries
also report checkout changes, staleness and extraction compatibility. These reads cannot
hydrate, call a model, write evidence or satisfy current-diff validation. An empty intent
catalog means no qualifying evidence was found in this snapshot, not that the product has
no rules. Source classification and excluded document coverage still need inspection.

## Index lifetime and compatibility

Discovery, exact neighborhoods and paths share one reusable lossless RDF projection in the
application process. Only one completed snapshot index is retained. Concurrent requests for
the same physical revision share its initial read. Filesystem revisions include file identity,
size and nanosecond modification/change timestamps; replacement, editing and deletion cause
a reload. The load checks the revision again before caching. This detects ordinary external
changes, not adversarial filesystem tampering. An adapter without a revision capability is
read and indexed afresh on every query.

The index freezes copied evidence and binds continuations to the actual projected facts,
manifest and diagnostics, rather than trusting a manifest digest alone. Snapshot/artifact
bytes and semantic cache identities are unchanged. Neighborhood cursors advance to
`exact-neighborhood-v2`; path cursors advance to `simple-evidence-paths-v3`. Restart existing
pagination after upgrading. Path ordering, depth/work limits and exact asserted relationships
remain unchanged. Path search still constructs its search adjacency; this increment does not
claim a fully indexed path engine or an impact-ranking improvement.

Run `pnpm exec tsx scripts/benchmark-explorer-index.ts 20000` for a public synthetic filesystem
load/repeated-query benchmark. It asserts one snapshot read and unchanged persisted bytes;
timings are observations, not CI gates or private-graph/browser acceptance.

## Storage and access are independent

The current backend is filesystem snapshots. Both a local read-only API and a hosted API can
serve this backend; a database is not required to use the interactive explorer. Portable
indexed exports will use the same supported query semantics without a server runtime.

A future database adapter will be an explicit, tested storage choice. Server-side credentials
belong in environment/secrets configuration, never a browser bundle. PostgreSQL metadata and
2.0 review records are separate from choosing a graph query backend. No database driver,
remote upload, authentication/deployment configuration or new storage config key is enabled
by this discovery milestone. See [ADR 044](ADR-044-viewer-query-boundary.md).
