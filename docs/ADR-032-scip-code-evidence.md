# ADR 032: Preserve native SCIP symbols and occurrences

Status: accepted for B3a's first increment. Explicit document-to-symbol bindings and static
call analysis remain separate work. This implements the projection decision in ADR 031;
Graphify does not become a runtime dependency.

## Evidence model

`@weftlet/core` exposes `CodeSymbol`, its descriptor, `CodeOccurrence`, `CodeRange` and the
`codeSymbolNode` factory. The neutral package adds no dependencies. Global symbol IDs hash
provider, repository identity and the native SCIP symbol. Native `local N` IDs additionally
include the document path and normalized SCIP index digest: native local ordinals cannot be
trusted across index revisions. Labels and resolution status are evidence, not ID inputs.
Renames, package-version changes and tool-native symbol changes can change global IDs; this
is not automatic identity continuity across refactors.

The toolkit retains every distinct native definition/reference occurrence. Definitions connect
`CodeSymbol —definedBy→ physical file`. References connect the narrowest unambiguous native
declaration range's symbol to the target; without such a range, the subject is the cited file
and enclosure is `file` or `ambiguous`. Multiple spans, overload signatures, recursive references,
private/local symbols and repeated same-line uses remain separate assertions. Exact duplicate
native entries deduplicate. Existing file-to-Contract relationships remain for compatibility.
This is additive evidence, not a claim that the two node types are interchangeable.

Citations carry one-based UTF-16 start/end columns with an exclusive end, committed source digest
and SHA. A leading UTF-8 BOM stripped by TypeScript is mapped back into committed first-line
columns. Source files are read as UTF-8; UTF-16 here describes column units, not file encoding.
Native declaration/body ranges are retained separately; arrow initializer extents may
exclude the variable name. A zero-width module anchor can precede
its declaration extent; `locationKind: zero-width-anchor` distinguishes it from an actual name.
Invalid source ranges fail extraction. Test files retain canonical Evidence identity; static
inspection is `implemented`/`deterministic`, not proof of a passed test. Overlays are `draft`.

Resolution is `indexed-definition`, `declaration-only` or `no-indexed-definition`. The latter
includes external or unselected implementations; it does not assert that the target is missing
from the product. Enclosure is lexical, not execution: SCIP 0.4.0 supplies no declaration extent
for some local arrow variables, so a nested reference may be attributed to the enclosing outer
range. Neither a function kind nor a call is inferred from hover text or symbol spelling.

## Shared queries, validation and limits

The complete typed JSON facts and queryable RDF properties use the same snapshot. SHACL checks
code metadata, scopes, resolution, predicate/role/enclosure structure and column completeness;
deterministic consistency checks verify role flags, canonical cited files, range ordering and
zero-width anchor consistency. Existing kind cardinality and intent authority constraints remain intact.
The optimized union and original named-dataset paths agree on new shape failures.

`graph.neighbors` and `graph.paths` expose exact symbols, spans and bounded continuation through
the existing API/CLI/MCP. The viewer and Markdown show columns and static-evidence labels.
Automatic `impact.scan` leaves unresolved code targets terminal, so shared built-ins do not
create a false impact path between co-users. It reports `codeTraversalVersion: indexed-symbols-v1`
and `unexpandedCodeTargetCount`, with at most 100 `unexpandedCodeTargets` example IDs and an
explicit truncation flag; exact neighborhood/path exploration remains available. Continuation
identity includes this traversal policy. Shared unresolved import behavior is otherwise unchanged.

Occurrence retention increases graph size and can require more query pages. The existing
100,000-fact projection ceiling still fails explicitly rather than truncating; this is not
qualification for arbitrary monorepos. Indexing remains full, not incremental SCIP or incremental
SHACL. B5/B6 must assess project coverage, volume and useful bounded retrieval on the candidate.

## Compatibility and validation

`scip-symbol-extractor` advances from 1.1.0 to 2.0.0 and graph assembly from 7 to 8. Existing saved
snapshots remain readable, but freshness checks require refresh for current validation. Semantic
extractor/cache identity is unchanged. Protocol loading, symbol projection and range handling are
separate modules behind the retained `static.ts` exports; runtime assets are checked in packed installs.

Tests use actual committed public source, real SCIP, hydration, strict RDF/SHACL, SPARQL projection,
agent-facade pagination and paths, unchanged repeat, dirty saved querying and draft rename/delete.
The 3,000-line fixture uses explicit comment padding around meaningful functions; it is a location
and isolation regression, not a production-size performance claim. Unit negatives cover malformed
ranges, ambiguous scopes, missing targets, native local identity and invalid metadata. The prior
frozen comparison and scores are unchanged. See VALIDATION.md for executed gates.
