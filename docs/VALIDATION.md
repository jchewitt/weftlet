# Validation evidence

Environment: Linux cloud, Node 24.19.0, pnpm 10.18.2. Source imported from
`fda97e0146099543aeaa6b338ef2b0e9fab0d1d6`. No source application was built or changed.

The milestone entries below record the original cloud checks. Subsequent
[HDesk validation](#hdesk-validation-of-6710e9391a6a01345dab5f5be4ae0656e1c9d1ae)
establishes live Codex success on Windows and the full deterministic checks on WSL,
while identifying remaining native Windows issues.

## B5 monorepo code coverage, 2026-10-30

[ADR 038](ADR-038-monorepo-code-coverage.md) records saved source selection separately from
actual SCIP documents and graph connections. The [public protocol](../evaluations/monorepo-coverage/README.md)
uses real committed multi-package TypeScript/TSX, aliases/barrels, an independent selected service,
an omitted service, an empty source, declaration-only targets and an unresolved external call.
Six integration tests pass, comparing every indexed flag to the normalized binary SCIP document
list and the derived overview to the lossless RDF projection. Source selection differs from code
roots: the real probe did not emit an imported file outside the selected entries, and the report
retains that absence plus references without an indexed definition.

Bounded package/file pagination, cursor binding, unknown legacy coverage, corrupted inventory,
shared query/viewer overview, API/CLI/MCP equivalence, dirty unavailable-provider queries, unchanged
semantic reuse and clean comparison pass. Draft rename/delete and expanded committed scope update
coverage while preserving historical snapshots and current-diff ineligibility. Three inventory
unit tests and 17 strict interface tests complement the six integration tests. The existing
commit-keyed hydration regression also passes after the deliberate assembly 12 bump. Strict test
typechecking passes, and architecture retains the existing 13 advisories without new baselines
or exceptions. Full publication and hosted Linux/Windows results are recorded in the change PR
after execution, including installed coverage API/CLI/MCP checks.

No private application, paid/model request, dependency, inference approval or npm publication is
part of this increment. Scope is regular committed TypeScript-family files grouped by physical
package manifest boundaries, not arbitrary compiler projects, all languages or runtime/business
completeness. B3b's inference decision and B6 qualification/live acceptance remain open.

## B4b selected contract comparison, 2026-10-30

[ADR 037](ADR-037-selected-contract-compatibility.md) adds a read-only exact assertion-pair
assessment through API/CLI/MCP. [The public protocol](../evaluations/contract-compatibility/README.md)
predeclares eleven source cases and retrieval bounds. Fifteen integration tests exercise actual
committed Markdown extraction, real SCIP/RDF/SHACL, numeric compatibility/insufficiency/disjointness,
required revalidation, unknowns, unrelated domains and competing assertions. They retain exact
facts, source authority and endpoint revisions; retrieve consumer symbol/test references; and
execute the public consumer freshness check separately from the graph verdict. Assessment never
claims code fulfillment or CI eligibility. The pure arithmetic suite checks all 81 operator/boundary
combinations against a finite-set oracle plus context negatives; interface tests reject malformed
requests. There are 42 new deterministic tests across these three files.

Unchanged hydration reuses all 23 semantic artifacts with unchanged snapshot identity/content.
API/CLI/MCP JSON agrees while dirty and the configured provider/indexer are unavailable. Draft
edits, document renames and deletions replace/invalidate declarations without changing saved
committed evidence. Strict test typechecking and architecture checks pass (the existing 13
advisories, with no new baseline or exceptions). Full publication and hosted checks are recorded
in the change PR after execution. No private source, model request, new dependency, extraction
identity change or npm publication is part of this increment. B5, the B3b inference decision and
B6 candidate/live acceptance remain open; this is not a product-wide compatibility proof.

## B4a cited contract obligations, 2026-10-30

[ADR 036](ADR-036-contract-obligation-declarations.md) adds optional explicit Markdown declarations
for producer guarantees and consumer requirements. Eight new public extraction/query tests pass
with real committed sources, TypeScript indexing, RDF/SHACL and an empty offline semantic provider.
Fourteen public core-contract tests cover exact scoped identities, unknown fields and invalid input.
The tests retain document fence spans and endpoint revisions, source approval separate from
assertion authority, missing endpoints/counterparts, unrelated scopes and unknown versions. Agent
pagination/paths/impact and SPARQL projection expose the same facts; the viewer retains endpoint
navigation. Strict corruption checks and named/union SHACL parity pass. Repeat hydration reuses
all nine semantic artifacts with unchanged snapshot identity/content; clean comparison, dirty saved
queries and draft document/endpoint edits, deletes and renames pass. Strict test typechecking passes.

At `a070ca68a3354f425cf8b506bdd3d0a76df32f5b`, the full local deterministic suite passes
**886 tests** (35 core + 851 toolkit/example/script),
with one optional OML integration test skipped. Build, release-documentation consistency,
architecture (the existing 13 advisories), inventory, licenses and fresh packed npm/npx consumer
smoke pass. The installed consumer exercises the public obligation extractor and both contract
sides alongside real SCIP/RDF/SHACL/MCP. Hosted Linux/Windows results are recorded in the change PR.
No new architecture baseline/exception, dependency, private consumer input or model request is used.
All 79 original imported path/hash pairs remain unchanged. B4b compatibility acceptance, inference
proposal review, monorepo coverage and candidate/live qualification remain separate queue items.
Structured declaration parsing does not prove fulfillment, delivery, compatibility or model quality.

Final review additionally checks source and endpoint text against the committed Git blob ID,
rejecting lossy non-UTF-8 decoding before recording a digest. A real committed binary negative
raises the focused suite to eight tests; final build, all eight tests, strict typechecking and
architecture checks pass. Final installed-consumer and hosted checks are recorded in PR #61.

## B3c static call evidence, 2026-10-29

[ADR 035](ADR-035-static-call-evidence.md) adds actual TypeScript call/new syntax joined to exact
SCIP identities. The [public observation](../evaluations/static-calls/README.md) records clean
commit `98eafa99375fdd1d37333409e4e666bf7f5b0924`: 237 facts, 33 calls and nine explicit gaps;
one cold semantic extraction, one repeat reuse and unchanged snapshot identity/content. The
caller/callee query returns three callsites in two pages (19,181 bytes); the bounded helper-to-rule
search exhausts its selected space with two paths and 52 candidate-edge examinations.

Eight real-extraction acceptance tests cover private/local functions, recursive/repeated calls,
shadowing, aliases, overloads, TSX, BOM/Unicode, callbacks/value uses, external/bodyless targets,
decorators/initializers/defaults, source/proof validation, shared queries, line shifts, rename/delete
and draft replacement. Negative SHACL/provenance/authority tests reject forged calls. Named and
union shape verdicts agree; full RDF projection preserves assertions. The semantic schema still
rejects call assertions, and its provider/prompt/cache identity remains unchanged. No paid or
private consumer request was used. Strict typechecking passes for the evaluator and tests.

Architecture remains at the existing 13 advisory findings; no new baseline or exception was
accepted. A bounded 10,000-fact synthetic shared-node SHACL smoke completed in about 2.25 seconds
of validation with unchanged serialized evidence. That case contains ordinary facts, not a
large call graph, and is not a comparative benchmark or private workload result. The new call
shapes target call records directly. Complete local publication and hosted Windows/Linux checks
are required before merge; the packed consumer now exercises the shipped parser and call proofs.
All 79 original source path/hash pairs and frozen B2/B3b inputs/results remain unchanged.

B3c subsequently passed the complete local publication gate (865 deterministic tests), final-source
focused/packed checks and [hosted PR Linux/Windows checks](https://github.com/jchewitt/weftlet/actions/runs/40991862219)
at `00643bba3abb5899ed3d0c1ce92d991152bce7aa`. PR #60 merged as `2aaaf6749955162fa4b82a3f6ecfe8f98601e04e`;
[main checks](https://github.com/jchewitt/weftlet/actions/runs/40992894407) also passed. No npm release was made.

## B3b mapping gaps and Windows study reliability, 2026-10-29

[ADR 034](ADR-034-mapping-gaps.md) records ten predeclared public cases, real SCIP/RDF/SHACL
and exact agent queries. The clean evaluator run matches all ten states, publishes 111 facts,
extracts eight documents cold and reuses all eight unchanged with identical snapshot identity
and content digest. No misleading-name mapping or missed direct binding appears. Structural
paths retain explicit truncation; they are not promoted into implementation claims. Public
requests, responses, proofs, limits and measured timings are retained in the linked report.
The provider is a fixed offline grammar; no paid request or model-quality result is claimed.

GitHub PR #58's [retry](https://github.com/jchewitt/weftlet/actions/runs/40966207307) and
[main checks](https://github.com/jchewitt/weftlet/actions/runs/40968675537) passed. Historical
failed attempts remain visible. Their recurring native Windows frozen-study timeout motivated
batched immutable Git reads, immutable fixture-input reuse and yielding between synchronous
cases. All eight frozen-study cases pass locally without increasing the 30-second limit or
changing frozen B2 inputs/results. Three new assessment tests and strict evaluator typechecking
pass. Full local publication and hosted Windows/Linux checks are required for this change.

The release version PR remains open. Browser interaction, live inference evaluation and private
consumer acceptance remain separate; nothing in this assessment publishes an npm release.

## B3a explicit document-to-symbol bindings, 2026-10-29

[ADR 033](ADR-033-document-symbol-bindings.md) adds cited explicit mappings after semantic and
code extraction. Focused public tests pass with real SCIP and an offline deterministic prose
provider: functions/private methods, duplicate names, native qualification, overloads, re-export
aliases, declaration-only targets, UTF-8 BOM offsets and reference-style Markdown. Missing,
ambiguous and stale-byte targets produce gaps rather than guessed links. The public extractor
checks committed source and definition bytes. Named-dataset and union SHACL agree on the new
shape cases; consistency checks reject missing/mismatched proof facts and authority promotion.

Agent neighborhoods/paths, impact scans, SPARQL and the viewer expose the same binding facts.
Bindings retain selected occurrences, all indexed definitions, source citations and original
subject assertion authority/review. Tests verify unchanged semantic reuse and clean comparison,
dirty saved querying, overlay source edits/deletions/renames and invalidation of withdrawn rules.
Traversal-selected validation documents can supply cited test mappings without model extraction
or product-intent promotion. No private consumer or paid/live provider request was used.

The initial full Linux publication gate passed **853 deterministic tests** (21 core + 832 toolkit;
optional OML integration skipped), build, inventory, licenses and fresh packed npm/npx consumer
smoke including real SCIP/RDF/SHACL and MCP. Follow-up review added code-derived contract-subject
coverage, corrected omission of unset optional proof fields for exact JSON projection, and separated
citation/parsing/proof checks into focused helpers. The 23-test selector/integration suite passes;
architecture is back to the existing **13 advisory findings**, with no new baseline or exception.
All 79 original source path/hash pairs remain intact. Final aggregate and hosted Windows/Linux
checks are required on the change PR. Browser interaction, live model quality and private consumer
acceptance remain separate.

## B3a precise SCIP evidence, 2026-10-29

[ADR 032](ADR-032-scip-code-evidence.md) adds typed code entities and exact occurrences to the
existing projection. It does not yet implement explicit intent-to-symbol binding or actual calls.
The new public integration fixture uses real committed TypeScript, SCIP, hydration, strict SHACL
and RDF/SPARQL equivalence. Its 3,000-line file is explicitly padded with comments; the functional
cases cover repeated same-line references, Unicode columns, recursive references, private methods,
local arrow range limits, overload declaration spans, UTF-8 BOM first-line offsets, independent
mocks and cross-file use.
It is a location/isolation regression with a predeclared 300-fact/60-second hydration ceiling,
not a representative monorepo benchmark.

Exact neighbor pagination and paths preserve cited evidence. Shared unresolved external symbols
remain queryable without automatically joining unrelated co-users in impact scans; diagnostic ID
examples are bounded to 100 with total/omitted state. Repeat output is identical, and edited,
renamed/deleted code is replaced in a draft overlay while prior evidence remains unchanged.
New negative checks retain strict kind cardinality and reject malformed source/identity metadata,
role/enclosure inconsistencies and invalid ranges. Native zero-width anchors and arrow initializer
extents are preserved instead of imposing a false name-containment requirement.

Existing coverage and traversal tests now include the additional code facts and follow continuation
when they no longer fit on one page. Static test source remains implemented evidence, not an
execution verdict. Semantic artifact identities are unchanged; extraction/assembly identity requires
a code refresh. The frozen B2 comparison is unchanged and all 79 original source path/hash pairs
remain intact. No private source or live model/provider request was used for this increment.

Before the additional BOM regression, the local aggregate publication gate passes build, **828 deterministic tests** (21 core + 807
toolkit; optional OML integration skipped), architecture with the existing 13 advisory findings,
release documentation, inventory, license checks and fresh packed-consumer smoke. The installed
consumer exercises the public core factory, new runtime modules, real SCIP/RDF/SHACL and MCP.
Hosted Linux passes the same gate. The initial native Windows branch run passes 700 selected
toolkit tests and 21 core tests. The concurrent PR run passes every new SCIP case but hits an
existing timeout-fixture startup race: its 250 ms module deadline expires on the first source,
before the deliberately blocked second source. The test-only deadline is now 2 seconds; timeout,
completed-artifact reuse, privacy and old-snapshot assertions remain unchanged. Hosted results
for that correction are recorded with the change PR. A final real-indexer probe also showed that
TypeScript strips a leading UTF-8 BOM: the new projection now translates first-line columns back
to committed text. Its 18 focused range/hydration tests pass, including first-line names, zero-width
anchors, multiline extents, subsequent lines and unchanged repeat. Final aggregate/hosted results
are recorded with the change PR. Browser interaction, live
provider quality, private large-graph volume/usefulness and the 1.0 acceptance decision remain
separate. Release PR #53 stays open; this increment does not publish npm packages.

## B2b measured extractor decision, 2026-10-29

[ADR 031](ADR-031-code-extractor-selection.md) selects retaining SCIP and exposing richer
code entities/occurrences in B3a. This increment changes research tooling and records only;
no production schema, indexer or dependency change and no npm publication.

The [public evidence record](../evaluations/code-graph-results/2026-10-29/README.md) contains
sealed setup/harness receipts, native bytes, per-case results, corrected projections, query
witnesses and an explicit export inventory. Inputs remain the 72 frozen files at `f1844f3`,
digest `04fa4584bd80a9b1a1d964420dcaf35b5e8c61a67515cc57e2476fd44fa798b3`.
Sixteen fully recorded scenario runs are replayed after two disclosed normalization corrections;
failed/interrupted attempts remain retained, and no scenario exceeds three native extractions.
The 342.50-second total includes those attempts and replay, below the frozen 1,800-second budget.
Extraction runs offline in Docker with 2 GiB cgroup memory enforcement. No paid/model or private
consumer inputs. Graphify is an isolated pinned source-API experiment, not a verified published
Python distribution or a new Weftlet runtime dependency.

Cold labeled results: raw SCIP 15/15 declaration families and 16/16 references; Graphify 14/15
families, 8/16 references and 7/10 native calls. Current Weftlet has coarse candidates for 7/15
families and 12/16 references but lacks exact occurrences. No named false-join negative was
asserted by the exact-track arms; unjudged edges and explicit/silent gaps remain reported.
Calls remain unsupported by SCIP; a reference is not reclassified as a call.

All 96 corrected graph/mode assemblies pass strict SHACL and exact RDF/SPARQL projection parity.
Documented asynchronous business chains, the negative missing-handoff control, shared contracts,
dispatch targets and assertion authority survive. Repeat/dirty normalized outputs are identical;
rename/delete remove old current spans, excluded projects remain explicit, unrelated identities
and historical snapshot hashes stay stable. These are synthetic deterministic retrieval results,
not live semantic quality, deployed queue delivery, compatible rule checks or private acceptance.
All 1,035 allowlisted artifact hashes and all 79 original extraction source path/hash pairs were
verified. The six-megabyte compressed evidence archive is excluded from npm package contents.

Local Linux build and **786 deterministic tests** pass (17 core + 769 toolkit; one optional OML
integration skipped), with the existing 13 advisory architecture findings, inventory and license
checks and fresh packed-consumer smoke. Twelve new scoring regressions join the native Windows
CI selection; the frozen-input verifier retains seven checks. Hosted results are recorded with
the exact change PR. This study does not validate Graphify on Windows/macOS or claim general speed ratios.
Release PR #53 remains open for the later candidate; B3a is next.

## B2a frozen code-extractor comparison, 2026-10-29

The [comparison note](GRAPHIFY-EVALUATION.md) now points to a committed public corpus and
predeclared protocol: current Weftlet SCIP projection, richer raw SCIP and pinned Graphify
static extraction. There are 51 labeled declaration/reference/call cases, three explicit-gap
requirements, three business controls and eight edit/coverage scenarios. The 72 input files
have inventory digest `04fa4584bd80a9b1a1d964420dcaf35b5e8c61a67515cc57e2476fd44fa798b3`.
The measurement receipt must identify the full freeze commit as well as this digest.

Seven focused checks validate both configuration templates and typecheck both public corpora,
reject changed/extra inputs, ambiguous anchors, contradictory labels, unsafe paths and broken
edits/renames, and verify immutable Git blobs while the checkout is dirty. Real Git CRLF
conversion remains supported. No indexer or provider is invoked by these input checks.
Generated output is excluded; all 79 original extraction source path/hash pairs are unchanged.

Local build and 774 deterministic tests pass (17 core + 757 toolkit, one optional OML integration
skipped), along with architecture (the existing 13 advisory findings), inventory and licenses.
Hosted checks and fresh packed-consumer installation are recorded with the exact change PR.
The existing regression suite still exercises real SCIP and hydration on its established
fixtures; that is not a comparative run on the new frozen corpus.

Graphify's pinned manifest/lock project versions differ (0.9.97/0.9.96). The protocol requires an
explicit setup receipt before measurement; no Graphify dependency, source or service was
installed, and no comparative quality, timing, backend-selection or private acceptance result
is claimed. B2b is next. The candidate release PR remains open, with no npm upload for B2a.

## B1b bounded cited paths, 2026-10-29

[ADR 030](ADR-030-bounded-evidence-paths.md) records `graph.paths` through the public API,
CLI and MCP. Cited simple paths use deterministic assertion-ID depth-first order, exact saved
snapshot endpoints, direction/relation filters and explicit page/depth/work bounds. Continuations
reconstruct bounded state; replay and new steps are reported separately. Pending DFS prefixes,
depth-cut examples and omitted counts remain explicit. Search completion only covers selected
saved facts and depth, not unextracted dependencies, causality or business compatibility.

The focused integration run passed 46 tests, including an independent oracle for all 4,096
directed four-node graphs, competing branches/parallel citations, cycles/self-links, twelve-hop
paths, empty work pages, frontier bounds, stale/malformed cursors and a 100,000-step hard ceiling.
RDF projection comparisons retain exact facts. Actual public extraction/SCIP/RDF follows source
files across the collection/execution boundary through real CLI/MCP continuation while dirty
and with unavailable providers/indexers. Real overlays retain draft authority and capture/stale
state, and old snapshots remain readable after deletion. All three original MCP startup tests
remain enabled and pass. Missing targets in an incomplete document scope retain the exact
selection/exclusion record and an explicit INCOMPLETE warning.

Final local checks pass build, 767 deterministic tests (17 core + 750 toolkit; one optional OML
integration skipped), architecture with the existing 13 advisory findings, release documentation,
inventory, licenses and fresh packed-consumer smoke. The installed CLI/MCP exhaust work pages
and preserve both a direct Markdown route and the semantic capability route with every citation.
Shared snapshot metadata and CLI parsing keep neighbors/paths consistent; no architecture rule,
baseline or exception was changed. All 79 original source path/hash pairs remain unchanged.

The offline viewer embeds the same search function and provides next-path, direction, relation
and depth controls. Executing rendered controls in a small DOM harness matches the RDF service's
highlighted assertion IDs and continuation states, including duplicate labels and filtered
evidence. This proves script/projection parity, not interactive browser rendering. The former
viewer-only shortest-path behavior is replaced and labeled as cited deterministic paths.

Hosted results belong to the exact change PR head. No npm publication, live model quality or
private TradePilot acceptance is claimed. B2's frozen comparison protocol is the next task;
the candidate version PR remains open while B2–B5 work accumulates.

## B1a exact-node exploration, 2026-10-28

The maintainer requested the remaining 1.0 items be tasked and started, with TradePilot live
acceptance deferred until the next candidate. [The work queue](1.0-WORK-QUEUE.md) records B1–B6
increments and dependencies. The maintainer believes the 0.6.1 filename issue was the main
consumer blocker; this is not an additional private acceptance result.

[ADR 029](ADR-029-exact-graph-neighborhoods.md) records the additive `graph.neighbors` public
contract, CLI and MCP tool. Exact snapshot/node selection, direction/relation filters, assertion
pagination and frontier counts retain citations, source/assertion authority and node variants.
The shared read-side helper preserves dirty checkout, captured-overlay and subsequent-edit state.
No new extraction, storage identity, backend or model/provider integration is introduced.

Local release checks pass build, 736 deterministic tests (17 core + 719 toolkit; one optional
OML integration skipped), architecture with 13 advisory findings, inventory, licenses and fresh
packed-consumer installation. The existing 79 source path/hash pairs remain unchanged. The
public predicate list is frozen without changing its ordered values. Relevant extraction gaps,
including diagnostics for absent nodes, retain bounded items and explicit omitted counts.
Hosted results belong to the exact change PR head; this source entry does not claim hosted
completion or npm publication.

New focused cases retain multiple citations, cycles and self-links; test exact IDs against
same-label and malicious-looking inputs; exhaust pages against the RDF query; reject changed
snapshots/filters/page sizes and malformed/stale cursors; and preserve old snapshots when newer
ones no longer contain a node. Working-overlay tests cover draft authority, renames/deletions
and stale captures through the new service. The actual public monorepo extraction test follows
collection to execution's obligation and implementing file through real CLI/MCP transport while
the checkout is dirty and configured provider/indexer are unavailable. It uses real SCIP and
RDF/SHACL with a small deterministic prose provider, not a live model. Packed installation tests
exercise the same new CLI/MCP operation and complete its two-page assertion set without loss.

B1b multi-hop paths/viewer parity and B2's Graphify comparison remain open, followed by B3–B6.
No new candidate, live semantic-quality result, browser interaction or private consumer rerun
is claimed. A pending minor changeset accumulates toward the next acceptance candidate.

## Published 0.6.1 physical artifact filename fix, 2026-10-28

Both `@weftlet/core@0.6.1` and `@weftlet/toolkit@0.6.1` are published and verified as
registry `latest`. [Fix PR 49](https://github.com/jchewitt/weftlet/pull/49) merged at
`00e09ace22ea2cbd840d118f177b0508a60da9a7`; [release PR 50](https://github.com/jchewitt/weftlet/pull/50)
committed both package versions to main at `a56e7dca734b40829325cac9f377037bcfdc765d` before
[trusted publication](https://github.com/jchewitt/weftlet/actions/runs/40768151495). Preparation,
both uploads and release records passed on the first attempt. Public provenance and both
package-specific tags identify that release commit; both GitHub Releases exist.

[ADR 028](ADR-028-bounded-artifact-paths.md) records the bounded physical naming policy and
legacy read compatibility. The public traversal → unchanged repeat → clean-comparison regression
reproduced `ENAMETOOLONG` in real SCIP before the fix, after the first hydration/repeat succeeded.
It passes with full logical IDs, cited facts/provenance, cache keys and content digests preserved.
Long physical keys are hashed and staging names are independent; existing immutable files remain
readable without rewriting them. Cross-process publication guarantees and strict validation remain.

Release head `56d2db53ab2a3871d1db72cb2b0d04c99e86c9bc` passed
[hosted Ubuntu and Windows checks](https://github.com/jchewitt/weftlet/actions/runs/40767043720):
698 deterministic tests (17 core + 681 toolkit; one optional OML integration skipped), architecture
with 14 advisory findings, inventory, licenses and fresh packed-consumer smoke on Ubuntu;
571 tests plus inventory/licenses on Windows. The requested Windows traversal/repeat/clean test
passed, alongside 256-character keys, legacy bytes, immutable winners and concurrent heads.
The fix PR also passed both platforms. Local build/release checks and package dry runs passed.
Reviewed exports contain 13 core files and 258 toolkit files, including the runtime naming helper
and license notices. All 79 original source path/hash pairs are unchanged.

Downloaded public npm archives match the reviewed local and workflow-prepared archives byte for
byte. Provenance source and subject digests were checked; independent certificate-chain validation
is not claimed.

| Package | Verified SHA-512 integrity |
| --- | --- |
| `@weftlet/core@0.6.1` | `sha512-xSEjqLulXW052KvPY/Dlu5DS5mTEJQYlHrv0idC3aZIPiuiq+GWA15nJ70T/tf9XE5S4ZbvF4dKJLsom3sIdDA==` |
| `@weftlet/toolkit@0.6.1` | `sha512-S7iTCLWhGziTVbxBbeJIKu24j1FeuJKEnF+EbHFbH9oKRPveDzt0GnsO7s2AZn8PeDBJjUnl5+zB7X8IVL3AxA==` |

An initial install during registry propagation returned `ETARGET`; a fresh-cache retry with
`--prefer-online` passed. The fresh public-registry consumer on Linux / Node 24.19.0 installed
both exact versions and ran configuration validation, traversal hydration, unchanged repeat,
clean comparison and a saved
snapshot query through the packaged CLI. The deterministic public grammar provider extracted
six documents once; the repeat reused all six, and clean comparison made no further provider
calls. Real SCIP and RDF/SHACL produced 230 facts and 200 query facts. The clean snapshot's
226-character logical identity is retained, content digests and all facts/provenance apart from
the containing snapshot ID agree, physical components are bounded, no staging files remain,
and Git stays clean. This uses a public module provider, not a live model or Codex authentication.
The Windows regression separately exercises the unchanged Codex adapter with an offline runner.

This focused consumer blocker ships ahead of [B1–B6](PRE-1.0-BASELINE.md). TradePilot should
upgrade to the patch and rerun its original sequence without clearing compatible semantic artifacts.
No private consumer rerun, paid/model work or live optional OML compilation is claimed. B1 exact
exploration and B2 Graphify/SCIP evaluation remain the next development items; no 1.0 is declared.

## Business-context baseline assessment, 2026-10-28

The maintainer requested checks for business relationships across asynchronous/stored-data
boundaries, progressive agent exploration and multiple service/client projects in a monorepo.
[The assessment and new task list](PRE-1.0-BASELINE.md) explicitly extend the original T01–T10
scope; the historical completion statements below concern that original list.

Against unchanged runtime at `9b4acffe1c4d35f9fd2f91132c576f8934658677`, 24 existing focused
tests and three new public acceptance tests pass on Linux, Node 24.19.0 / pnpm 10.18.2.
[Recorded results](assessments/pre-1.0-2026-10-28.json) identify test files, cases, source hashes
and commands. The new fixture uses real Git, SCIP, semantic-provider plumbing, RDF/SHACL and
the application/MCP facade. Its small deterministic prose parser is not a live model.

The control already reads the two disconnected services' documents. Adding only a documented
stored-data handoff makes downstream implementations and tests reachable while retaining both
freshness rules and excluding a same-label unrelated domain. One changed document is extracted,
four are reused; the next repeat reuses all five with unchanged identity/content. Small result
pages exhaust to the larger scan exactly; focused follow-up works and depth truncation stays
explicit. Workspace aliases resolve a shared re-exported contract across API and TSX files.

These are mechanism passes. They do not establish actual broker/database delivery, automatic
rule compatibility or function binding, autonomous-agent usefulness, Expo/service builds, live
semantic quality or private TradePilot acceptance. Exact-node exploration remains open.
Graphify source/document review is pinned in [the evaluation note](GRAPHIFY-EVALUATION.md);
no comparative benchmark, new runtime dependency or backend replacement is claimed.

## Published 0.6.0 acceptance candidate, 2026-10-28

Both `@weftlet/core@0.6.0` and `@weftlet/toolkit@0.6.0` are published and were verified as
the registry `latest` versions. [Release PR 36](https://github.com/jchewitt/weftlet/pull/36)
merged at `b4c808b9221c5c82f9f7326a310e966d1fee2888`; package versions were committed to main
before publication. [Release run 40742010093](https://github.com/jchewitt/weftlet/actions/runs/40742010093)
completed preparation, both trusted npm uploads and GitHub release records on its first attempt.
No npm token was supplied to this cloud. Public provenance statements and both package-specific
Git tags identify that exact source commit; both GitHub Releases exist.

The version PR's exact head `944b66a7ac9d119b650b7341dc982e12ea45a75b` passed
[hosted Ubuntu and Windows checks](https://github.com/jchewitt/weftlet/actions/runs/40715307427).
Frozen local installation/build, package preparation and dry runs passed before merging. Reviewed
exports contain 13 files in core and 252 in toolkit, including applicable license notices and no
source history, credentials, caches or native benchmark binary. All 79 original source path/hash
pairs remain intact. Downloaded public npm archives match the reviewed local archives and the
workflow's prepared archives byte for byte:

| Package | Verified SHA-512 integrity |
| --- | --- |
| `@weftlet/core@0.6.0` | `sha512-2o2WO4DyhudgcsGQ//j0mXfXBvyqBHoYPnI52ZiqZSr5qqjCayw7njsRqCxOEIL6dseUYoICsnlkSYrRSDHKKw==` |
| `@weftlet/toolkit@0.6.0` | `sha512-d7Q9gNdpwWUdkJLhGtY6xpi+gfg3CsLM5BqJqmVH9xgNwtc5e5kDpTwMSv4jq/+gybiXbQOOSsI7x7c+m1W1xA==` |

A fresh public-registry consumer on Linux / Node 24.19.0 installed both exact versions, ran the
documented npx initialization and config validation, imported public APIs, checked canonical file
nodes, lossless RDF projection, SPARQL and positive/negative strict SHACL, and initialized MCP.
`impact.scan` discovery and honest missing-snapshot reporting passed without model calls. This
registry smoke is separate from the release gate's full deterministic/packed-consumer checks;
neither is a private TradePilot hydration, live model-quality evaluation or browser interaction.

T06, T07 and T10 are now available in the published candidate, alongside the T05 evaluation and
earlier fixes. The planned 1.0 engineering work is complete. TradePilot should use these published
versions for the [consumer acceptance checklist](RELEASE-1.0-PLAN.md#official-10-acceptance);
official 1.0 remains conditional on that acceptance and any resulting blocker fixes. Previously
tentative browser/live-auth work remains explicitly separate. No 1.0 release is claimed.

## T05 validation closeout, 2026-10-28

[ADR 027](ADR-027-validation-closeout.md) records the engineering decision to retain full direct
validation after public cold/repeat/changed-input, worker, exact-key, incremental-dependency and
Rust evaluations. No runtime validation code, shapes, policy, baseline, cache identity or production
dependency changed. No assertion/provenance/authority was dropped or promoted. All 79 original
source path/hash pairs are intact. The original 23-case SHACL corpus is shared with the optional
native probe; its original named-dataset equivalence assertions still pass.

[Raw reports](benchmarks/validation-2026-10-28/README.md) record 258 completed direct/worker cases
and 18 paired sample groups with identical verdicts/canonical input. Three-sample cold direct
medians at 10,000 facts are 2.86 seconds for unique identities and 5.67 seconds for dense source
metadata. Direct whole-process peak RSS reached 1.72 GiB; one worker case reached 2.99 GiB.
These are public fixture measurements, not private consumer performance or capacity guarantees.
The actual six-stage public extraction uses an offline runner through the Codex adapter and real
SCIP; all six semantic sources are reused on repeat. Prototype cancellation returns no accepted
verdict and attempts no publication. Exact-key costs/misses and a changed-facts-only false pass
support the decisions to keep full validation without introducing receipts or incrementality.

Rudof 0.3.35, Apache-2.0, was evaluated from its checksum-verified official Linux GNU binary
outside the repository. All 29 conformance/location cases agree; diagnostic counts differ on two
malformed citation cases, retained explicitly in the report. All 12 native timing cases complete,
with no clear overall file-transfer performance/resource benefit. The probe deliberately exits 1
for the diagnostic mismatch; it is not a passed replacement-equivalence gate. It is optional
development tooling, with no native binary download or dependency in package/CI installation.

The local build and **691 deterministic tests** (17 core + 674 toolkit), one optional OML skip,
architecture (14 advisory findings), inventory, licenses, release-documentation and fresh packed
npm/npx/consumer smoke all passed. Hosted Ubuntu also passed at `10082e2` in the
[push run](https://github.com/jchewitt/weftlet/actions/runs/40710918759) and
[PR run](https://github.com/jchewitt/weftlet/actions/runs/40710994196). Initial native Windows
checks passed the existing 561 tests but could not import the new benchmark: CRLF conversion of
its shebang triggered a Vitest syntax error. The same CRLF failure was reproduced locally;
removing the unnecessary shebangs from these Node-invoked scripts made all six study tests pass
with CRLF content. A final harness correction also preserves the extractor's original content
digest during timestamp-only scenarios. Those six checks pass locally. Corrected-head hosted
outcomes are tracked in [PR 46](https://github.com/jchewitt/weftlet/pull/46/checks).
No paid/live model, private TradePilot run, browser interaction, fresh-cloud restoration, npm upload
or official 1.0 acceptance is claimed. The next gate is the reviewed minor candidate, then genuine
consumer hydration/repeat acceptance and the separate official 1.0 release decision.

## T07c traversal hydration, 2026-10-28

[ADR 026](ADR-026-traversal-hydration.md) connects canonical coverage and source classification to
opt-in `documentTraversal` hydration, its no-model plan, cache adoption and draft overlays.
Direct configurations retain their existing selection and identity. Validation sources receive
presence/reference evidence without model extraction. Coverage/read-limit/role-ambiguity and
semantic-budget failures stop new model work while retaining previous evidence. Ownership gaps
remain explicit diagnostics; neither source classification nor owner mappings approve assertions.

The local publication gate passed **685 deterministic tests** (17 core, 668 toolkit), including
11 added regressions, and one optional OML skip. Inventory, licenses, release documentation and
fresh npm/npx/packed-consumer checks passed. Final small cache-adoption/read-limit-reporting edits
were followed by a rebuilt toolkit, all 32 affected integration/cache-adoption/CLI tests, governance
and inventory checks; the installed-package smoke was repeated against that rebuild. Governance
reports 14 advisory findings at existing finding locations, including the prior fixture-setup
clone signal. No architecture policy, baseline or exception was changed. All 79 original source
path/hash pairs are preserved.

Public tests use the unchanged Codex adapter with an offline prose parser through its real prompt,
JSON and citation checks, plus real SCIP, strict SHACL and lossless RDF projection. The six-stage
queue-boundary pipeline reaches downstream implementation/tests. An unchanged repeat reuses all
six eligible semantic sources, with identical snapshot identity and content digest; two validation
documents remain in the graph. Other regressions cover Codex activation/policy reuse without
artifact rewriting, actual module-provider isolation/reuse in workspace and user storage,
rename/delete/reachability, changed owners, incomplete draft coverage, saved-history queries and
current-diff rejection. Installed CLI hydration/query/repeat tests use a deterministic module,
real indexing and packaged assets; a blocked refresh preserves the committed head.

The chat's managed executor disconnected during development and later reconnected with the
uncommitted work intact. This is recovery of this workspace, not a fresh-cloud restoration test.
No live/paid model request, browser interaction, private TradePilot acceptance or npm publication
is claimed. [PR 44](https://github.com/jchewitt/weftlet/pull/44) merged at
`b44053f08e4342ec1502046acc5b85a0efd08ea1`. Exact feature head
`fd89410108e7be75524b54a4e02d53459afbcd20` passed both the
[push run](https://github.com/jchewitt/weftlet/actions/runs/40690845708) and the
[PR run](https://github.com/jchewitt/weftlet/actions/runs/40690905937). Hosted Ubuntu passed
all 685 deterministic tests and the full publication gate; native Windows passed all 561 selected
tests, inventory and licenses, including all new traversal hydration regressions. These are source
validation results, not a new npm release. Release PR 36 remains unmerged.
T05 performance/validation closeout remains the next engineering workstream, followed by the
reviewed minor candidate, consumer acceptance and the separate official 1.0 decision.

## T07b document classification and evidence, 2026-10-27

[ADR 025](ADR-025-document-classification.md) records explicit document roles and SOT owner
mappings, the operation-level `documents plan --document-policy` input, and the public deterministic
document-evidence extractor. These are prospective APIs: current hydration selection, semantic
artifacts, configuration/extractor/assembly identities and historical snapshots remain unchanged.
Traversal-driven hydration and default validation-document separation remain T07c.

Public fixtures exercise real committed document/file extraction, empty validation documents,
reference definition/use citations, approved validation reports, unapproved owned plans, ambiguous
roles/owners, scope changes, renames/deletes and historical re-extraction. Presence and reference
facts remain inferred structural evidence; neither written “PASS” text nor an owner mapping creates
test-success evidence or approved assertions. Strict SHACL, exact RDF/SPARQL projection, API/MCP,
Markdown and HTML/SVG/DOT preserve per-fact roles, policy identity, ownership and provenance.

Preview and extraction checks use unavailable provider/adapter sentinels and retain source bytes,
Git index, hydration plans and seeded cache artifacts. Classification gaps are separate from the
preview's traversal/budget `ready` field. Independent review found that an approved validation
document must be ineligible as an intent owner, and that a frontier exceeding 10,000 discovered
documents must survive the classifier's per-call bound; both have focused regressions.

Local `pnpm context-graph:publication-check` passed: **674 deterministic tests** (17 core,
657 toolkit), including 111 new regressions, and one optional OML skip. Release documentation,
inventory, licenses and fresh packed-consumer checks passed, including the new public policy and
document-evidence APIs, installed CLI policy loading, real SCIP, RDF/SHACL, rendering and MCP.
All 79 original source path/hash pairs are intact. Architecture checks passed with 14 advisories:
13 existing findings and one new clone signal for independent Git test-fixture setup. Review found
shared setup mechanics, not duplicated product rules; no policy, debt baseline or exception changed.
Independent review found no remaining blocker after the two corrections above.

[PR 42](https://github.com/jchewitt/weftlet/pull/42) merged at
`6c59746118c910d850427c5c6c48e8b52eefcad7`. Exact feature head
`72f554cb9accd32b4b992581d06c685f7e5c0e54` passed hosted Ubuntu/native Windows in
[run 40557348341](https://github.com/jchewitt/weftlet/actions/runs/40557348341) and the
[independent PR run](https://github.com/jchewitt/weftlet/actions/runs/40557375964).
Ubuntu passed all 674 deterministic tests and the full publication gate. Windows passed all
550 selected tests, inventory and licenses, including every new document-classification regression.

The first push-run Windows attempt passed 549/550 tests but hit the existing 60-second timeout
in the routing overlay rename/delete scenario. The independent PR run passed that scenario in
21.9 seconds; the failed-job rerun passed it in 23.1 seconds and passed all 550 checks. Its prior
T10 run took 22.8 seconds. No code or deadline changed between attempts. The first stall's phase
and cause remain undiagnosed; these results do not establish a reproducible SHACL slowdown.

T07b is merged with minor changesets; publication remains separate and npm's last verified release
is 0.5.0. T07c and T05 closeout remain before the reviewed minor candidate and consumer acceptance.
No model/provider request, browser interaction or private consumer acceptance is claimed.

## T10 implementation coverage reporting, 2026-10-27

The consumer reports returned code relationships with zero implementation coverage. The exact
installed version/output was requested; no private source or artifact was accessed. Public
regressions reproduced the defect with actual contract extraction (one production consumer counted
as zero) and real SCIP (eight production relationships counted as zero). [ADR 024](ADR-024-implementation-coverage.md)
records the reporting correction and metadata compatibility. It requires no hydration/model call
and leaves snapshot bytes, extraction/cache identities, evidence authority and ranking unchanged.

Focused public regressions cover real Git/extractors, strict SHACL, exact fact/provenance/authority
round trips, API/MCP/Markdown/HTML consistency, pagination and retained source diagnostics. Negative
cases distinguish document/model/test/runtime/draft facts from production implementation evidence.

Local `pnpm context-graph:publication-check` passed: 563 deterministic tests (17 core, 546 toolkit),
including 26 new coverage regressions, one optional OML skip, 13 existing advisory findings,
release documentation, inventory, licenses and fresh packed-consumer checks. The installed query
counts real SCIP production facts in both implementation and contract coverage; visualization uses
the same actual Context Pack. All 79 original source path/hash pairs are intact. Independent review
found no remaining blocker; Markdown and HTML share the coverage explanation and page-scoped wording.

[PR 40](https://github.com/jchewitt/weftlet/pull/40) merged at
`d3fe532f3c10869eee72a023c4682601559f0f9e`. Exact feature head
`d324a1c56a40d069dca3f5201ceb12b55fceecc2` passed hosted Ubuntu/native Windows in
[run 40541223960](https://github.com/jchewitt/weftlet/actions/runs/40541223960) and the
[PR run](https://github.com/jchewitt/weftlet/actions/runs/40541230905).
Ubuntu passed the full publication gate and all 563 deterministic tests. Windows passed all 439
selected tests plus inventory and licenses, including real SCIP and the new reporting regressions.
T10 is merged with patch changesets; npm publication remains separate. No private consumer
acceptance or model/provider request is claimed.

## T07a prospective document coverage, 2026-10-27

Implemented after T06; no npm publication is claimed here. [ADR 023](ADR-023-document-coverage-preview.md)
records the standalone `documents plan` command/API, committed-link coverage and limits. Current
hydration selection, cache estimates and configuration/extractor/assembly identities are unchanged.

Focused tests exercise actual Markdown, Git objects and a public ten-document discovery → analysis
→ admission → planning → execution → outcomes flow, with shared queue-contract links, cycles,
unapproved drafts and validation references. They distinguish prospective coverage from the actual
hydration plan, retain exact committed digests/citations, preserve authority, and verify no source
bodies, provider/adapter imports, cache/snapshot writes or checkout/index changes. Rename/delete
and historical refs, duplicate definitions, scope boundaries, unsafe paths, symlinks/submodules,
read-limit frontiers and complete closure above extraction budgets are covered. Native file
symlink privileges are not required by the Git boundary fixtures.

Local `pnpm context-graph:publication-check` passed: 537 deterministic tests (17 core,
520 toolkit), including 96 new coverage cases, one optional OML skip, 13 unchanged advisory
architecture findings, release documentation, inventory, licenses and fresh packed-consumer checks.
The installed CLI/API produced matching prospective coverage digests and explicit read-limit
frontiers while the configured provider and adapter were unavailable. Existing real TypeScript
SCIP, RDF/SPARQL/SHACL, visualization and MCP checks also passed. All 79 original source
path/hash pairs are intact. Independent review found a `./` evidence-root labeling edge case;
the fix and both `.`/`./` regressions pass.

The first hosted Windows attempt passed 412 checks and failed one fixture setup: Git for Windows
rejects tab/newline paths even through `update-index`. The fixture now writes those nested Git
tree/commit objects directly, preserving unusual-path coverage without checkout or safety-setting
changes. All seven focused Git tests pass locally after this fixture-only correction.

[PR 38](https://github.com/jchewitt/weftlet/pull/38) merged at
`35de52e42b51728af43d9bb74cb9b338cf3c1ece`. Final feature head
`0969e109409aa6fb86827cb6a70ffdd0bcc34bc7` passed hosted Ubuntu and native Windows in
[run 40537179020](https://github.com/jchewitt/weftlet/actions/runs/40537179020) and the
[PR run](https://github.com/jchewitt/weftlet/actions/runs/40537186133).
Ubuntu passed all 537 deterministic tests and the full publication gate, with one optional OML
skip and 13 advisory findings. Windows passed all 413 selected tests, inventory and license checks,
including the corrected whitespace-path fixture. T07a is merged with a minor changeset;
the verified npm release remains 0.5.0.

A no-model self-repository probe started from `docs/RELEASE-1.0-PLAN.md` at committed source
`6a6a19cd8ba8c22c64c4158e38e0a3a57f350ab2`, with root `.` and the evaluation configuration.
It read the complete supported closure: 28 documents, 332,658 bytes and 208 link occurrences.
It correctly reported `ready: false`: all 28 candidates exceed the six-document budget, and
`docs/VALIDATION.md` exceeds the 65,536-byte per-source budget. No candidate was silently dropped.

This is document selection/coverage evidence, not extracted business-rule quality or new graph
relationships. Validation documents remain candidates in this preview; their separate deterministic
evidence path and traversal-driven extraction remain T07b/T07c. No model/provider request or npm
publication is claimed; the consumer's live ten-minute retry remains unrun.

## T06 release-documentation consistency, 2026-10-27

Implemented after 0.5.0; publication remains separate. [ADR 022](ADR-022-release-documentation.md)
records the generated sections and explicit operational-document scope. The source/packed checks
use Node built-ins and run before publishing either package. Historical records, feature versions,
graph semantics, extraction identities and consumer caches are unchanged.

Focused checks passed: 33 release-documentation cases and three existing release-version cases.
They cover stale source/packed instructions, wrong package/archive/dependency versions, missing
documents, malformed markers, historical and CRLF preservation, multiline/inline examples,
dependency-free CLI operation from another cwd, and real Changesets patch/minor regeneration.
The actual release guide's marker-name explanation has its own regression. Independent review
also identified shared npx-cache reuse in the old smoke; the updated smoke isolates its npm cache,
requires both archive endpoints to be fetched, installs the documented archive pair and verifies
the resulting lockfile SHA-512 values against the prepared bytes.

Local `pnpm context-graph:publication-check` passed: 441 deterministic tests (17 core,
424 toolkit), one optional OML skip, 13 unchanged advisory architecture findings, source and
packed documentation, inventory, licenses and fresh packed-consumer checks. The smoke fetched
both prepared packages through its isolated npm/npx cache, ran the checked setup/config commands,
and installed the documented archive pair with matching lockfile versions and SHA-512 values.
Existing real TypeScript SCIP, RDF/SPARQL/SHACL, visualization and MCP checks also passed.
Independent implementation/integration review found no remaining blocker. All 79 original
source path/hash pairs are intact. No model/provider request, private consumer run or public npm
publication is claimed by this checkpoint.

[PR 35](https://github.com/jchewitt/weftlet/pull/35) merged at
`eb7a234479801ac3bca0b27974b8f729aff1c13a`. Exact feature head
`33b9cd38355e483c11f7fec1fcaf02dfd222da38` passed hosted Ubuntu and native Windows checks in
[run 40528744057](https://github.com/jchewitt/weftlet/actions/runs/40528744057).
Windows includes the new documentation regressions; the full packed-consumer gate ran on Ubuntu.
T06 is merged with a patch changeset; the verified npm release remains 0.5.0.

## 0.5.0 publication and installed-package acceptance, 2026-10-27

Published `@weftlet/core@0.5.0` and `@weftlet/toolkit@0.5.0` include T09
ten-minute timeout support and T05a identity preflight/validation phase timing.
`semantic.timeoutMs: 600000` is accepted; the default remains 120000. Retry limits,
cancellation, five-second authentication/discovery bounds and semantic artifact identities
are unchanged. This does not extend an outer CI/job timeout. The consumer's approved
ten-minute retry has **not run**; no live extraction result is claimed.

[Release PR 31](https://github.com/jchewitt/weftlet/pull/31) merged at
`55770d5ff83737131fcfd17ddba5b87dc22daca3`.
[Trusted publication run 40506053168](https://github.com/jchewitt/weftlet/actions/runs/40506053168)
completed preparation, publication and release records on attempt 1. Both versions are public
and tagged `latest`; downloaded registry archives are byte-identical to the reviewed archives.
npm provenance payloads identify the release commit and workflow attempt and match the archive
digests; this check does not claim separate cryptographic signature verification. The
[core](https://github.com/jchewitt/weftlet/releases/tag/%40weftlet/core%400.5.0) and
[toolkit](https://github.com/jchewitt/weftlet/releases/tag/%40weftlet/toolkit%400.5.0)
package tags and GitHub Releases resolve to the same commit. Hosted Ubuntu and Windows also
passed on that merged release commit in
[run 40506053117](https://github.com/jchewitt/weftlet/actions/runs/40506053117).

Completed upstream checks:

- Exact reviewed head `370f18a506a948c3148b50a3c3364383e1b88c32` passed `pnpm release:prepare`:
  408 deterministic tests (17 core, 391 toolkit), one optional OML skip, 13 unchanged advisory
  architecture findings, inventory, licenses and fresh packed-consumer checks. Hosted Ubuntu and
  Windows passed in [run 40504871916](https://github.com/jchewitt/weftlet/actions/runs/40504871916).
- Timeout fix [PR 33](https://github.com/jchewitt/weftlet/pull/33) merged at
  `795c67a24c5fffdb9c5c4d0cd1edab0ea2ae14bf`; exact source head
  `68be50451d522590a7fd9626c1f6d3edd1acf5ca` passed
  [run 40504193435](https://github.com/jchewitt/weftlet/actions/runs/40504193435).
- Independent export review approved both archives: core 13 files/8,215 compressed bytes,
  toolkit 218 files/254,008 compressed bytes. All 229 non-manifest files match reviewed
  source/build bytes; 293 relative module references resolve. Compiled configuration contains
  the 600000 ceiling, and T05a assets and exports are present. Core has no runtime dependencies;
  toolkit requires core `^0.5.0`. Licenses/NOTICE/third-party attribution and all 79 original
  source path/hash pairs are intact. No forbidden local-state entries or credential-signature
  matches were found.
- Hosted artifact `12734837678` from release commit `55770d5ff83737131fcfd17ddba5b87dc22daca3`
  contains package archives byte-identical to those independently reviewed locally.
- An offline Linux/Node 24.19.0 rehearsal installed the exact reviewed archives with lifecycle
  scripts disabled. Its deterministic local provider received timeout 600000, with real SCIP
  and full SHACL. It produced 54 total facts including 24 SCIP facts, and 53 impact-query facts.
  Cold hydration extracted two artifacts; repeat hydration reused both with unchanged snapshot
  identity, content digest and stored bytes. T05a positive/negative preflight and SHACL, exact
  attribution, phase events and provider-unavailable saved queries/preview passed.
- Fresh public-registry installation passed on Linux/Node 24.19.0 with lifecycle scripts disabled.
  Both lockfile registry URLs and SHA-512 values match the reviewed archives. The installed CLI
  accepted 600000 and the deterministic module verified receiving it. The committed public fixture
  produced 54 total facts, including two semantic facts, four contract consumers, 24 real SCIP facts and
  two public adapter facts; the impact query returned 53 facts. Cold hydration extracted two
  artifacts; repeat hydration extracted zero and reused both with identical snapshot identity,
  content digest and stored bytes. Positive/negative preflight and full SHACL, exact attribution
  without mutation, and phase events passed. Removing the provider module preserved no-model
  preview and saved queries with no additional provider calls. Fixture commit:
  `f61e05a8f437097ebc6eeb966f6eda2b8bb12008`; content digest:
  `d975795c1324795ef4d144ca803d225c5059c229063c9f0514c006ed310378c4`.

The fixture does not run Codex/API requests, wait ten minutes or establish private consumer
acceptance. T06/T07 and broader T05 work remain open. Entries below are historical checkpoints;
their publication status and counts describe the time of each check.

| Package | Reviewed and public SHA-512 integrity |
| --- | --- |
| `@weftlet/core@0.5.0` | `sha512-JM+wBBaGQewwlEHtVDW1bBqMdeTNTnoR9JoqRkJ8t2onK4UPZsoEWho65wtX7UlPlIL/tu975VovJps9xmjuhA==` |
| `@weftlet/toolkit@0.5.0` | `sha512-7CgqoFX7qjTtK4SEX3+EYC30L0vE69H1gVGPLqbeSwVp176QIrAMA9qsjFzevdLVyPk/mLMp5of4vUXWyobITQ==` |

## Ten-minute timeout blocker, 2026-10-27

The maintainer reports that published 0.4.0 rejects the approved `semantic.timeoutMs: 600000`.
The consumer's ten-minute retry has **not run**. This is a configuration ceiling defect, separate
from the corrected physical-file kinds and earlier positive consumer update below.

The source patch raises only the accepted maximum from 300000 to 600000 ms. Omitted timeout
still defaults to 120000; finite positive integer validation, retries, cancellation and the
separate authentication/discovery limits are unchanged. No provider/prompt/artifact identity
changes or forced model re-extraction are introduced.

Focused checks pass: config acceptance/boundary rejection, Codex propagation across retries,
per-call override/cancellation, a cancellable module deadline, and real artifact reuse/preview
after an interrupted run switches to 600000. The provider tests use an injected runner/local
module and finish immediately; they are not a live ten-minute extraction. Independent review
found no blocker. Local `pnpm context-graph:publication-check` passed: 408 deterministic tests
(17 core, 391 toolkit), one optional OML skip, 13 unchanged advisory architecture findings,
inventory, licenses and fresh packed-consumer checks. The installed CLI accepts 600000 in
no-model preview and reports the same limit on an immediate missing-provider failure.
All 79 original source path/hash pairs remain intact. Hosted checks and publication are recorded
after completion; the consumer's live ten-minute retry remains unrun.

## Consumer update after 0.4.0, 2026-10-27

The maintainer reports that the consumer updated and appears to be working. This is positive
consumer feedback after the T08 release. No exact consumer commit, graph scope, adapter test
report, full-run timing or repeated-hydration report was supplied with that update, so those
detailed acceptance results remain unrecorded. No private consumer files were inspected or changed.

## T05a identity preflight and validation phase timing, 2026-10-27

Implemented in development source after 0.4.0; no new publication is claimed.
[ADR 021](ADR-021-identity-preflight-and-validation-timing.md) records the bounded scope:
complete identity/kind attribution before compilation/RDF, explicit local diagnostic detail,
and elapsed phase boundaries. Full SHACL shapes, accepted facts and cache identities are unchanged.

- Twelve pure preflight cases pass: both endpoints, cross-source kinds, conceptual IDs,
  duplicates/self-references, all late conflicts, exact copied provenance/authority, absent
  authority preservation and opaque defaults including unknown kinds. A pass explicitly says
  `shaclValidated: false`; it does not infer canonical classification or approved intent.
- Two hydration composition cases pass with actual committed file/contract/document producers
  and a deterministic semantic provider. A kind conflict skips compilation, invariants and RDF;
  previous head/snapshot and completed artifact bytes remain intact. Correcting the fixture
  reuses the artifact and runs full SHACL. Invalid confidence with consistent kinds still fails
  real SHACL. Indexing is stubbed in these scheduling cases; real SCIP is covered separately.
- Four CLI subprocess cases pass with real SCIP and public adapters: default human/JSON privacy,
  explicit exact attribution, empty failure stdout, preserved artifacts/snapshots, overlay detail
  propagation and valid full-validation timing. The existing four semantic-failure CLI cases pass.
- All 26 full SHACL parity/timing cases pass, including original named-dataset positive/negative
  equivalence and the 2,200-fact late failure. Phase events do not change verdicts or serialization;
  completed means the operation returned, not that its graph conformed.
- Local `pnpm context-graph:publication-check` passed: 403 deterministic tests (17 core,
  386 toolkit), one optional OML skip, 13 unchanged advisory architecture findings, inventory,
  licenses and fresh packed-consumer checks. The installed public API detects kind conflicts,
  preserves exact opt-in citations, reports phase timing and still rejects the same pair under
  full SHACL. All 79 original extraction source path/hash pairs remain intact.
- Independent runtime/test review found no blocker. No live model or private consumer
  performance result is implied.

[PR 30](https://github.com/jchewitt/weftlet/pull/30) merged at
`c8db1f0b871f5e6f3d1d2e9eda1b045aa45469df`. Exact feature head
`dc01421aa3953963e411430266b9035f2852cfd8` passed hosted Ubuntu and native Windows checks
in [push run 40451305862](https://github.com/jchewitt/weftlet/actions/runs/40451305862) and
[PR run 40451332221](https://github.com/jchewitt/weftlet/actions/runs/40451332221).
T05a is merged but unpublished; npm 0.4.0 remains the verified public release.

A bounded public profile ran the unique-node fixture in three fresh processes: 500 facts,
the same 500 facts again, then 501 facts. Command: `node scripts/benchmark-shacl.mjs --counts 500
--topologies unique --modes optimized --deadline-ms 15000` (use 501 for the final case), after
`pnpm build`. Linux x64, Node 24.19.0, N3 2.7.2 and rdf-validate-shacl 0.6.5; built RDF module
SHA-256 `8a66e0266d812b742103d42de3572faf4ab9873d0f37424b563962ea7473fae1`.

| Facts / nodes | Preflight ms | RDF construction ms | Union ms | SHACL ms | Process peak RSS KiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| 500 / 1,000 | 0.84 | 67.90 | 32 | 186 | 330,496 |
| 500 / 1,000 repeat | 0.74 | 57.15 | 32 | 174 | 334,356 |
| 501 / 1,002 | 0.74 | 59.88 | 54 | 185 | 333,584 |

All three ran full validation and preserved serialization; the repeated input's serialization
digest matched, and the added-fact digest differed. These single-run smoke measurements establish
phase visibility, not a speedup or production capacity. RSS includes imports, fixture and
serialization; no successful-result reuse or dependency-aware incremental validation was used.

## 0.4.0 publication and installed-package checks, 2026-10-26

`@weftlet/core@0.4.0` and `@weftlet/toolkit@0.4.0` ship T03 operational cache reuse,
T04 semantic failure diagnostics and T08 canonical physical-file kinds. This is an upstream
release; private consumer adapter migration and full hydration acceptance remain pending.

[Release PR 23](https://github.com/jchewitt/weftlet/pull/23) merged at
`9c6c2625ce2f5d3a28d2be40610130c745b416d4`. Trusted publishing
[run 40421791942](https://github.com/jchewitt/weftlet/actions/runs/40421791942)
completed preparation, publication and release records on attempt 1. Both versions are public
and tagged `latest`; downloaded registry archives are byte-identical to the independently
reviewed archives. npm provenance identifies that merge commit and workflow attempt. The
[core](https://github.com/jchewitt/weftlet/releases/tag/%40weftlet/core%400.4.0) and
[toolkit](https://github.com/jchewitt/weftlet/releases/tag/%40weftlet/toolkit%400.4.0)
package tags and GitHub Releases resolve to the same commit.

- Exact reviewed version head `8ea26c7f538202b4acb67ceeda6adbf220a85e93` passed
  `pnpm release:prepare`: 384 deterministic tests (17 core, 367 toolkit), one optional OML skip,
  13 advisory architecture findings, inventory, licenses and fresh packed-consumer checks.
  Hosted Ubuntu and native Windows checks passed in
  [run 40421253221](https://github.com/jchewitt/weftlet/actions/runs/40421253221).
- Independent source/archive review found no release blocker. Core contains 13 files/8,212 bytes;
  toolkit contains 213 files/244,424 bytes. Archive digests match the reviewed manifest; all
  non-manifest files match the reviewed checkout. Public exports, CLI/runtime assets, Apache-2.0
  licenses and attribution are present. Core has no runtime dependencies; toolkit requires
  core `^0.4.0`. No forbidden local-state entries or credential-signature matches were found.
  All 79 original extraction source path/hash pairs are unchanged.
- A separate offline rehearsal installed those exact archives with lifecycle scripts disabled.
  Its public fixture produced 54 facts, including four contract consumers, 24 SCIP facts and two
  public adapter facts. Strict SHACL, immutable repeat reuse and provider-unavailable saved reads
  passed. This rehearsal is distinct from public-registry acceptance.
- Fresh public-registry installation passed on Linux/Node 24.19.0 with lifecycle scripts disabled.
  Its lockfile registry URLs and SHA-512 values match the reviewed archives. The committed public
  fixture produced 54 total facts, including two semantic facts, four contract consumers, 24 real SCIP facts,
  two public adapter facts and nine document facts; the impact query returned 53 facts.
  Cold hydration extracted two artifacts; repeat hydration extracted zero and reused both with
  identical snapshot identity, content digest and stored bytes. Removing the provider module
  preserved no-model preview and saved queries, with no additional provider invocations.
  Fixture commit: `41d0c4fa68f7a358d52471dbbd2a6186adb22fa5`; content digest:
  `f5a8fbde346d070074164edf970bfd98246c4e34718b43f5850757501daf50ca`.

The installed-package fixture uses a deterministic public provider, actual contract/document
extractors, real TypeScript SCIP and a public adapter that imports only the core file factory.
It checks retained citations, digests and authority, strict RDF/SHACL, projection/query results,
repeat artifact reuse and unchanged snapshot bytes. It makes no live model calls and does not
establish private adapter correctness, semantic quality or the consumer's full-graph performance.
The T03/T04 test checkpoints below remain the evidence for operational Codex cache partitioning
and structured failure handling; ordinary fixture reuse is not a substitute for those tests.

Reviewed and public archive integrity:

| Package | SHA-512 integrity |
| --- | --- |
| `@weftlet/core@0.4.0` | `sha512-hNiLpfFaL/o+uQJlRdW+jN/cdMIY8QxTAgwTA7F1kN8f1KhHWH8qsxc4RgC8mP+4huLsWLk8m0v14xrq5prMdA==` |
| `@weftlet/toolkit@0.4.0` | `sha512-UrHRBuz3v7Olfqk0iaSyvZ1+9xnCHMAjh0ZGj+HWde4zAR0M2zEHjeOxkyC2B2d63gPAqttlQ5kzpauRdfd0Jg==` |

## T08 deterministic physical-file kinds, 2026-10-26

Implemented after 0.3.0; this checkpoint does not claim npm publication or private consumer
acceptance. [ADR 020](ADR-020-canonical-physical-file-producers.md) separates the neutral fix from
the consumer-owned framework adapter migration. The reported 120-ID partition is consumer
evidence; the upstream tests below are independent public reproductions, not that private replay.

- Local `pnpm context-graph:publication-check` passed: 384 deterministic tests (17 core,
  367 toolkit), one optional OML skip, 13 advisory architecture findings, inventory, licenses and
  fresh packed-consumer checks. No rule, baseline, exception or SHACL shape was relaxed.
- Sixteen new core cases verify the exported pure physical-file mapping, exact path spelling,
  document/test/production distinctions and absence of inferred existence or intent. The package
  retains no runtime package dependencies. Its public JS/declaration assets are required in the archive.
- Three public composition cases use actual file and contract extraction from committed Prisma
  schema/production/spec/test/Markdown consumers, actual bundled SCIP indexing and document links.
  They assert exact retained citations/digests, confidence, authority and conceptual contract IDs.
  A kind-only historical control restores the old Component label on an actual test-consumer fact
  and fails strict SHACL; unchanged current producer output conforms. This control is not claimed
  as execution of the installed 0.3.0 package. A public adapter-shaped fixture imports only core's
  factory for its physical nodes; it is not the private framework implementation.
- The overlay case reindexes real source changes without routing configured, retains canonical
  kinds/draft authority, and proves its new identity differs from the frozen 0.3.0 formula.
  A separately labeled retained-inference fixture still fails strict SHACL when incompatible;
  previous heads, snapshots and assertion bytes remain intact. It is neither rewritten nor suppressed.
- Routing and governance regressions compose real producer facts with neutral extraction and
  strict SHACL. They retain routing binding IDs, provenance/authority and architectural attributes;
  document endpoints join canonical Document identities, test files remain Evidence, and business
  module/contract identities stay separate. Governance analyzer 3 differs from the frozen prior ID.
- Twelve compatibility cases reject old/missing assembly, contract, SCIP-fact and configured
  routing metadata for current validation. Production application tests still query historical
  facts unchanged at the same commit/configuration, label extraction incompatibility separately
  from checkout staleness, and invoke no provider, indexer, hydration or graph refresh.
- Existing hydration/reuse/rename/delete tests pass with graph-v7 and preserve older snapshot
  records. Semantic artifact/provider/prompt identity stays unchanged; no model call or private
  cache rewrite is required by this deterministic fix. Non-document model kinds remain unreviewed
  assertions and can still fail strict SHACL; this increment does not silently reinterpret them.
- Fresh packed installation checks a public `@weftlet/core` adapter import against actual neutral
  contract test-consumer facts, strict SHACL, real SCIP, RDF/SPARQL projection, CLI/npx and MCP.
  Independent review found no remaining blocker. All 79 original source path/hash pairs are intact.

[PR 27](https://github.com/jchewitt/weftlet/pull/27) merged at
`7b3b0a4af260a6fa70f1107b3c5c315826c22c0e`. Exact feature head
`493c68faada31f35e4c7dd5d047e70ac5c96b2ad` passed hosted Ubuntu and native Windows checks
in [push run 40420049204](https://github.com/jchewitt/weftlet/actions/runs/40420049204) and
[PR run 40420084937](https://github.com/jchewitt/weftlet/actions/runs/40420084937).
Publication is pending the separately reviewed 0.4.0 release. No private application files
or installed consumer packages were modified. The consumer must upgrade both released packages,
migrate/version its framework extractor, run composed adapter tests, then complete full hydration
and repeat acceptance before its adoption blocker can be declared resolved.

## T04 semantic failure diagnostics, 2026-10-26

Implemented in development source after 0.3.0; no new npm publication is claimed.
[ADR 019](ADR-019-semantic-failure-diagnostics.md) records the safe failure envelope, opaque
source correlation, settled progress and recovery boundaries. T04 does not change prompts,
artifact keys, source/assertion authority, timeout defaults or graph validation.

- Local `pnpm context-graph:publication-check` passed: 351 deterministic tests (1 core,
  350 toolkit), one optional OML skip, inventory, licenses and fresh packed-consumer checks.
- 20 new application cases use committed public fixtures and real artifact/snapshot storage.
  They cover retained completed work, resumed reuse, cache hits, timeout/root-cause ordering,
  synchronous sibling cancellation, late provider results, in-flight writes, late storage failure,
  cancellation between sources and final completed/remaining counts. The previous snapshot/head
  remains intact after failure. An injected Codex runner verifies elapsed time across retries
  is separate from the configured per-attempt limit; no real model is called.
- Unknown provider messages, private abort reasons and unrecognized error codes are excluded
  from public reports. Missing infrastructure, invalid output, unresolved mappings, low confidence
  and cache problems retain distinct safe diagnoses. The existing RDF regression now checks the
  typed unresolved-policy error and unchanged prior head; its positive, missing-link, contradiction
  and full SHACL checks remain in place.
- Four CLI subprocess cases cover actual module timeouts, unknown module errors, missing provider
  infrastructure, source-ID mapping through local preview, progress/error privacy, empty failure
  stdout, JSON-only stderr with `--quiet`, and preserved previous snapshot bytes. The installed
  consumer verifies public error/helper exports, required runtime assets, matching preview IDs and
  safe structured failure from an unavailable provider. Existing installed CLI/npx, real SCIP,
  RDF/SPARQL/SHACL, viewer and MCP initialization/missing-snapshot checks pass.
- Governance reports 13 advisory findings: the 12 prior findings plus a new `semantic.ts` size
  signal (510 nonblank/noncomment lines against the 500-line threshold). Independent review
  considered the addition; scheduling/reporting is separated into its own module. The warning
  remains visible. No rule, baseline or exception was changed; line count is not proof of
  modularity or a product violation.
- Independent review found no remaining blocker. All 79 original source path/hash pairs are
  unchanged. [PR 25](https://github.com/jchewitt/weftlet/pull/25) merged at
  `a919b82eab35808985d5c497bbe59ccfcba8bfcb`. Exact feature head
  `a755dcdd2c0f97a7507f02f64b907a231162bf78` passed hosted Ubuntu and native Windows checks
  in [push run 40417172248](https://github.com/jchewitt/weftlet/actions/runs/40417172248)
  and [PR run 40417209468](https://github.com/jchewitt/weftlet/actions/runs/40417209468).
  Both runs completed successfully; the Windows suite includes the new application/CLI failure
  tests and existing provider/process tests, plus inventory and license checks.

These checks use public deterministic fixtures and local child processes, not live models or
private consumer data. Genuine consumer acceptance remains separate. Native Windows is covered
by the hosted runs above; the local run is Linux/Node 24.19.0/pnpm 10.18.2.
Published packages remain at 0.3.0 at this checkpoint. Broader T05, T06 and T07 remain separate
1.0 increments.

## T03 operational semantic-cache reuse, 2026-10-26

Implemented in development source after 0.3.0; no new npm publication is claimed here.
[ADR 018](ADR-018-operational-semantic-cache.md) records the built-in Codex user-cache partition,
the five operational settings that may share artifacts, and conservative custom-provider behavior.
Snapshot profiles, full configuration digests, workspace paths and the 0.2.1/0.3.0 artifact-key
contract remain unchanged. No credential environment values are read to construct cache identity.

- [PR 22](https://github.com/jchewitt/weftlet/pull/22) merged at
  `5b889854e8a4b3a84653770e3244dee39d4b7d37`. Exact feature head
  `c92689699fb09c80246edd61b692fca086ff6e83` passed hosted Ubuntu and focused native Windows
  checks in [push run 40411921483](https://github.com/jchewitt/weftlet/actions/runs/40411921483)
  and [PR run 40411954882](https://github.com/jchewitt/weftlet/actions/runs/40411954882).
  Both runs completed successfully; Windows includes all four new cache test suites plus
  inventory and license checks. Independent review found no remaining blocker. All 79 original
  source path/hash pairs remain unchanged.
- Local `pnpm context-graph:publication-check` passed: 327 deterministic tests (1 core,
  326 toolkit), one optional OML skip, 12 existing advisory architecture findings, inventory,
  licenses and fresh packed-consumer checks. No new architecture baseline or exception was added.
- 28 configuration cases distinguish supported operational/default settings from model/policy/
  authentication descriptors, unknown fields, repository/checkout and custom-provider changes.
  The full snapshot storage profile still changes when its configuration changes.
- 11 integration/storage cases cover an interrupted run followed by a longer timeout: the
  completed source is reused, the unfinished source is extracted, and the new snapshot records
  the complete current configuration. Old-configuration evidence fails current snapshot checks;
  a saved query can still label it as historical. An actual application hydration uses real
  bundled SCIP and cached semantic artifacts with a tripwire against unexpected Codex calls.
- Legacy fixtures independently reproduce the frozen 0.3.0 profile/key formulas. Planning
  neither copies artifacts nor creates directories; hydration promotes only validated entries
  from the exact compatible legacy profile. Unrelated profiles and incomplete temporary files
  are ignored. Old artifact bytes, raw output and provenance remain intact.
- 21 adoption cases exercise explicit previous-config recovery, dry-run/index/filesystem
  preservation, current and historical agent scope, budgets, source changes and omitted coverage.
  Incompatible policies, authentication descriptors, unknown fields, providers and checkouts are
  refused. Corrupt, unreadable and conflicting entries are reported without overwriting them.
- Concurrent-writer tests cover matching/different outputs and malformed identity metadata with
  a deceptively matching output-digest field. Both adoption and hydration promotion fully inspect
  the retained entry before claiming success. Forced extraction preserves the old artifact.
- Three CLI subprocess cases verify that adoption runs before provider/adapter initialization,
  preserves the active checkout, supports historical refs, rejects malformed invocation, and
  returns structured nonzero results for cache or budget problems. The fresh packed consumer
  checks the public API/runtime helpers and installed adoption command with unavailable provider
  and adapter modules; its dry run selects the committed source without storage writes.

These are public deterministic fixtures, including an injected Codex runner, not live model
extractions or private consumer acceptance. Existing full SHACL and fresh snapshot publication
remain required after cache reuse. Published packages remain at 0.3.0 at this checkpoint;
the minor changeset is pending a separate release. T04 timeout diagnostics and the remaining
1.0 work are separate increments.

## Weftlet 0.3.0 preview and SHACL performance release, 2026-10-26

T02 and the focused cold-validation portion of T05 shipped ahead of the remaining 1.0 work.
Both `@weftlet/core@0.3.0` and `@weftlet/toolkit@0.3.0` are public npm `latest` at this
checkpoint. Core advances with the fixed release group and has no code change in this release.

- [Preview PR 18](https://github.com/jchewitt/weftlet/pull/18) merged at
  `63c70f85b26a6cc60f8bc0615a86f6042a61ecd0`.
  [SHACL PR 20](https://github.com/jchewitt/weftlet/pull/20) merged at
  `e45fda59037293a6ded20da70b812bbd385500a5`. Its final head
  `ec7bb87ea3287a6322eeb09fa72ba53b3f1eec4e` passed hosted Ubuntu and focused Windows
  checks in [run 40402839679](https://github.com/jchewitt/weftlet/actions/runs/40402839679)
  and [run 40402826889](https://github.com/jchewitt/weftlet/actions/runs/40402826889).
- [Release PR 19](https://github.com/jchewitt/weftlet/pull/19) advanced both versions to 0.3.0.
  Exact head `897e731222180cc58ccf8acfe9cc2cd6252245b5` passed local `pnpm release:prepare`
  and [dispatched Ubuntu/Windows checks](https://github.com/jchewitt/weftlet/actions/runs/40403315203).
  The bot's automatic PR run required GitHub approval and ran no jobs; the explicit dispatch
  validated that same head. The version PR contains only generated release metadata/changelogs
  and consumed changesets, with no implementation changes.
- [Trusted-publishing run 40403950446](https://github.com/jchewitt/weftlet/actions/runs/40403950446)
  completed preparation, publication and release records on attempt 1 at merged commit
  `ffc332adb84b8f9e854370ff4799aab32e189356`. Both package-specific tags and GitHub Releases
  identify that commit, and main's package versions agree with npm.
- Local publication checks passed 264 deterministic tests (1 core, 263 toolkit), one optional
  OML skip, 12 existing advisory architecture findings, inventory, licenses and fresh packed-consumer
  CLI/npx/MCP, preview, real SCIP, RDF/SPARQL/SHACL and viewer checks. Independent code review
  found no remaining blocker. No shape, assertion, baseline or exception was removed or added to
  conceal a failure. The 79 original source path/hash pairs remain unchanged.
- Independent archive review covered core's 11 entries and toolkit's 196 entries. Runtime assets,
  declarations, examples, README, Apache license and attribution/notices are present. No Git state,
  credentials, caches, private consumer payloads or compiled tests were included. Toolkit's packed
  core dependency is `^0.3.0`. Public archives match both the hosted prepared archives and locally
  reviewed archives byte for byte. Public SLSA provenance subjects match their SHA-512 hashes and
  identify the expected source, repository, `publish.yml` and workflow attempt. This is a provenance
  content/source check, not a separate cryptographic signature audit.
- A fresh Linux/Node 24.19.0 consumer installed only toolkit 0.3.0 directly from npm with
  `--ignore-scripts`; core resolved transitively to 0.3.0. Both package-lock registry URLs and
  integrity hashes matched the reviewed archives. The public two-document fixture retained
  2 semantic facts within 17 total facts, including 4 real SCIP facts. Impact returned 17 facts;
  SPARQL returned four canonical document references. Cold hydration extracted 2/reused 0;
  the repeat extracted 0/reused 2 with identical snapshot identity, content digest and bytes.
- Installed cold/warm `hydrate --plan --json` worked with the provider module unavailable,
  reported 2 expected extractions then 2 reusable artifacts, preserved source authority and
  performed no preview storage writes or provider calls. Saved queries still worked with the
  provider disabled. Hydration used a deterministic fixture provider; no external model calls
  were made during these checks.

The installed public `RdfEvidenceGraph.validate()` also passed bounded, fresh-process public
synthetic checks, preserving exact canonical serialization:

| Facts / topology | Original quads | Validation including union | Whole-process maximum RSS |
| --- | ---: | ---: | ---: |
| 2,000 unique | 56,003 | 0.632 s | 492 MiB |
| 10,000 unique | 280,003 | 2.903 s | 1,640 MiB |

These are single-run synthetic measurements. Memory includes imports, fixtures and serialization;
the extra union has a material memory cost. This installed-package probe ran on Linux; hosted
Windows covers the new parity tests separately. Neither establishes the private consumer's total
generation time. Full consumer hydration/repeat acceptance, live semantic quality, broader T05
progress/reuse work and the remaining [1.0 tasks](RELEASE-1.0-PLAN.md) remain open. The SHACL
change preserves compatible 0.2.1 semantic artifacts and does not require forced re-extraction.

## T05 cold SHACL validation improvement, 2026-10-26

Pre-release source checkpoint following the T02 preview merge; npm was still at 0.2.1.
The subsequent 0.3.0 publication is recorded above. [ADR 017](ADR-017-shacl-validation-union.md)
records the measured graph-wildcard lookup cost and the temporary all-triples union used by the
unchanged JavaScript SHACL validator. The canonical named dataset and every assertion remain intact.

Public synthetic production measurements use Linux/Node 24.19.0, N3 2.7.2 and
rdf-validate-shacl 0.6.5. Each case ran once in a fresh child process with a 45-second hard deadline:

| Facts / topology | Nodes / original quads | Canonical construction | Production validation, including union | Whole-process maximum RSS |
| --- | --- | ---: | ---: | ---: |
| 2,000 unique | 4,000 / 56,003 | 0.194 s | 0.779 s | 490 MiB |
| 10,000 unique | 20,000 / 280,003 | 1.091 s | 2.920 s | 1,638 MiB |

Both production cases conform and retain the exact before/after serialized dataset digest.
The original-path public experiment measured 31.502 seconds of SHACL for the 2,000-fact unique
case; its 5,000-fact shared case produced no verdict before the 45-second process deadline.
The ADR records those separate prototype measurements and their boundaries. These are single-run
measurements, not latency guarantees or a reproduction of the consumer's complete 30-minute run.
Memory includes libraries, fixture generation and before/after serialization; the production
harness peaked near 1.6 GiB at 10,000 unique facts. Its legacy comparison also reparses a second
named store, so its RSS must not be treated as an old-versus-new production memory comparison.

Reproduce from a built source checkout with
`pnpm benchmark:shacl --counts 2000,10000 --topologies unique --modes optimized`.
The bounded harness records runtime, build hashes, sizes, phase timings, conformance and
serialization preservation. It exercises the public production validator; no private-store mutation,
provider call or private consumer data is used. A small paired legacy/optimized smoke agreed;
a 1 ms deadline probe killed the children and correctly reported no verdict.

Local `pnpm context-graph:publication-check` passes: 264 deterministic tests (1 core,
263 toolkit), one optional OML skip, 12 existing advisory architecture findings, source inventory,
licenses and fresh packed-consumer CLI/npx/MCP, preview, real SCIP, RDF/SPARQL/SHACL and viewer
checks. All 79 original source path/hash pairs remain unchanged. No architecture baseline or
exception was added. The new internal shape module is required in the packed runtime inventory.

The 25 new regressions compare complete normalized diagnostics with direct validation of the
original named dataset. Cases cover empty/duplicate input, kinds, authorities, confidence and
citation bounds/types/order, empty provenance fields and colliding fact IDs. Separate assertions
preserve exact serialization, named-graph attributes/citations/review state and `facts()` through
repeated validation. A 2,200-fact case detects the invalid final assertion without timing gates.
The existing full hydration integration still verifies that failed SHACL preserves the last head.
The shape Turtle is byte-for-byte unchanged from the T02 merge; no shape or assertion was dropped.

Hosted checks and release status were pending at this source checkpoint; their results are above.
Early identity preflight, in-phase progress, validation-result reuse and incremental validation
remain separate work. Each hydration still performs full SHACL before publishing; saved queries
do not repeat validation. Private consumer full hydration/repeat acceptance remains pending.

## T02 no-model hydration preview, 2026-10-26

Pre-release source checkpoint, while npm was still at 0.2.1. Subsequent 0.3.0 publication is above. See
[ADR-016](ADR-016-hydration-preview.md) for source, cache and readiness semantics.

[PR 18](https://github.com/jchewitt/weftlet/pull/18) merged at
`63c70f85b26a6cc60f8bc0615a86f6042a61ecd0`. Its final head
`6711362f9ff234d65ac3101dcf3ec0b0033519ec` passed hosted Ubuntu and Windows checks in
[run 40400487168](https://github.com/jchewitt/weftlet/actions/runs/40400487168) and
[run 40400478490](https://github.com/jchewitt/weftlet/actions/runs/40400478490).
An earlier Ubuntu run exposed a temporary-fixture cleanup race; disabling automatic Git
maintenance in that fixture and bounded cleanup retries resolved it before merge.

- Local `pnpm context-graph:publication-check` passed: 239 deterministic tests (1 core,
  238 toolkit), one optional OML skip, 12 advisory architecture findings, inventory, licenses
  and fresh packed-consumer checks. No additional architecture baseline or exception was added.
- Ten independent-repository planner cases cover exact committed bytes despite dirty/untracked
  files, unchanged Git index and filesystem hashes, approved sources versus unreviewed assertions,
  explicit evidence-root classification, empty selection, cold/warm/forced cache, malformed or
  unreadable artifacts, output-digest corruption, budgets, duplicate IDs, missing selectors and
  historical agent selection with explicit omissions. The warm test independently checks the
  literal released 0.2.1 key formula, then verifies actual SemanticHydrator reuse.
- Two real-process CLI cases cover human/JSON output, blocked and warning-only exit codes,
  historical refs and force preview. Side-effecting provider/adapter modules are never imported;
  unavailable Codex/SCIP/OML configuration does not prevent planning. Source bodies/raw provider
  output are excluded from the plan. No snapshot or artifact directory is created by preview.
- Existing hydration rename/delete tests still pass, including removal of the last document.
  Explicit empty semantic scope now performs zero semantic extraction even with committed docs
  present. New graph-v6 snapshots remain distinct from old assemblies; valid semantic cache keys
  and output digests retain the 0.2.1 contract.
- A fresh packed consumer exercises installed `hydrate --plan --json` with absent provider and
  repository adapter modules, selects its committed document, reports one expected extraction,
  and creates no graph storage. The public planner export and every runtime helper are present.
  The remaining installed smoke covers real SCIP, RDF/SPARQL/SHACL, visualization and MCP.
- Independent review found and resolved an initial selector-gating regression: unmatched selectors
  are warnings, preserving deletion behavior. Incomplete preview scope needs review and exits 1;
  it does not establish a new execution policy. No blocking review finding remains.

No paid/live model call, npm publication or private source-application change was made for T02.
Recursive document coverage and operational-config cache reuse remain separate. This increment
does not optimize SHACL. The maintainer's report that validation pushes generation past a
30-minute timeout makes [T05](RELEASE-1.0-PLAN.md#t05--detect-inexpensive-conflicts-early-and-explain-validation-work)
the next focused release priority; no consumer timing diagnosis is claimed here.

## Weftlet 0.2.1 document identity patch, 2026-10-26

The public reproduction confirms the reported 0.2.0 defect: two unchanged semantic
assertions give one repository document ID different kinds and fail single-kind SHACL.
[ADR-015](ADR-015-repository-document-identity.md) records the canonical identity policy,
cache contract and immutable snapshot migration. The consumer follow-ups are tracked in
the [1.0 plan](RELEASE-1.0-PLAN.md).

[Fix PR 15](https://github.com/jchewitt/weftlet/pull/15) was validated at
`42ba9b79dc0562a412cd5a048e42b77234530d94` by both hosted Ubuntu/Windows runs
[40381728487](https://github.com/jchewitt/weftlet/actions/runs/40381728487) and
[40381772577](https://github.com/jchewitt/weftlet/actions/runs/40381772577).
[Release PR 16](https://github.com/jchewitt/weftlet/pull/16) advanced both package versions
to 0.2.1. Its exact head `da07772110d4c762e3178a7345b426263e14a22f` passed local
`pnpm release:prepare` and the explicitly dispatched
[Ubuntu/Windows checks](https://github.com/jchewitt/weftlet/actions/runs/40382270147).
The bot PR's separate automatic run required GitHub approval; the dispatched run tested
that same commit and completed successfully.

[Trusted-publishing run 40382864083](https://github.com/jchewitt/weftlet/actions/runs/40382864083)
completed on attempt 1 at merged commit `5d1db91bf19ed493a20849b2d0f92d3aeac35dfe`.
Both public npm `latest` tags resolve to 0.2.1. Package tags `@weftlet/core@0.2.1`
and `@weftlet/toolkit@0.2.1`, plus their GitHub Releases, identify that exact commit.
Main's package versions match the publication.

- Local `pnpm context-graph:publication-check` passed: 227 deterministic tests (1 core,
  226 toolkit), one optional OML skip, 12 advisory architecture findings, inventory,
  licenses and a fresh packed-consumer CLI/npx/MCP, real SCIP and RDF/SHACL smoke.
- The new public regression uses two committed source documents and a deterministic
  module provider that reproduces the conflicting classifications. Both semantic facts
  retain their citations, confidence and separate source/assertion authority; deterministic
  document links and SPARQL join the canonical document. Real TypeScript indexing and
  SHACL pass. Fresh extraction reports 2 extracted/0 reused; repeat reports 0/2 with
  identical snapshot identity/content digest. Raw provider output is preserved byte for byte.
- Seeded artifacts using the released 0.2.0 cache-key formula are not reused or overwritten.
  Historical graph-v4 snapshot bytes remain unchanged and readable. Subject references
  normalize too; unrelated concept-kind conflicts still fail SHACL. A missing document
  mentioned in plain prose retains a cited implementation-gap diagnostic.
- Independent review found and resolved that missing-path diagnostic regression. No blocking
  findings remained. All 79 original imported source paths and source hashes are preserved.
- Independent release review inspected the actual core/toolkit archives (11/184 file entries),
  generated versions, changelogs and plan. Runtime assets, public examples and licenses/notices
  are present; no Git history, credentials, caches or private consumer report data were included.
  The packed toolkit dependency is `@weftlet/core: ^0.2.1`.
- Public npm archives match the hosted prepared archives and locally reviewed archives byte
  for byte. Public SLSA provenance subjects match the SHA-512 archive hashes and identify this
  source commit, repository, `publish.yml` and workflow attempt. This checks provenance content
  and source identity, not a separate cryptographic signature audit.
- A fresh Linux/Node 24.19.0 public-registry consumer installed only toolkit 0.2.1 directly
  (`npm install --ignore-scripts`); core resolved transitively to 0.2.1. Both package-lock
  registry URLs and integrity hashes matched the reviewed archives. The installed CLI
  initialized and validated an independent public fixture with two source documents. A
  deterministic provider reproduced the legacy conflicting classifications: hydration retained
  2 semantic facts within 17 total facts, including 4 real SCIP facts, and SHACL conformed.
  Cold hydration extracted 2/reused 0; the repeat extracted 0/reused 2 with unchanged snapshot
  identity, content digest and bytes. Impact returned 17 facts and SPARQL returned the four
  canonical document references. Saved queries still worked after the provider was disabled.
  No live model call was made.

These are deterministic upstream checks, not live semantic-quality or private consumer
acceptance results. The consumer's full hydration was stopped after its isolated reproduction;
no complete consumer SHACL verdict or published snapshot is claimed. Full-graph validation
latency remains a separate investigation. The first refresh requires new semantic extraction;
historical cache/snapshot files should be retained. T01's upstream patch is published, while
genuine consumer acceptance and the remaining T02–T07 work are still pending.

## Weftlet 0.2.0 publication, 2026-10-26

The maintainer authorized publication of both packages. [Release PR 4](https://github.com/jchewitt/weftlet/pull/4)
committed their `0.2.0` versions to main at `ffe7f1d81f0421b35220bd7ba5b1555246c7a0e1`.
[Trusted-publishing run 40344526047](https://github.com/jchewitt/weftlet/actions/runs/40344526047)
completed successfully on attempt 2. Both npm `latest` tags resolve to `0.2.0`.

- Exact release-PR head `a818ee6312f6970015cea66f55cf6bb2cc62e363` passed the
  [dispatched Ubuntu/Windows checks](https://github.com/jchewitt/weftlet/actions/runs/40042137308).
  Local `pnpm release:prepare` also passed 222 deterministic tests, one optional OML skip,
  12 advisory architecture findings, inventory, licenses and fresh packed-consumer checks.
  The publication workflow repeated preparation at the merged source commit.
- Independent review checked the generated release plan, versions/changelogs, all 79 original
  source identities and the actual archives. Core contains 11 entries and toolkit 179;
  runtime assets, public examples and licenses/notices are present. No credentials, Git history,
  caches or generated graph snapshots were included. Toolkit's packed core dependency is `^0.2.0`.
- Both public npm tarballs match the hosted prepared archives byte for byte, and those hashes
  match the locally reviewed archives. Public SLSA provenance subjects match their SHA-512
  digests and reference this exact commit, repository and `publish.yml` workflow. This checks
  provenance content and source identity; it is not a separate cryptographic signature audit.
- Attempt 1 published and verified core, then toolkit's provenance submission failed with
  `TLOG_CREATE_ENTRY_ERROR` / HTTP 409 for an equivalent transparency-log entry. The core
  acceptance receipt and original archives were retained. Registry state was inspected before
  rerunning only failed jobs in the same run. Attempt 2 completed toolkit publication using the
  unchanged version/archives; core was already present. No provenance setting was disabled.
- Package tags `@weftlet/core@0.2.0` and `@weftlet/toolkit@0.2.0`, and their public GitHub
  Releases, point to `ffe7f1d81f0421b35220bd7ba5b1555246c7a0e1`. The release records contain
  the verified archive digests. Main's package versions agree with npm.
- A fresh public-registry consumer on Linux / Node 24.19.0 installed only
  `@weftlet/toolkit@0.2.0` directly (`npm install --ignore-scripts`); core resolved transitively
  to `0.2.0`. Both lockfile registry URLs and integrity hashes match the prepared archives.
  CLI init/configuration and the npm-exec launcher passed. Real TypeScript indexing produced
  15 SCIP facts within 22 total facts; the impact query returned 22 and SHACL conformed.
  Repeat hydration preserved snapshot identity/content. Saved queries preserved snapshot bytes
  and labeled excluded working edits. MCP initialized, discovered `impact.scan`, returned a
  bounded 20-fact response and reported a missing snapshot as an error. No semantic documents
  were selected: both hydrations extracted/reused zero artifacts, so this does not establish
  model extraction or semantic artifact reuse.

Live model/authentication quality, browser interaction and genuine fresh-task cloud restoration
remain separate. No source application was changed and no live model call was made for release.

## Development workspace recovery, 2026-10-23

The existing Codex development workspace became executable again at repository commit
`3617c71e29af869feccec1f5b1390c3082149b12`. Runtime status reported current observations and
connected execution; shell access, the repository identity and its initially clean worktree
were confirmed. The cause of the earlier executor failure was not established. A reported
OAuth 404 from another project was not reproduced or attributed to the executor failure.

Linux, Node 24.19.0, pnpm 10.18.2:

- The existing restoration checkpoint passed `node scripts/check-restoration.mjs --verify`:
  its snapshot digest was retained, ten facts were queried with an intentionally unavailable
  provider, and the historical evidence remained ineligible for current-diff validation.
  No checkpoint or saved evidence was regenerated to obtain that result. A build had already
  run; verification preceded the new governance run.
- The full deterministic publication gate passed again: **222 tests** (1 core + 221 toolkit),
  one optional OML skip, build, 12 advisory architecture findings, inventory, licenses and
  fresh packed-consumer installation/indexing/RDF/SHACL/viewer-generation/MCP checks.
- The new [consumer-trial recipe](CONSUMER-TRIAL.md) was exercised in a separate public
  dispatch Git repository using fresh npm installation of locally packed core/toolkit archives.
  The documented Bash blocks ran with only the sample task/path replaced. The deterministic
  zero-assertion provider produced three artifacts; the repeat extracted zero and reused three
  with unchanged snapshot identity/content. Diagnostics, SHACL and two distinct 60-fact pages
  passed. A deliberate exit-7 child retained its error/status and stopped the shell before a
  subsequent marker could run. Independent review confirmed the corrected fail-fast handling,
  captured-commit pinning and command compatibility. This is a command-recipe check, not a
  live semantic-quality measurement. An initial source-workspace rehearsal stopped at npm's
  `workspace:^` metadata handling; the successful check used the documented installed consumer.

This was recovery within the existing conversation, not the new-task procedure in
[environment validation](ENVIRONMENT-VALIDATION.md). It establishes neither fresh-cloud
restoration nor live model/authentication recovery. No model request, source-application
change or npm publication was part of these checks.

## Explicit routing declarations, 2026-10-23

[ADR 014](ADR-014-routing-declarations.md) adds opt-in committed source mappings for explicit
producer/consumer bindings. Implementation `5b8d49679f48837fe2ea465940b8c852e543cf5d` was
measured on input/protocol commit `e5510479c0545e38a41a902b65839529a3e66e73`, frozen before
measurement. The original 27 dispatch inputs, cases and evaluator/ranking hashes are unchanged.
The public-safe comparison is `evaluations/dispatch/routing-baseline.json`.

Linux cloud, Node 24.19.0, pnpm 10.18.2:

- The same-SHA no-routing control retains **15/16 expected files** on page one and within
  three pages, with **0/7 labeled distractions**. Enabling the single authored declaration
  retrieves **16/16 on page one and within three pages**, retaining **0/7 distractions**.
  This measures use of a supplied mapping, not discovery or verification of a deployed route.
- Hydration produces **227 control facts / 229 enabled facts**. Only two inferred,
  deterministic routing facts are added; every non-routing fact field matches except its
  containing snapshot ID. Diagnostics, SCIP digest and semantic artifact keys are unchanged.
  Both runs reuse all three control artifacts with zero extraction/model calls. Repeating
  enabled hydration retains snapshot identity/content and again reuses all three artifacts.
- Full continuation returns **198 unique facts** (60/60/60/18), versus 183 reachable in the
  control. All six archival implementation facts and seven archival test facts are reachable;
  three implementation facts and one test fact appear on page one. A test-file relationship
  does not assert test execution or delivery. No refund/audit distraction facts are returned.
- Direct SPARQL returns the exact producer/binding/consumer pair with inferred authority.
  SHACL conforms and RDF projection matches every fact field. The existing unresolved
  Markdown reference remains a diagnostic; no approved intent or runtime evidence is added.
- The final full publication gate passed **222 deterministic tests** (1 core + 221 toolkit),
  one optional OML skip, build, 12 advisory architecture findings, inventory, licenses and
  fresh packed-consumer installation. The installed smoke extracts a committed routing file
  and includes its consumer in the complete SCIP/RDF/SHACL/query/viewer/MCP path.
- Tests cover strict schemas/duplicate JSON keys, bounds, scoped identity, same-topic binding
  isolation, exact regular Git blobs including Unicode/spaced paths, missing/ambiguous
  endpoints, dirty committed querying, rename/delete, tracked-but-ignored manifests, repeated
  overlays, draft authority, outside-scope endpoint rejection and failed-refresh preservation.
  Secondary review found and resolved diagnostic ordering and draft freshness issues before
  the final full gate. The isolated overlay now preserves all archived tracked inputs even
  when `.gitignore` matches them.
- Five historical snapshot files retain their recorded SHA-256 digests. Saved-only rescoring
  of the latest dispatch and Weftlet graphs preserves their scores and reachability (15/16
  and 24/24 first-page candidates respectively). All 79 original imported source paths/source
  hashes remain intact. No source application was modified.

Hosted Ubuntu/Windows results are attached to the implementation PR. Browser interaction,
live provider authentication, broader semantic quality and actual deployment/runtime routing
validation remain separate. This increment includes a minor changeset but no npm publication.

## Relative module request identities, 2026-10-22

[ADR 013](ADR-013-relative-module-requests.md) scopes generic relative imports to the
importing directory. Implementation `26c47d5b55f9390fe38b4928d1a8274eaf893583` was measured
against the frozen dispatch input and the existing Weftlet document-link input. Cases,
configuration, budgets, evaluator and ranking bytes are unchanged. The public-safe record
is `evaluations/dispatch/relative-imports-baseline.json`.

Linux cloud, Node 24.19.0, pnpm 10.18.2:

- Dispatch retains **15/16 expected candidates** on page one and within three pages.
  Three-page labeled distractions fall from **7/7 to 0/7**; page one remains 0/7.
  The reachable component shrinks from 214 to 183 facts. Full continuation returns all
  183 unique facts (60/60/60/3), with no refund/audit distraction or archival consumer.
  The archival file still has six local facts but no extracted operational route.
- The Weftlet input retains **24/24 first-page and three-page candidates**, with 0/4
  first-page and 1/4 three-page distractions. All scans still reach 3,648 facts and stop
  at 180; telemetry remains a later-page distraction for atomic publication. These results
  do not establish exhaustive precision or broader semantic quality.
- Real SCIP/document/RDF/SHACL hydration retains 227 dispatch and 3,648 Weftlet facts.
  SCIP and document facts match their prior versions in every field except containing
  snapshot ID. Dispatch reused three semantic control artifacts and Weftlet reused six,
  extracting zero. A repeated dispatch refresh preserves identity/content and reuses all
  three again. No model calls, approved sources or runtime observations were added.
- Snapshot assembly v4 and file extractor v2 coexist with old saved evidence. Draft
  overlay publication identity also binds the extractor version, while capture-v2 digests
  remain compatible. Tests cover old/new overlay coexistence, immutable committed heads,
  repeated draft identity, rename/delete behavior and manifest versions.
- The full publication gate passed **208 deterministic tests** (1 core + 207 toolkit),
  one optional OML skip, build, 12 advisory architecture findings, inventory, licenses and
  fresh packed-consumer installation. The installed smoke exercises the new relative-request
  module alongside actual SCIP, RDF/SHACL, continuation, visualization and MCP checks.
  Actionlint passed without shellcheck.
- Independent review verified all 27 frozen dispatch input hashes, six evaluator hashes,
  three legacy saved-snapshot byte hashes and their original scores/reachability. All 79
  imported source paths/source hashes are preserved. Code review found no blockers; its
  control-character coverage observation was corrected before the final full gate.

Hosted Ubuntu/Windows results are attached to the implementation PR. Corrected extraction
requires an explicit refresh; saved queries keep their original facts and do not rebuild.
Browser interaction, live authentication and broader semantic quality remain separate.
No npm publication is part of this increment.

## Prospective dispatch evaluation, 2026-10-22

Inputs, labels and protocol were committed at `fa902165a1f212a6d3245c847e1ab9b64a69715b`
before any queries. Production ranking remains byte-identical to `proximity-diversity-v1`.
The [evaluation protocol](IMPACT-EVALUATION.md#prospective-dispatch-evaluation) and
`evaluations/dispatch/baseline.json` record the public-safe measurements and provenance.

Linux cloud, Node 24.19.0, pnpm 10.18.2:

- Real SCIP/document/RDF/SHACL hydration produced **227 facts**, with zero model assertions,
  approved intent sources or runtime references. Repeat hydration extracted zero and reused
  three control artifacts, retaining snapshot identity/content digest. Fixture TypeScript
  checking and four exported behavior checks passed separately.
- All three cases use the existing 60-fact/three-page/depth-32 budget. Candidate recall is
  **15/16 on page one and within three pages**. No labeled distraction appears on page one;
  **7/7 case-specific distraction labels** appear within three pages. These are synthetic
  candidate-file measurements, not a quality gate or exhaustive precision result.
- Supplemental full continuation returned 214 unique facts across four pages, with no
  archival-file fact. Its local relationships exist but the expected operational route is
  disconnected. SCIP distinguishes the two domain policy functions; cited generic import
  witnesses show the cross-domain `./policy.js` connection. The intentionally unresolved
  Markdown reference has a diagnostic and no guessed target.
- Original Weftlet snapshots, suite, reachable counts, recall and distraction scores remain
  unchanged. Both saved snapshot files match their recorded SHA-256 digests. All 79 original
  imported source paths and source hashes are preserved.
- Focused evaluator checks pass with a real independent Git repository and an unrelated cwd:
  selected suite/config, separate evaluator/evidence commits, real indexing/document links,
  saved-only scoring, immutable snapshot content, failed-report preservation, missing-snapshot
  refusal and live-provider refresh refusal. Boundary tests also reject impostor modules and
  repository/suite/configuration/draft mismatches. Fixture result scores are not CI thresholds.
- The full publication gate passed **203 deterministic tests** (1 core + 202 toolkit),
  one optional OML skip, build, 12 advisory architecture findings, inventory, licenses and
  fresh packed-consumer installation/indexing/RDF/SHACL/MCP checks. Actionlint passed without
  shellcheck; strict TypeScript checking of the evaluator also passed.

Hosted Ubuntu/Windows outcomes are recorded with the implementation PR.
No ranking/source-extraction change, live model call, browser result, authentication result
or npm publication is part of this increment. Broader real-project and semantic-quality
validation remain separate.

## Impact ranking, 2026-10-22

[ADR 012](ADR-012-impact-ranking.md) describes query ordering by weighted proximity and
source diversity. Implementation `2e4a3bbc55bd3a15cf619f56827963a699a5b56b` was measured
against two existing immutable snapshots, with no hydration or model calls. The public-safe
record is `evaluations/weftlet/ranking-baseline.json`; cases, labels, budgets, configuration,
snapshot bytes and reachable fact counts are unchanged.

Linux cloud, Node 24.19.0, pnpm 10.18.2:

- On the document-link snapshot, first-page candidate retrieval improved from **22/24 to
  24/24**, retaining 24/24 within three pages. Labeled distractions fell from 1/4 to 0/4
  on page one and from 3/4 to 1/4 within three pages. The query test and setup doctor now
  appear on page one. Telemetry is a new later-page distraction for atomic publication;
  the aggregate improvement does not mean that every case has less noise.
- On the older source-project control, first-page retrieval improved from 15/24 to 19/24
  and three-page retrieval from 18/24 to 19/24. The five missing document relationships
  remain absent. Labeled distractions worsened from 0/4 to 1/4 within three pages, again
  telemetry. These four cases from one repository do not establish generalization or
  exhaustive precision. Every scan remains truncated after 180 facts with continuation.
- The full publication gate passed: **197 deterministic tests** (1 core + 196 toolkit),
  one optional OML skip, build, 12 advisory architecture findings, inventory, licenses
  and fresh packed-consumer installation. The installed smoke now exhausts ranked
  continuation over actual extracted facts, checking for duplicate or missing results.
- Focused coverage includes large-source consumer diversity, deep asynchronous flows,
  generic shared imports, citation-only anchors, stable ties across commit-derived IDs,
  complete pagination, versioned continuation rejection and evaluator version drift.
  The real TypeScript/RDF pipeline retains field-for-field projection equivalence.
- The first full run omitted the cloud's writable cache/store settings, causing four
  installation-fixture failures. Correcting the command environment produced the passing
  full rerun above; no source workaround was needed. Actionlint passed without shellcheck.
  All 79 original import paths and source hashes remain unchanged.

Hosted Ubuntu/Windows outcomes are attached to the implementation PR. Ranking changes
ordering only, preserving evidence authority, confidence, scope and current-diff eligibility.
Saved snapshots need no refresh; old continuation tokens require restarting the scan.
Browser interaction, live-provider/authentication checks and broader semantic quality remain
deferred. No new source approval, runtime observation or npm publication is claimed.

## Explicit document linkage, 2026-10-22

[ADR 011](ADR-011-explicit-document-links.md) describes committed Markdown references,
precise citations, authority boundaries, and the new snapshot assembly identity. Implementation
`90726be3751cf23de7f1cdd595d1e9ddb151b139` is measured separately from the evidence inputs.
The six documents' source mappings were committed at
`dcef64001d8d47cd1aeb4c1434992612158a104a`, before the linker implementation.

Linux cloud, Node 24.19.0, pnpm 10.18.2:

- Full publication gate: **192 deterministic tests** (1 core + 191 toolkit), one optional
  OML skip, build, 12 advisory architecture findings, inventory, licenses and fresh packed
  consumer. The installed smoke now parses committed Markdown and combines its references
  with real SCIP facts before RDF/SHACL validation. Actionlint passed without shellcheck.
- Focused cases cover relative/root/reference-style/encoded Markdown destinations, CRLF
  source citations, duplicate basenames without guessing, missing/deleted/renamed paths,
  directories, URLs, code examples, and distinct source approval/assertion review. Real
  pipeline hydration links a test using SCIP's Evidence identity, passes SHACL and retains
  field-for-field RDF projection equivalence. Cached prose is rechecked against target
  deletion, while the preceding immutable snapshot stays readable.
- The original saved v2 evidence was queried without hydration: its digest and 15/24
  first-page, 18/24 three-page scores remain unchanged. Fresh assembly uses a different
  identity, binds the linker version, and reuses the existing semantic artifacts.
- The fixed old-source control still returns 15/24 first-page and 18/24 three-page candidates.
  With the new explicit source mappings, the measurement returns **22/24 first-page and
  24/24 three-page candidates**. All five expected intent-document paths are retrieved.
  This new input also contains the intervening source-indexing implementation; it is not
  an isolated model-quality or ranking experiment. The original case labels and budgets
  are unchanged. `evaluations/weftlet/document-links-baseline.json` records the evidence
  identities, provenance witnesses, scores, noise and limitations.
- Three of four labeled distractions appear within three pages, including one on the first
  page. All scans remain truncated at 180 facts. Better candidate recall does not establish
  precision, complete product understanding, or a safe change. Ranking is measured separately
  in the subsequent increment above.
- An initial real-document run caught false missing-file diagnostics for slash-separated
  prose and package names. The final linker diagnoses unresolved explicit Markdown links;
  unresolved literal mentions are ignored. Regression cases include the observed examples.
  All 79 original import paths and source hashes remain unchanged.

Hosted Ubuntu/Windows outcomes are attached to the implementation PR. No live model call,
new source approval, browser interaction, runtime behavior or authentication result is claimed.
The control provider returns no assertions. Browser and live-provider validation remain deferred.

## Committed source-project indexing, 2026-10-22

[ADR 010](ADR-010-committed-source-indexing.md) records the opt-in profile and its limits.
Toolkit implementation `1c2c699` was evaluated against the same evidence commit
`eeaaa342d62c11eeef44bfdf81fa8dedcfeb205d`, unchanged case labels and query budgets.
`evaluations/weftlet/source-project-baseline.json` records the full implementation SHA,
snapshot/configuration/index digests, scores, remaining misses and source coverage.

Linux cloud, Node 24.19.0, pnpm 10.18.2:

- First-page candidate retrieval improved from 13/24 to 15/24; three-page retrieval
  improved from 16/24 to 18/24. Typed SCIP relationships now cover 33 test files, including
  the lifecycle test, and link the shared core contract. Five expected intent documents
  remain unlinked and the MCP file remains outside the query budget.
- The new graph has 3,490 facts (2,970 SCIP and 520 repository-file facts). Repeated
  hydration reused all six document-control artifacts with identical snapshot identity
  and content digest `6f30f62900e37a6d2d266bcd3bba54941b1cab3997602eefef3320b0d0e66fc3`.
  Rerunning the original profile preserved its prior snapshot, digest and scores.
- Real SCIP regression fixtures prove committed contract/test linkage through a workspace
  re-export, ignored/dirty-source isolation, repeat digest stability, rename/delete
  replacement, and capture of draft changes outside ordinary code/evidence roots.
  Invalid scopes/aliases fail before SCIP. Missing alias-definition selection was caught
  during development; both entry points and definition files must be explicitly selected.
- The full publication gate passed: 187 deterministic tests (1 core + 186 toolkit),
  one optional OML skip, builds, 12 advisory architecture findings, inventory and licenses.
  Fresh packed-consumer checks now also exercise a source alias and a test excluded by
  its build config, along with the existing npx/RDF/SHACL/viewer-output/MCP checks.
- Workflow syntax passed actionlint. All 79 original source import paths/hashes remain
  unchanged. The Windows workflow includes the new real-indexing and overlay regressions;
  hosted outcomes are attached to the implementation PR.

No dependency installation in evidence archives, live model run, runtime observation,
owner approval, browser interaction or new authentication result is claimed. This mode
does not inherit build compiler settings or establish complete external dependency resolution.

## Self-repository impact evaluation, 2026-10-21

The [evaluation protocol](IMPACT-EVALUATION.md) and public-safe
`evaluations/weftlet/baseline.json` record a deterministic control against committed
Weftlet `eeaaa342d62c11eeef44bfdf81fa8dedcfeb205d`. The active checkout contained
the new evaluator; its source/suite/configuration digests are recorded separately.
No current working source bytes were substituted for that evidence commit.

On Linux, Node 24.19.0 and pnpm 10.18.2:

- Real SCIP, RDF/SHACL and publication produced 1,369 facts. Four fixed scenarios
  retrieved 13/24 expected candidate files on the first page and 16/24 in three pages.
  These are measurements, not a quality pass. Intent documents, workspace contracts,
  test coverage and query ranking have the gaps described in the protocol.
- Repeated hydration extracted zero and reused six document-control artifacts, retaining
  snapshot identity and content digest
  `5b4003c527b0f797d45814679326c59da995bc677d0706768a9d9b1b21aedb4f`.
- Saved-snapshot scoring succeeded with the semantic-artifact directory temporarily
  unavailable and returned identical recall. No hydration phases ran; artifacts were
  restored afterward. Missing-snapshot and live-provider-refresh probes both failed
  clearly without starting an indexer or model.
- Five evaluator tests passed, covering first/later-page scores, extraction versus
  bounded-retrieval misses, non-relationship exclusions, duplicate/drifting pages,
  stale case paths and invalid budgets. Strict TypeScript checking of the evaluator passed.
- The full publication gate passed: 183 deterministic tests (1 core + 182 toolkit),
  one optional OML integration skipped, builds, 12 advisory architecture findings,
  inventory, licenses and fresh packed-consumer installation/indexing/RDF/MCP smoke.
  All 79 original import paths and source hashes remain unchanged.

Hosted [checks for the initial evaluation commit
8e82453d92357451e832f3bf16666a6bef89b6de](https://github.com/jchewitt/weftlet/actions/runs/39687986720)
also passed on Ubuntu (full publication gate) and Windows (34 selected reliability tests,
inventory and licenses). The full self-repository control run above was performed in Linux
cloud; these hosted checks do not imply a Windows evaluation run or browser validation.

No live semantic assertions, runtime traces, owner approvals, browser interactions or
new authentication results are claimed. The control sends no model requests. Broader
semantic quality still needs a separately bounded live run and human citation review.

## Milestone 1: standalone baseline

Passed `pnpm context-graph:publication-check`:

- Core and toolkit TypeScript builds.
- 98 deterministic tests (1 core + 97 toolkit/example).
- Generated third-party dependency/license inventories.
- Packed core/toolkit installed in a separate temporary Git consumer.
- Real TypeScript SCIP indexing and extraction, runtime asset inventory,
  HTML/DOT/SVG rendering and installed MCP initialization/tool discovery.
- Missing snapshots produce an explicit MCP error.
- Development MCP tests cover missing/stale output rebuild and clean protocol error reporting.

One opt-in Docker/openCAESAR integration test was skipped. Real Codex extraction, Windows,
macOS and hosted CI were not run. Existing source validation records are not copied as evidence.
Synthetic semantic runner tests validate orchestration/citations/cache behavior, not model quality.

The initial pnpm 11 installation exposed a build-script policy mismatch; installing with the
pinned pnpm 10.18.2 resolved it. Four fixture adaptation failures (paths, sort order and query
labels) were corrected and the complete gate rerun successfully.

## Milestone 2a: saved evidence lifecycle

Passed TypeScript build, 15 affected tests across hydration, scope selection, lifecycle, final
checks and real SCIP indexing, followed by the independent package smoke test.
New checks exercise same-process concurrent publication, immutable conflict rejection, atomic
head updates, failed refresh preservation, dirty/untracked file reporting and two concurrent
committed materializations without changing Git status or registered worktrees.

The full baseline suite also passed after the main lifecycle change. Draft overlays and later
milestones require separate validation. Symlink/submodule materialization and archives over
128 MiB are explicitly unsupported; Windows/macOS were untested at this milestone.

## Milestone 2b: draft overlays

Passed build and five overlay/viewer tests. The overlay test indexes real TypeScript in the
base and draft, renames a shared interface and updates its consumer, repeats capture to verify
stable identity, then deletes the consumer and proves the old relationships disappear.
Committed HEAD and the default snapshot remain unchanged. No live model or runtime is involved.

A first repeatability check caught synthetic-commit timestamps leaking into fact identities.
Overlay IDs now derive from normalized draft facts and captured bytes; the repeated real-index
test passes.

## Milestone 3: RDF, SHACL and cross-source queries

Passed real pipeline execution, real SCIP indexing, deterministic prose-provider hydration,
RDF/traversal field equivalence, six declared asynchronous routes, downstream implementation/test
retrieval, pagination without duplicate facts, missing-query gaps, identity-kind conflict and
invalid-citation/confidence SHACL negatives, and remote SPARQL rejection.
Installed-consumer smoke passes with the new RDF runtime dependencies.

The larger suite exposed a suggested-file ordering regression; preserving explicit RDF ordinals
fixed it, and the affected static/RDF tests passed. Live model comprehension is a separate check.
License inventories include exact-version reviewed notices for three newly encountered expressions.

Milestone 3 final rerun: 102 deterministic tests passed (1 core + 101 toolkit/example); one optional OML integration test skipped.

## Milestone 4: architecture and optional OML

Passed build and 34 focused tests. The governance integration uses dependency-cruiser, ESLint and
jscpd, checks positive and negative imports, a transitive SPARQL inference, cycles, conflicting
owners, missing imports, baseline scope, and valid/expired exceptions. The initial extraction
commit was separately analyzed in an isolated tree to record five existing advisory findings.
The current repository passed approved rules with eight advisory size/complexity findings.

Direct-RDF/OML assertion parity and real pipeline incremental reuse passed. Actual openCAESAR
compilation and OWL reasoning remain unverified; no active OWL reasoner is claimed.

## Milestone 5: providers and diagnostics

Passed build and 41 focused deterministic tests, including actual subprocess timeout/cancellation,
safe error reporting, transient-only retry limits, malformed output rejection, module identity and
timeout enforcement, cache reuse, and model reasoning identity. The pipeline test additionally
checks that a source-budget failure makes zero provider calls.

`doctor` reports Git and Codex available, authenticated Codex login, and the RDF backend. A tiny
public live test using Codex 0.163.0 / gpt-6-astra exited with status 1 before extraction. A bounded,
redacted diagnostic identified a read-only filesystem error. Live semantic extraction is blocked
and unverified in this environment; no credentials or private source were copied to work around it.

## Milestone 6 and final integrated gate

On 2026-10-20, `pnpm context-graph:publication-check` passed end to end:

- Frozen installation and TypeScript builds; 110 deterministic tests passed (1 core + 109 toolkit/example).
- One optional Docker/openCAESAR integration test skipped.
- Canonical architecture gate passed; 10 advisory size/complexity findings remain for review.
- Extraction inventory and production license checks passed.
- Fresh packed consumer exercised actual TypeScript SCIP extraction, RDF/SPARQL/SHACL projection,
  HTML/DOT/SVG rendering, installed MCP initialization and missing-snapshot reporting.

The final pipeline test extracts missing implementation paths, explicit ambiguous ownership and
contradictory node kinds from additional public prose, reports/rejects them, and preserves the last
valid head. Source approval and unreviewed model assertions remain separately labeled in RDF,
agent output and the viewer. Snapshot publication also passed concurrent independent-process tests.
Viewer tests check exact fact/edge identity, safe source links, script syntax, six-edge directed paths,
cycle termination, bounds and coverage/staleness labels. Browser UI automation was not performed.

All 79 imported original file hashes were rechecked against the recorded source SHA, and destination
hashes matched the inventory. Export paths contain no Git metadata, credentials, environment files,
node_modules, generated graph storage or package archives. The inventory was reviewed separately from publication authorization; the user subsequently
authorized the GitHub export documented below.

`scripts/cloud-install.sh` was executed successfully in the managed environment. The installed
consumer is a fresh-install smoke test; restoration into a fresh cloud task is a separate check. Live Codex extraction remains blocked as recorded above.
Windows, macOS, hosted CI and optional formal compiler execution were untested in that cloud run.

## Secondary review fixes and authorized GitHub export

On 2026-10-20, secondary review identified five issues. Regression coverage now verifies:

- Architecture entry roots retain local transitive dependencies, and unmapped intermediate
  modules produce extraction gaps instead of a false pass.
- Nested repository roots use consistent committed reads, deltas, dirty paths and archives.
  Actual nested hydration succeeds with real TypeScript indexing while prose remains dirty.
- Consumer-relative, absolute, file-URL and import-only ESM package adapters resolve correctly;
  the installed-consumer smoke also loads a relative adapter.
- Draft queries compare captured content digests, distinguish included/excluded/subsequent changes,
  detect reversion to committed bytes and new in-scope files, and mark legacy freshness unknown.
- Module import and asynchronous factory initialization share extraction's timeout/cancellation;
  cancelled initialization neither caches its late result nor starts extraction.

Follow-up review found an additional equivalent-root normalization issue (`./src`, `./`). It was
fixed and independently rechecked; no blocking findings remained. Scope tests include directory
prefix boundaries, outside paths, Windows separators and contract globs. These separator tests
are deterministic checks on Linux, not a Windows environment validation.

The final `pnpm context-graph:publication-check` passed: builds, 114 deterministic tests
(1 core + 113 toolkit/example), approved architecture rules (10 advisory findings), extraction
inventory, licenses and a fresh tarball consumer exercising SCIP, RDF/SPARQL/SHACL, visualization
and MCP. One opt-in Docker/OML integration test remains skipped. All 79 original file hashes were
rechecked against the recorded source SHA, and the destination history scan found no private-key
or common credential-token signatures. This bounded scan supplements the reviewed file inventory. The user authorized pushing the reviewed destination commits to
`https://github.com/jchewitt/tently` for local testing. Package registry releases and visibility
changes are excluded. Source remains read-only; no source history is included in this repository.

## HDesk validation of 6710e9391a6a01345dab5f5be4ae0656e1c9d1ae

Tested destination commit: `6710e9391a6a01345dab5f5be4ae0656e1c9d1ae`.
Evidence source: HDesk results supplied by the maintainer, recorded here without rerunning
the Windows or WSL checks in the cloud. HDesk reported no source changes or pushes.
These results apply to this commit and the environments specified below.

### PASS: live Codex end-to-end on Windows

Environment: Windows, Node 24.2.0, Codex 0.153.4, `gpt-6-astra` with `medium` reasoning.
The unchanged adapter extracted the public example, validated citations and schema, ran real
SCIP indexing and RDF/SHACL, published and queried the snapshot, and reused its semantic artifact
on a second hydration.

| Observation | Result |
| --- | --- |
| Semantic facts | 4 |
| Total snapshot facts | 12 |
| Query facts | 11 |
| Second hydration: extracted / reused artifacts | 0 / 1 |
| Second hydration: snapshot identity / content digest | Both unchanged |

This establishes a live adapter pass for the public example. The earlier cloud filesystem failure
remains specific to that environment; broader semantic-quality evaluation is still separate.

### PASS: WSL deterministic and installed-consumer checks

Environment: WSL Ubuntu-22.04, Node 24.6.0, pnpm 10.18.2. Passed frozen installation, build,
114 deterministic tests, architecture checks with 10 advisory findings, inventory, licenses
and the fresh packed-consumer smoke test.

The aggregate command initially stopped at a harness pnpm-store mismatch. After correcting
that configuration, licenses and packaging passed independently. These are passing component
results, not a claim that the initial aggregate invocation completed successfully.

All three **original** `src/mcp-startup.test.ts` tests passed in WSL:

- `rebuilds missing workspace outputs and initializes clean JSON-RPC from another cwd`
- `rebuilds stale workspace outputs and initializes clean JSON-RPC from another cwd`
- `fails clearly on a compiler error without sending diagnostics on protocol stdout`

These tests were excluded only from the later native Windows subset because fixture creation
attempted a file symlink for `.modules.yaml` and received `EPERM`. They are validated in WSL,
not generally unvalidated. Separate native Windows launcher/MCP initialization, `impact.scan`
discovery and missing-snapshot reporting also passed.

### Native Windows follow-up

The native Windows subset reported **108 passed, 2 failed, 1 optional skipped**, with the
three fixture tests above excluded. This is not a full native Windows suite pass.

- `git archive` inherits `core.autocrlf=true` and changes committed LF bytes. A focused probe
  confirms `git -c core.autocrlf=false archive ...` preserves exact bytes. The implementation
  fix and regression coverage remain follow-up work.
- Concurrent snapshot-head replacement fails with rename `EPERM` at `src/storage.ts:22`
  in the tested commit. Sequential publication passes. A fix must preserve atomic replacement
  and cross-process guarantees; sequential success does not validate concurrency.
- Improve CRLF checkout integrity checks and discovery of npm-installed Codex executables.
- Address the native Windows `.modules.yaml` symlink fixture limitation before claiming
  those three tests pass natively.

Docker is optional for openCAESAR and is not required by the default RDF backend. Optional
formal compiler execution, browser interaction, macOS, hosted CI, fresh-cloud restoration
and broader semantic-quality evaluation remain separate validation work.

## CLI setup and npm release preparation

The maintainer selected the `@launch-echo` npm scope. The toolkit is now
`@launch-echo/tently`, with `@launch-echo/tently-core` as a transitive dependency.
Original source inventory hashes and attribution are retained.

The Linux cloud publication gate passed with 117 deterministic tests (1 core + 116
toolkit/example), one optional Docker/OML test skipped, and 11 advisory architecture findings.
The additional advisory is `runInit` complexity (21 against the configured threshold of 20);
it remains flagged as new, with no automatic baseline or exception. Approved rules pass.
Inventory and license checks pass.

New tests cover project defaults, explicit source selection without source-approval promotion,
nested configuration paths, CRLF ignore-file preservation, overwrite refusal, non-interactive
flags, and `config show`/`config validate` without Git or a configured provider. A separate PTY
check exercised interactive cancellation and confirmation on Linux.

The packed-package smoke serves the two local archives from a disposable scoped registry.
An npm exec invocation requests only `@launch-echo/tently`, resolves core transitively, infers
the `tently` executable, initializes a fresh project, and validates/displays its configuration.
The separate installed consumer passes real SCIP, RDF/SPARQL/SHACL, visualization and MCP.
This verifies npx installation mechanics without claiming public npm publication.

`npm whoami` returned `ENEEDAUTH`; public registry reads found neither selected package.
Registry authentication and public-registry installation remain pending. No npm publication
has occurred. The HDesk Windows/WSL results above still refer to their original tested SHA;
the new setup/release commands have not been tested on native Windows.

## Release portability follow-up

The maintainer's WSL release-preparation run initially used Node 22.14.0. The locked Undici
dependency could not load because `zlib.createZstdDecompress` was unavailable. The previous
toolkit Node 20.11+ declaration was incorrect. Toolkit metadata, `.nvmrc` and early startup
checks now require Node 24+; the independent core package retains its own Node requirement.

After updating to Node 24.14.1, the maintainer reported 116 toolkit/example tests passing,
one optional test skipped, a passing architecture report with 11 advisory findings, and a
passing inventory check. That aggregate invocation then stopped at license generation:
the standalone pnpm 10.18.2 executable was passed to Node as JavaScript, producing an `ELF`
syntax error. This is a script launcher defect, not a license finding. These user-reported
results do not establish a completed WSL release-preparation pass.

The shared launcher now executes standalone pnpm directly and JavaScript entry points
through Node. Regression tests cover both forms, paths with spaces and literal arguments.
A Linux reproduction uses the actual standalone `@pnpm/exe@10.18.2` distribution.
Separate probes using real Node 22.14.0 confirm that the built CLI, MCP, library entry point
and development launcher reject the unsupported runtime before loading Undici.

The full Linux publication gate passed on Node 24.19.0 with standalone pnpm 10.18.2:
126 deterministic tests (1 core + 125 toolkit/example), one optional Docker/OML test skipped,
architecture approval with the same 11 advisory findings, inventory and license checks, and
the fresh packed-consumer smoke. That smoke covers npm exec setup/config, runtime assets,
real TypeScript indexing, SCIP, RDF/SPARQL/SHACL, visualization output and MCP.

Secure cloud publication support is tested for temporary npm configuration permissions,
literal environment-variable references, cleanup and preservation of ordinary npm login
when no cloud token is configured. No credential value is stored in that configuration.
The environment requirement has been saved; an applied credential and public npm publication
remain pending. These checks do not establish new native Windows or macOS results.

### Interactive npm 2FA follow-up

The maintainer subsequently reported `EOTP` during a real WSL publish attempt after enabling
2FA. Inspection of npm's authentication code confirms that it declines interactive challenges
when either stdin or stdout is not a terminal. Our publisher captured stdout, disabling that
flow. Real publication now inherits all terminal streams; dry-run JSON and registry reads
remain captured for validation. A subprocess regression test verifies those output behaviors,
and a Linux pseudo-terminal probe confirms both stdin and stdout reach the publication child
as terminals. Neither test contacts npm for publication or completes a real browser/OTP
challenge; that authenticated WSL retry remains operator validation.

### npm processing delay and partial release

The maintainer's next WSL attempt successfully completed npm's publish authentication and
received acceptance for `@launch-echo/tently-core@0.1.0`. Immediate integrity verification
returned 404 while npm processed the package. A subsequent public registry read confirmed
core's SHA-512 integrity matches the prepared archive; toolkit still returned 404. This is
a partial release, not failure of the accepted core upload or evidence of toolkit publication.

The npm website initially displayed `0.0.0-stage`, a temporary holding version awaiting
staged review, with no license. Later public checks confirmed `latest: 0.1.0` and
`Apache-2.0` for core. Downloaded tarball bytes match the prepared SHA-512 digest, and a fresh
temporary consumer successfully installed core from public npm and imported its ESM exports.
The placeholder's license field does not describe our submitted package.

The publisher now saves acceptance before polling visibility and waits for matching integrity
before advancing to dependent packages. Seven deterministic tests cover delayed visibility,
matching existing archives, mismatches, bounded timeout and resume without another upload,
blocking dependents, registry errors, and publish failure. These tests use controlled registry
responses; they do not measure npm's processing-time guarantees.

The updated publication gate passed 134 deterministic tests (1 core + 133 toolkit/example),
with one optional Docker/OML test skipped and the same 11 advisory architecture findings.
Inventory, licenses and packed-consumer checks passed. The subsequent preparation step
exposed npm's refusal to dry-run an already published version. Preparation now compares
existing registry integrity instead, while retaining dry runs for unpublished versions.

## Public npm release 0.1.0

Both packages published by the maintainer from WSL are now visible at `latest: 0.1.0`, with
Apache-2.0 metadata. Public tarball downloads match both SHA-512 hashes in the release manifest
prepared at `02fb65c987154d925fc523c91ccedbdca96fff9d`. The toolkit, like core, initially appeared
as a `0.0.0-stage` holding version while npm processed it; subsequent checks confirmed the
operational release. An independent temporary project ran `npm exec -- @launch-echo/tently@0.1.0`
with `init --yes`, `config validate` and `config show`, using public npm and resolving core
transitively. Generated configuration identified that project and did not approve intent sources
automatically. No model requests or cloud-side npm uploads were made.

## Post-release module organization

The development tree now groups implementation by responsibility while preserving the five
root public entry points. Tests were relocated without dropping existing cases; cross-module
and startup checks live in `tests/`, and release-helper tests live beside their scripts.
The 79 extraction source paths and source hashes are unchanged; destination paths and required
modification notices follow the moved files. Historical validation paths above refer to their
recorded commits and have not been rewritten to imply newer environment results.

Linux, Node 24.19.0, standalone pnpm 10.18.2: the full publication gate passed **135 deterministic
tests** (1 core + 134 toolkit/example/script), one optional Docker/OML test skipped, build,
inventory, licenses and fresh packed-consumer installation. The installed consumer passed
npm exec setup/config, real TypeScript/SCIP indexing, RDF/SPARQL/SHACL, visualization output and
MCP. All three original cold/stale/error MCP startup cases passed at their new test location.

The canonical policy maps internal modules separately. A public-safe fixture uses the actual
policy and analysis tools to verify allowed imports and detect all five proposed forbidden
directions. Actual toolkit analysis reports no violations of those rules, no infrastructure
failures or extraction gaps, and the same 11 heuristic advisories. Internal restrictions remain
advisory pending explicit owner approval; existing approved core rules remain hard gates.
Historical debt and approval records were not advanced or waived because of the moves.

Before/after checks found identical runtime export names for the library (35), core (3) and
telemetry (2) entry points. A source comparison confirmed all 38 moved runtime files differ
only in import/export module paths and required attribution notices. Clean builds remove
obsolete compiled modules. Public package names, CLI commands, configuration, graph behavior
and snapshot formats are unchanged. This is an unreleased source refactor, not a replacement
for published 0.1.0. Native Windows and macOS were not rerun for this change. Hosted CI was
subsequently verified as recorded below.

## Hosted CI and restoration preparation

GitHub-hosted Ubuntu [run 39492039168](https://github.com/jchewitt/weftlet/actions/runs/39492039168)
completed successfully at `92ae118ccb22f59aaa150b1c8f3a009bdacc788a`. The Actions API reports
the deterministic job and repository composite action succeeded. The workflow selects Node 24
and pnpm 10.18.2, installs the frozen lockfile and runs the full deterministic publication gate.
This verifies hosted CI independently of the managed cloud's live Codex filesystem failure.
Earlier notes that hosted CI was unverified describe the evidence available at that time.

The reusable cloud install/start instructions were saved as an updated environment draft with
the writable npm cache and current GitHub/npm/CI state. The updated install script completed
frozen installation and build in this instance. `scripts/check-restoration.mjs` records an ignored public
snapshot checkpoint and verifies its retained content and query behavior with an intentionally
unavailable semantic provider. Current-instance rehearsal is separate from restoring a genuinely
new cloud task. Follow [environment validation](ENVIRONMENT-VALIDATION.md) for the final user-driven
environment publication/new-task step and the browser-MCP checklist. macOS is out of current scope.

Current-instance checkpoint verification returned 10 query facts from the retained snapshot with
an intentionally unavailable module provider and `eligibleForCurrentDiffValidation: false`.
Changing the checkpoint digest caused verification to fail; restoring the original proof passed
again. Governance passed with the same 11 advisories, and inventory validation passed. This is
a rehearsal, not a claim that environment publication or a new-task restoration occurred.

## Explicit Codex authentication modes — tentative

2026-10-20: implemented in `083fbdd`. Unreleased source
defaults to ChatGPT login and offers explicit API-key authentication through a named environment
variable. Existing npm 0.1.0 is unchanged. `init` emits the default; `doctor` distinguishes a
ChatGPT login from an unverified API key. Saved-query access and built-in artifact identity do
not depend on the selected authentication mode.

Build/type compilation passed on the current Linux cloud (Node 24.19.0). Regression cases were
added for mode selection, credential filtering, missing-key/no-fallback behavior and configuration
validation; existing fake-runner tests now inject the login-status probe. These tests and the full
publication gate were **not run locally for this change**, per the maintainer's request to defer
testing. No model calls, paid API requests or npm publication occurred. Earlier live Codex and
deterministic passes do not validate this increment.

Independent validation remains tentative: run the deterministic suite, then verify ChatGPT login
with ambient API variables present, API mode with a valid and invalid/missing selected key,
doctor's presence-only reporting, and a bounded public-example hydration with artifact reuse.
Record CLI/model versions and actual results separately. Hosted API authentication, native Windows
behavior and any Codex GitHub Action proxy integration are not established by compilation.

Maintainer disposition (2026-10-20): live authentication validation is **tentative, deferred and
non-blocking for release**. The maintainer plans to exercise their existing ChatGPT-backed Codex
workflow after publication and adoption into Banditrade, and report any issues. API-key validation
may remain tentative; obtaining API credentials or making paid requests is not required for that
follow-up. This records acceptance of deferred validation, not a passing result. Ordinary
deterministic release checks remain applicable. No source-application reintegration was performed.

## Weftlet migration and trusted-publishing preparation

2026-10-21: the maintainer created `@weftlet` and authorized migration from Tently. Current source
uses `@weftlet/core@0.1.0`, `@weftlet/toolkit@0.1.0`, `weftlet` and `weftlet-mcp`. The compatible
context-graph aliases, config/storage paths, neutral-core boundary and all 79 original imported
source paths/SHA-256 hashes are preserved. GitHub remains `jchewitt/tently`.

Linux, Node 24.19.0, pnpm 10.18.2 and npm 11.9.0: frozen installation, build and the full
publication gate passed **147 deterministic tests** (1 core + 146 toolkit/example/script),
with one optional Docker/OML test skipped. Architecture checks passed with 12 advisory findings;
extraction inventory and licenses passed. A fresh packed consumer installed the new toolkit
and automatically resolved the new core name, exercised npm exec setup/config, real TypeScript
SCIP indexing, RDF/SPARQL/SHACL, visualization output and MCP. Cold/stale/compiler-error MCP
startup tests passed with workspace fixtures wired to `@weftlet/core`.

The previously deferred deterministic Codex-auth/config regression cases now pass. Live ChatGPT
and API-key authentication validation remains tentative and non-blocking; no model was invoked.
Public runtime export counts remain 35 toolkit, 3 core and 2 telemetry. After final help-text and
documentation edits, compilation and extraction inventory were checked again.

`publish.yml` was checked with actionlint 1.7.7 (shellcheck integration disabled). It defaults to
preparation only; publication is explicitly selected and uses a separately permissioned,
environment-gated GitHub-hosted job. Synthetic tests cover OIDC prerequisites, minimum npm version,
rejection of ambient tokens and cleanup of isolated npm configurations. Manual login and legacy
cloud-token references remain supported. The workflow pins npm 11.21.1; local checks used npm
11.9.0, which also exceeds npm's 11.5.1 minimum for trusted publishing.

No new npm packages have been published or old packages deprecated by this change. Package-level
npm trust settings, GitHub environment reviewer rules, a live OIDC release/provenance check and
fresh public-registry installation remain external validation steps. The new release workflow
has not yet been run on GitHub; a successful local gate or actionlint run is not evidence of OIDC
permissions. Native Windows fixes, fresh-task restoration and actual browser interaction remain
separate work. See [release instructions](RELEASING.md) for the maintainer's exact setup steps.


## GitHub repository rename — 2026-10-21

The maintainer renamed the destination to `jchewitt/weftlet`. The origin, both npm repository
URLs, current instructions and OIDC repository guard now use that identity. Historical export
records remain unchanged. The architecture config retains its stable graph repository ID;
this remote rename does not rewrite existing evidence. The cloud mount remains `/workspace/tently`.

Seven focused npm-auth tests passed, including acceptance of the new repository and rejection
of the previous identity. Fresh packed-consumer validation passed: npm exec setup/config,
transitive core installation, runtime assets, real TypeScript indexing, SCIP, RDF/SPARQL/SHACL,
HTML/DOT/SVG and MCP. Extraction inventory and diff checks passed. The full deterministic suite
was not repeated for these metadata/documentation and release-guard changes; its prior result
remains recorded above. No npm publication, live OIDC release or fresh-task restoration is
claimed. Both new 0.1.0 package versions returned public-registry 404 during this check.

Use `weftlet` as the npm trusted-publisher Repository field. Archives prepared before this rename
contain the previous repository URL; prepare from the updated commit before initial publication.


## Native Windows release-preparation fixes — 2026-10-21

The maintainer reported five failures during native Windows release preparation: three MCP
startup fixtures failed creating a file symlink for pnpm metadata, concurrent snapshot-head
replacement failed with EPERM, and isolated archive content used CRLF instead of committed LF.
The supplied output was still running, so no final native-suite totals are inferred.

Changes:
- MCP fixtures copy dependency metadata files and retain directory junctions on Windows. All
  three original startup tests remain enabled, including protocol-stdout isolation on compiler errors.
- Committed materialization runs `git -c core.autocrlf=false archive`. This command-local override
  preserves the user's repository configuration. The regression enables `core.autocrlf=true`
  even on Linux: it reproduced the reported CRLF failure before the fix and passes afterward.
- Snapshot-head replacement retries only Windows EPERM/EACCES/EBUSY errors, with 50 retries and
  4.55 seconds of total backoff. Each attempt remains an atomic rename; the destination is never
  unlinked or truncated. Persistent failures propagate, preserve the prior head and clean up the
  unpublished temporary file. Immutable snapshot publication still uses exclusive hard links.
- A real multiprocess test publishes three valid snapshots, replaces a shared head 60 times and
  checks concurrent reads always return a complete known snapshot. Existing conflicting immutable
  snapshot tests remain enabled. Fault injection covers transient and persistent Windows errors,
  nonretryable errors, previous-head availability and temporary-file cleanup.

Linux, Node 24.19.0, pnpm 10.18.2: the full publication check passed **155 deterministic tests**
(1 core + 154 toolkit/example/script); one optional Docker/OML test was skipped. Build, architecture
(12 advisory findings), extraction inventory, licenses and fresh packed-consumer smoke passed.
The smoke includes setup/config, transitive core installation, real TypeScript SCIP indexing,
RDF/SPARQL/SHACL, HTML/DOT/SVG output and MCP. After improving child-process cleanup in the
contention test, its three-test lifecycle suite passed again.

A separate `windows-latest` CI job now builds and runs the storage, Git and original MCP startup
regressions. Actionlint 1.7.7 passed for both workflows (shellcheck integration disabled).
The Windows job does not replace the full Linux release gate. Native Windows execution of these
fixes remains pending; simulated Windows errors on Linux are not a native pass. CRLF checkout
inventory checking and npm Codex executable discovery remain separate follow-ups. No live model
call or npm publication was performed. Use WSL for the validated full release-preparation route.


## Weftlet publication and native Windows CI — 2026-10-21

The maintainer reported successful publication. Public npm metadata independently confirms
`@weftlet/core@0.1.0` and `@weftlet/toolkit@0.1.0`, both with `latest` pointing to 0.1.0 and
repository metadata pointing to `jchewitt/weftlet`. Downloaded archives match their registry
SHA-512 integrity values. The toolkit archive contains the Windows atomic-rename helper.
This check verifies registry availability and archive integrity, not a fresh public consumer install.

[Hosted run 39656137105](https://github.com/jchewitt/weftlet/actions/runs/39656137105) succeeded
at `4cdc4e5bc8b53bde3b23ce0be550146ac6ae817c`. Both the full Ubuntu deterministic job and the
focused `windows-storage-and-startup` job passed. The Windows job completed frozen installation,
build, Git archive-byte checks, snapshot contention/failure checks and all three original MCP
startup cases. This establishes a native hosted-Windows regression pass; full Windows release
preparation, HDesk reruns, CRLF inventory checking and npm Codex discovery remain separate.

Current source prepares 0.1.1 for both packages to update public descriptions and documentation.
The project overview and core README describe Weftlet independently; original attribution,
licenses and extraction provenance remain intact. npm trusted publishing still needs package-level
configuration and a successful OIDC release. A manual publication does not validate OIDC.


For the 0.1.1 documentation/metadata patch, frozen install and the full Linux publication gate
passed again: 155 deterministic tests (one optional Docker/OML test skipped), build, architecture
with 12 advisory findings, inventory, licenses and fresh packed-consumer smoke. No runtime code
changed from 4cdc4e5. GitHub's About description was blank; an attempted metadata update returned
HTTP 403, so no GitHub description change is claimed. No npm upload was made by the agent.


## First trusted-release preparation attempt — 2026-10-21

[Run 39660995763](https://github.com/jchewitt/weftlet/actions/runs/39660995763) on d82ebee
passed the full release gate but stopped before uploading any package. npm 11.21.1 returns
`publish --dry-run --json` results keyed by package name; the release script expected the
flat record returned by npm 11.9.0. The preparation check now supports both observed formats
and verifies name, version and archive integrity. Ambiguous/multiple records and mismatches
remain errors. Two npm-command tests pass, including negative response-shape/identity/integrity
cases, and both package archives pass real dry runs with npm 11.9.0 and 11.21.1. No live npm
publication was attempted by this failed run.

## Trusted 0.1.1 publication and release automation — 2026-10-21

[Release run 39661957651](https://github.com/jchewitt/weftlet/actions/runs/39661957651) succeeded
at `720a5f964fe3cb6c438be6d22b4aa8b4ad44de17`: credential-free preparation, both npm OIDC
uploads, registry visibility and archive integrity checks. Public metadata confirms both packages
at 0.1.1 with provenance. A fresh public installation passed CLI init and config validation.
No npm token was supplied. The `npm-release` GitHub environment exists without reviewer/branch
rules; the workflow main-branch guard remains active. Saving trust alone was not counted as a pass.

Package-specific 0.1.1 Git tags and GitHub Releases were subsequently added at that exact commit,
after rechecking both registry hashes against the original run's archive manifest. No 0.1.0 tag
was guessed. npm versions or artifacts were not changed by this record backfill.

For the Changesets automation increment, Linux Node 24.19.0 / pnpm 10.18.2 frozen install and the
full publication gate passed: **165 deterministic tests** (1 core + 164 toolkit/example/script),
with one optional Docker/OML test skipped. Build, architecture (12 advisory findings), extraction
inventory, licenses and fresh packed-consumer smoke passed. The smoke covered setup/config,
transitive core installation, runtime assets, real TypeScript SCIP, RDF/SPARQL/SHACL, HTML/DOT/SVG
and MCP. Actionlint 1.7.7 passed all three workflows with shellcheck integration disabled.

New deterministic tests run the actual Changesets CLI in disposable root/core workspaces, verify
patch/minor fixed-group bumps, changelogs, plan/lockfile/inventory updates and consumed changesets,
and reject stale or non-advancing plans. Release-record tests reject missing/mismatched registry
archives and conflicting tags, and resume interrupted creation without duplicates. Recovery-state
tests select earlier attempts and reject expired or ambiguous artifacts. No paid model call or
new npm version was published by these tests. Hosted version-PR operation is checked separately;
a future merged release remains the integration test of automatic publish and record creation.

## Automatic 0.1.2 release and Windows reliability — 2026-10-21

[Release run 39672652013](https://github.com/jchewitt/weftlet/actions/runs/39672652013) completed
preparation, npm trusted publication and release records at
`3d8d1f38a9e70b38178921cdabf5e8714c417c1c`. Both registry `latest` tags now identify 0.1.2.
Both package-specific Git tags resolve to that exact commit, and GitHub Releases were created.
Versions were committed on main before publication. This validates the first merged Changesets
release through the automatic push trigger; no post-publication version commit was required.

The next Windows reliability increment adds common discovery for native Codex executables and
standard global/project-local npm launchers. Tests use actual npm-created launchers with a
synthetic public CLI to exercise diagnostics, login status and source-isolated extraction. They
also cover PATH precedence, spaces/metacharacters, rejected/broken shims, secret filtering,
discovery timeout/cancellation, and termination of a launcher with an active child. They make no
live Codex request and do not validate real account authentication or model quality.

Inventory tests use actual Git checkouts with core.autocrlf=true and explicit eol=crlf attributes.
They check unchanged source hashes, checkout bytes, Git configuration and index; genuine edits
still fail. Binary and -text imports retain exact bytes. Custom filters are rejected without
execution. License checks accept CRLF formatting while still comparing complete notice text.
All 79 original source paths/hashes remain unchanged.

The full local publication gate passed on Linux, Node 24.19.0 / pnpm 10.18.2: **177 deterministic
tests** (1 core + 176 toolkit/example/script), one optional OML test skipped, build, architecture
(12 advisory findings), inventory, licenses and fresh packed-consumer smoke. Actionlint passed
with shellcheck integration disabled. The Windows CI job now runs the added launcher, process,
inventory and license checks; its native result is recorded separately after execution. Browser
interaction and live authentication testing remain explicitly deferred by the maintainer.


The first hosted Windows run at `6f2f83f` passed all **33** selected tests and the repository
inventory check, including real npm launchers and process-tree cancellation. Its newly enabled
license check caught CRLF conversion of a pinned reviewed notice. That check now shares the
Git-aware content reader; the reviewed notice and its approved SHA-256 remain unchanged.
Discovery time is included in existing probe/extraction timeout budgets. Updated hosted checks
are required before merging this increment.


PASS: [hosted run 39676848049](https://github.com/jchewitt/weftlet/actions/runs/39676848049)
at `ef2f8e31cbcae402ca08979e90aff4f00fb91c77`. Ubuntu passed the full publication gate with **178 deterministic tests**
(1 core + 177 toolkit/example/script), one optional OML test skipped, 12 advisory architecture
findings, build, inventory, licenses and packed-consumer smoke. Native Windows passed **34**
selected tests, including global/local npm launcher installation, discovery, login/extraction
plumbing, process-tree cancellation, CRLF inventories, storage/Git and all original MCP startup
cases. The repository inventory and complete license checks also passed natively. This is focused
Windows coverage, not a full native Windows publication gate or a live Codex account/model test.
