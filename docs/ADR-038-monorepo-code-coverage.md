# ADR 038: Saved source selection and monorepo coverage

Status: implemented for the next candidate, 2026-10-30. Live consumer acceptance remains B6.

## Problem and decision

Returned-page relationship counts cannot tell an agent whether a service was omitted from
indexing. Preserve those existing counts and add a separate saved-snapshot code coverage
overview, plus `graph.coverage` to page package boundaries and their files through the shared
API, CLI and MCP. Measure actual inputs and outputs; do not equate omitted evidence, absent
resolution or zero observed connections with zero business impact.

```sh
weftlet graph coverage --snapshot <id> --max-items 20 --json
weftlet graph coverage --snapshot <id> --project services/api --max-items 50 --json
```

MCP takes `snapshotId`, optional exact `projectRoot`, `maxItems` (1–200, default 50) and
`continuation`. Omit the project to page boundaries; select a returned root to page its files.
The root fallback is `.`. Continuations bind the exact snapshot manifest, retained facts,
diagnostics, view and page size. Responses include offset, totals, remaining count and explicit
continuation. An absent requested project is distinct from an unknown legacy inventory.
`SnapshotCodeCoverageService` and `projectCodeCoverage` are public exports; the application
wrapper supplies current checkout/configuration/overlay evidence state. Reads never hydrate
or call providers/indexers, and never establish current-diff eligibility.

## What is measured

Assembly records `codeInventory`, version `committed-code-inventory-v1`, with its own content
digest and the normalized SCIP artifact digest. It enumerates regular committed `.ts`, `.tsx`,
`.mts` and `.cts` files (including declaration/test files), exact Git blob identities and nearest
regular `package.json` path boundaries. It reads tree metadata, not package contents, dependency
installations or active checkout files. The boundary is a physical grouping, not inferred PNPM
workspace membership, a compiler project, an architectural domain or approved ownership.
Non-TypeScript projects are outside the counted source universe; a boundary with no such files
is visible without claiming its implementation is covered. Nonregular entries are excluded.

For each file, three independent fields are retained:

- `codeRootSelected`: selected by the existing repository file extractor's Git path selection.
- `requested`: included/excluded entry selection for `scip.sourceProject.include`; `unknown`
  for other indexer commands. We do not reinterpret arbitrary tsconfigs or shell arguments.
- `indexed`: actual presence in the normalized SCIP document list, including empty documents,
  if emitted. An indexer result without document observations leaves it unknown. A fact count
  never substitutes for this observation.

The public source-project probe demonstrates that an imported file can be resolvable by the
TypeScript compiler but absent from SCIP documents when it was not an entry. Selecting a
directory in `codeRoots` does not automatically add it to SCIP's `include`. The report exposes
the omitted file and references without an indexed definition. Configure the intended source
entries/aliases explicitly, then refresh. `indexedOutsideRequest` also handles observed extra
documents from other invocations; it is not a promise of automatic transitive inclusion.
`otherIndexedFiles` reports observations outside this TypeScript inventory without pretending
those languages have the same coverage contract.

## Connections and uncertainty

Coverage derives code connections from retained occurrence facts: a reference's exact symbol
ID is joined to its indexed definition file(s), then to recorded package boundaries. Repeated
sites remain distinct; duplicate fact IDs do not inflate reference counts. Project rows expose
incoming/outgoing reference counts and distinct connected boundary counts. File rows expose
reference counts, missing indexed definitions, declaration-only targets and cited implementation
gap counts. File node IDs support follow-up through `graph.neighbors` to exact symbols/citations.

These are code-reference measurements. They do not replace queue/stored-data product links,
prove calls ran, or establish compatibility/fulfillment. A declaration-only external target is
not an implementation body. Unresolved external calls retain the existing extraction diagnostics;
not every missing dynamic/type/module relationship can be observed. Zero gaps or connections
cannot certify completeness, isolation or no impact.

The full stored inventory and the same retained facts supply the public query, ordinary impact/
neighborhood/path/compatibility overview, and viewer text. RDF projection equivalence is tested;
no separate graph topology or guessed cross-service edge is introduced. `coverage.code.scope`
is `saved-snapshot`; existing lane counts remain `returned-page`. Overview has no file list,
keeping ordinary agent responses bounded. Detailed package/file lists are paginated separately.
Projection work still scans the saved inventory and facts, not an incremental graph database.

## Snapshot lifecycle

Assembly advances from 11 to 12. Inventory participates in committed and overlay content digests.
Draft inventory is rebuilt from the isolated captured tree; Git blob identities are content-based,
and the overlay manifest supplies base SHA/capture identity. Overlays record their actual SCIP
digest rather than inheriting the committed artifact's digest. Edits outside captured scope stay
excluded through the existing evidence-state contract. Historical snapshots remain readable;
absent inventory is `unavailable`, not zero. Unsupported version/digest mismatches are
`invalid-inventory`, without fabricated counts. Inventory digests detect mismatches, not signed
attestation or complete validation of arbitrary hand-edited snapshot JSON.

Provider/prompt/cache identity remains unchanged, so unchanged semantic artifacts can be reused.
The query adds no model calls, hard gates, dependencies, workspace builds or application changes.

## Acceptance and remaining scope

[The public fixture](../evaluations/monorepo-coverage/README.md) covers actual committed multi-package
TypeScript/TSX, aliases/barrels, an independent service, an omitted service, declaration-only and
unresolved external targets, selected-but-unindexed files and empty sources. Tests compare raw
SCIP documents, RDF facts and coverage; follow exact paginated boundaries/files; preserve unknown
legacy state; and verify unchanged reuse/clean comparison, dirty unavailable-provider queries,
CLI/MCP equivalence, rename/delete overlays, changed selection and immutable historical results.
Packed installation exercises the exported API and installed CLI/MCP. Supported platform results
are recorded in [validation](VALIDATION.md) and the change PR.

This closes the bounded B5 implementation, not live product acceptance. Arbitrary compiler-project
discovery, other language indexing, cross-repository federation, B3b's inference decision and B6's
candidate/usefulness evaluation retain their separate scope.
