# Consumer hardening and the 1.0 release plan

Status: original T01–T10 engineering work complete; 0.6.0 candidate publication verified on 2026-10-28.
The maintainer has requested additional [business-context baseline work](PRE-1.0-BASELINE.md)
before official 1.0: precise exploration, symbol-level implementation links, cross-boundary
obligations, monorepo coverage and a measured Graphify/SCIP decision. Its A1–A3 public checks
pass within recorded limits; B1 query mechanisms are implemented for the next candidate, while
B2's measured decision retains SCIP. B3a explicit bindings and B3b's deterministic gap assessment
are complete, and B3c static calls are implemented; inference decisions and B4–B6 remain open. Both npm packages remain available for
TradePilot acceptance while this additional scope is assessed. The maintainer requested the
next live test after a new candidate; [the implementation queue](1.0-WORK-QUEUE.md) tracks
the intervening B1–B6 work.
**T08's upstream deterministic physical-file fix has shipped; the maintainer reports the consumer
updated and working on 2026-10-27. Detailed full hydration/repeat evidence remains pending.** T04 was completed before
the T08 fix as requested.

**T09 shipped in 0.5.0:** the configuration accepts `semantic.timeoutMs: 600000`,
alongside T05a identity preflight and validation phase timing. The two-minute default is unchanged.
The consumer's approved ten-minute retry has not run; that outcome remains separate acceptance.

The original report concerned `@weftlet/toolkit@0.2.0`. T01's upstream document-identity patch
shipped in 0.2.1; T02 and T05's focused cold-validation optimization shipped in 0.3.0.
T03 operational cache reuse, T04 semantic failure diagnostics and T08's public core file factory
shipped in 0.4.0. T09 and T05a shipped in 0.5.0. T06, T07 and T10 shipped in 0.6.0.
T07a prospective coverage is implemented separately from hydration;
T07b classification and deterministic document evidence merged in PR 42 after local/hosted checks
and independent review. T07c hydration/cache integration merged in PR 44 with local and hosted checks passed;
T05's remaining engineering evaluation is recorded in
[ADR 027](ADR-027-validation-closeout.md), retaining full direct validation after measurements.
The reviewed 0.6.0 candidate is published with verified registry archives, provenance and tags.
Validate it in TradePilot, address any acceptance blockers and the newly requested baseline
tasks, then review official 1.0. Consumer acceptance and the additional baseline are not closed
by completion of the original engineering task list.

This is the near-term release task list. The [Weftlet 2.0 product plan](WEFTLET-2.0-PLAN.md)
remains a separate future direction for generation, approvals, a companion website and hosted
AI. None of those platform features is a dependency of the fixes here.

The subsequent consumer filename blocker shipped in **0.6.1** on 2026-10-28: bounded physical
artifact/temp names, unchanged full logical identities/provenance, legacy reads and the requested
Windows traversal → repeat → clean regression. Registry archives, provenance, tags and a fresh
packaged CLI sequence are verified in [validation](VALIDATION.md). Use this patch for the next
consumer rerun; B1–B6 and actual product acceptance remain open.

## Reported evidence and boundaries

The consumer reported a cold extraction in which two source documents referred to the same
repository Markdown document. Semantic assertions gave that one repository-path identity
different node kinds, `Component` and `Document`. An isolated, unchanged two-fact graph failed
the public RDF validator's single-kind constraint. The references describe the same document;
this is an extraction identity conflict, not evidence of conflicting product intent.

The consumer stopped its larger hydration after independently proving that failure. No full-run
SHACL result or published snapshot is claimed. Several minutes spent in the larger validation
phase is a separate observation; the two-fact reproduction does not diagnose its latency.
Fresh-install checks and the package/adapter boundary were reported as successful.

Private source paths, assertions, artifacts and application data remain with the consumer.
Upstream work uses public-safe reproductions and preserves the original application's existing
integration. Consumer acceptance is reported separately from upstream deterministic tests.

## Task list and order

| ID | Task | Priority/status | Dependencies and release boundary |
| --- | --- | --- | --- |
| **T10** | Correct implementation coverage for returned code relationships | **Shipped in 0.6.0; consumer acceptance pending** | Separate evidence counts from display groups; preserve facts, authority, ranking and saved snapshots; scope gaps to returned page |
| **T09** | Accept the approved ten-minute extraction timeout | **Shipped in 0.5.0; consumer ten-minute retry unrun** | Raise only the config ceiling to 600000; preserve defaults/cache/retry behavior; consumer retry has not run |
| **T08** | Canonical physical-file kinds and public adapter factory | **Shipped in 0.4.0; consumer reported working; detailed acceptance pending** | Public core factory and neutral producers agree; record consumer commit, adapter tests and full hydration/repeat evidence |
| **T01** | Coherent repository-document identity and kind | **Upstream patch shipped in 0.2.1; consumer acceptance pending** | SHACL and assertions preserved; genuine consumer re-run is still required |
| **T02** | No-model hydration/setup preview | Shipped in 0.3.0 | Shared selection/cache inspection, human/JSON plans; extend with T07 traversal coverage |
| **T03** | Artifact reuse across operational configuration changes | Shipped in 0.4.0 | Built-in Codex user artifacts share five operational changes; custom providers remain conservative; exact legacy recovery without model calls |
| **T04** | Actionable, privacy-safe timeout diagnostics | Shipped in 0.4.0 | Safe source IDs, settled counts, failure classification and T02/T03 recovery; no extraction/cache identity change |
| **T05** | Early identity checks and validation progress/profiling | **Cold fix shipped in 0.3.0; T05a in 0.5.0; engineering closeout evaluated in ADR 027** | Cold/repeat/edits, worker, reuse, incremental and Rust evaluated; retain full direct validation; private consumer acceptance required |
| **T06** | Packaged release-documentation consistency | **Shipped in 0.6.0** | Generated current sections, checked actual tarballs, historical records preserved, fresh documented installation commands |
| **T07** | Coverage-aware traversal from SOT/roadmap entry points | **All three increments shipped in 0.6.0; consumer acceptance pending** | Committed closure, source roles/ownership, validation separation and draft invalidation implemented and published |

T02 and the focused T05 fix shipped in 0.3.0; T03, T04 and T08 shipped in
[0.4.0](https://github.com/jchewitt/weftlet/releases/tag/%40weftlet/toolkit%400.4.0), following
local/hosted checks, independent archive review and fresh packed/public-registry installation.
T09 timeout support and T05a identity preflight/phase timing shipped in
[0.5.0](https://github.com/jchewitt/weftlet/releases/tag/%40weftlet/toolkit%400.5.0).
Source, registry integrity, provenance and release tags are recorded in [validation](VALIDATION.md).
T05 closeout measurements and decisions are recorded in ADR 027; T06 and T07 shipped in the 0.6.0 candidate.
The consumer must migrate its framework adapter to the public core factory, then complete full
hydration and repeat reuse; upstream fixtures do not establish that result.

## T10 — Correct implementation coverage reporting

The consumer reports code relationships accompanied by zero implementation coverage. Actual public
contract-extractor and SCIP reproductions confirm that exclusive display-group counts caused the
false gap. [ADR 024](ADR-024-implementation-coverage.md) separates coverage from presentation,
retains evidence authority and scopes absence to the returned page. Existing snapshots can be queried
with the fix without hydration or model work. The exact consumer package/output was requested;
the public reproduction does not claim a completed private consumer acceptance run.

The fix merged in [PR 40](https://github.com/jchewitt/weftlet/pull/40), with local publication checks
and hosted Ubuntu/native Windows validation. Exact evidence and release status are recorded in
[validation](VALIDATION.md). T05 performance/validation closeout
remains separate; this reporting correction does not activate document traversal in hydration.

## T09 — Accept the approved ten-minute extraction timeout

Shipped in 0.5.0: `semantic.timeoutMs` accepts integers from 1 through 600000.
The default remains 120000; retry policy, cancellation,
authentication/discovery bounds and compatible artifact identities are unchanged. This is a
per-attempt Codex limit or whole-module-execution limit, not an overall hydration or CI timeout.

For recovery, upgrade both `@weftlet/core` and `@weftlet/toolkit` to 0.5.0,
set `semantic.timeoutMs: 600000`, and run `hydrate --plan` with the same committed ref and scope
as the interrupted run. Then rerun ordinary hydration, preserving compatible artifacts and
avoiding forced re-extraction. Follow [provider limits and reuse](PROVIDERS.md#limits-and-reuse).

Boundary, provider propagation, cancellation, cache reuse and packed/public-registry consumer checks passed;
release evidence is in [validation](VALIDATION.md). The consumer's approved ten-minute retry
has **not run**. No ten-minute wall-clock execution, paid/model call or private acceptance is
claimed by these deterministic upstream checks. T06/T07 shipped in 0.6.0;
T05 engineering evaluation is recorded separately in ADR 027.

## T08 — Resolve deterministic physical-file kind conflicts

The consumer reports 120 IDs reproduced by actual 0.3.0 deterministic producers: 34 neutral
contract-only, 57 local-framework-only and 29 overlapping. This is separate from T01's repository
document identity defect and does not diagnose semantic-cache corruption or business-rule drift.

[ADR 020](ADR-020-canonical-physical-file-producers.md) records the public core factory, producer
audit, deterministic version changes and preserved semantic-cache boundary. The upstream fix
routes physical-file producers through one policy, preserves strict SHACL/provenance/authority,
and distinguishes historical graph versions from current validation. Public tests include real
SCIP and actual extractor composition, plus negative overlay validation without routing.

The 0.4.0 release passed local publication checks, hosted Ubuntu/Windows checks, independent archive
review and fresh packed/public-registry installation. Consumer acceptance still requires the
published packages plus its own framework adapter migration and composed Prisma/DI/decorator
spec/test regressions, followed by full hydration and repeat reuse.
Neither an upstream-only release nor a local-only adapter patch closes both ownership boundaries.
Do not rewrite semantic caches or force model work to work around the proven deterministic defect.

## T01 — Resolve repository-document identity conflicts

Define and enforce a coherent ID/kind policy for repository document references across semantic
and deterministic extraction. A prompt instruction alone is insufficient when separately valid
model outputs can conflict after assembly. Preserve both source assertions and their citations,
source authority and assertion-review state. Retain single-kind SHACL validation; do not discard
an assertion or relax the shape to conceal the conflict.

Acceptance:

- A public regression has two committed documents referring to the same Markdown document,
  with one provider assertion labeling it `Component` and the other `Document` under the same
  repository-path identity. Both assertions survive under the coherent policy and align with
  deterministic document links; the assembled graph passes RDF/SHACL validation.
- Verify subject and object references, preserved provenance and unreviewed/inferred assertion
  authority. Other incompatible identities remain diagnosable rather than silently merged away.
- Version the relevant extractor/prompt/cache identity so incompatible old artifacts cannot
  satisfy a fresh extraction. Test a fresh build, subsequent artifact reuse and unchanged
  snapshot identity/content on repeat input. Keep historical saved snapshots readable and unchanged.
- Run the normal deterministic/publication gate and a fresh installed-package smoke. Publish
  the patch, then request a genuine consumer re-run against the recorded inputs; do not infer
  consumer acceptance from the upstream fixture.

Upstream completion evidence:

- [Fix PR #15](https://github.com/jchewitt/weftlet/pull/15) implements the policy in
  [ADR 015](ADR-015-repository-document-identity.md), with public cross-document regressions and
  fresh/cache-reuse coverage. [Release PR #16](https://github.com/jchewitt/weftlet/pull/16)
  advances the fixed core/toolkit group to 0.2.1.
- [Release run 40382864083](https://github.com/jchewitt/weftlet/actions/runs/40382864083)
  completed preparation, publication and release records on its first attempt at commit
  `5d1db91bf19ed493a20849b2d0f92d3aeac35dfe`. Required checks included 227 deterministic tests,
  12 advisory architecture findings, fresh packed-consumer checks and hosted Ubuntu/Windows CI.
- Registry archives, provenance and tags match the reviewed release. A fresh public-registry
  consumer passes the two-document regression, real SCIP, RDF/SHACL, queries and unchanged
  snapshot identity/content on artifact reuse, without live model calls. See the detailed
  [validation record](VALIDATION.md) for commits, checks and result boundaries.

The private consumer has not yet supplied a successful full hydration/repeat with the identity
patch. Use both 0.5.0 packages and migrate the framework adapter
to the public core factory; this release retains the cold-validation/T08 fixes and adds T09
timeout support and T05a identity preflight/phase timing.
Upstream publication and regression success do not close that acceptance gate or diagnose the
separate full-graph validation latency observation.

## T02 — Preview scope and work without calling a model

Shipped in 0.3.0: `hydrate --plan` renders a human summary and `--json` returns
the structured plan. This feature is not in published 0.2.1. Shared source selection and identity
logic report selected documents and sizes, inclusion reasons, configured role/source approval,
unreviewed assertion status, artifact reuse/extraction estimates and document/per-source byte limits.
See [ADR 016](ADR-016-hydration-preview.md) and [validation](VALIDATION.md).

Missing or unsupported-only selectors and bounded agent omissions remain visible as warnings;
incomplete plans need review and exit 1. They do not introduce new hydration gates that would
break deletion of the last document. Budget, duplicate-ID and corrupt/unavailable cache errors
block planning checks without truncating selected sources. An explicit empty source list selects
none. Requested refs govern agent scope. Release 0.3.0 introduced graph-v6; 0.4.0 advances assembly
to graph-v7 for T08 while compatible semantic artifacts remain reusable. T03 operational cache
reuse shipped in 0.4.0; T07 traversal/default validation-document separation remains open.

Acceptance:

- Preview calls no provider and performs no extraction, indexing, snapshot publication or active
  checkout mutation. Distinguish unavailable/corrupt cache entries from known reusable artifacts.
- Identify the commit, configuration and selection assumptions; a later changed input can
  invalidate the estimate. Report uncertainty explicitly instead of promising a cache hit.
- Test empty/no-document scope, cold and warm artifacts, missing sources, budget violations and
  semantic-identity changes. Provide machine-readable output and a concise human summary.
- With T07, show complete inclusion/exclusion reasons, unresolved links, ownership/classification
  gaps, coverage and budget effects before any model call. Do not silently trim the selection.

## T03 — Reuse valid artifacts after operational changes

Shipped in 0.4.0 after merging [PR 22](https://github.com/jchewitt/weftlet/pull/22) and passing
local publication and hosted Ubuntu/Windows checks; release evidence is in [validation](VALIDATION.md).
[ADR 018](ADR-018-operational-semantic-cache.md) separates built-in Codex user artifacts from
full snapshot profiles. Timeout, retry, concurrency and document/byte limits can change without
hiding completed artifacts. Model/policy/authentication descriptors and unknown fields remain
identity inputs; custom providers retain their full configuration contract. Workspace cache
paths and existing 0.2.1/0.3.0 artifact identities remain unchanged.

Planning reads the exact compatible legacy profile without writing. Hydration can retain a
validated copy atomically. Explicit `cache adopt --from-config` and its read-only `--dry-run`
recover expected committed-source keys after settings were already changed; no unrelated profiles
are scanned and no providers or snapshots are initialized. Agent scope and budget/coverage
reporting match the hydration preview. Current-diff checks still reject old-configuration snapshots.

The consumer reported that changing only a timeout selected a different cache profile and made
completed extractions unavailable for reuse. Investigate both storage-location selection and
artifact key construction. Separate operational controls from semantic-output identity, while
retaining complete configuration metadata on snapshots and queries.

Acceptance:

- Changing supported operational settings such as timeout does not hide or invalidate an
  otherwise reusable extraction. Explicitly classify each setting rather than assuming all
  non-source changes are harmless; retain provider-specific extension behavior.
- Changing source bytes/identity, model or relevant model settings, prompt/schema/extractor/
  ontology identity, or other output-affecting policy invalidates reuse as required. T01's new
  identity must not accidentally reuse old conflicting artifacts.
- Preserve force-extraction semantics, concurrent-writer safety, isolation between consumers,
  credentials and private cache contents. Record reuse and reasons for a miss without secrets.
- Test interrupted work followed by a changed timeout: valid completed artifacts are reused,
  missing/incomplete artifacts are extracted, and source provenance remains correct. Corrupt
  complete artifacts stay intact and require explicit forced refresh or operator repair;
  they are not silently overwritten or treated as misses.

## T04 — Explain timeouts and recovery

Shipped in 0.4.0 after merging [PR 25](https://github.com/jchewitt/weftlet/pull/25) and passing
local publication and hosted Ubuntu/Windows checks; release evidence is in [validation](VALIDATION.md).
[ADR 019](ADR-019-semantic-failure-diagnostics.md) records opaque source IDs and explicit local
preview mapping, final counts after active workers settle, safe typed errors and recovery.
Concurrent sibling cancellation preserves the initiating failure. Completed writes stay counted
as completed; cancellation between sources reports no failing source. The CLI supports semantic
failure JSON on stderr with `hydrate --json --quiet`, leaving protocol/success stdout untouched.
Provider loading problems and unknown provider errors are distinct. Timeout defaults, extraction
identities, cache formulas, saved queries and full graph validation remain unchanged.

Report a privacy-safe source identifier, phase, elapsed time, configured limit and completed/
remaining counts when extraction times out. Explain which completed artifacts can be retained
and how to inspect the plan or adjust a bound before retrying. The documented two-minute default
was insufficient for the reported workload; that observation alone does not select a new default.

Acceptance:

- Use a stable opaque identifier by default, with an explicit local mapping or opt-in detail for
  identifying the source. Avoid leaking source text, full prompts, credentials or provider stderr.
- Distinguish extraction timeout, cancellation, provider failure and infrastructure problems.
  Preserve completed artifacts and the last valid published snapshot.
- Test timeout/cancellation during a multi-source run, accurate progress counts, safe recovery
  instructions and secret-free logs. MCP protocol stdout remains clean.

## T05 — Detect inexpensive conflicts early and explain validation work

T05a shipped [early identity attribution and phase timing](ADR-021-identity-preflight-and-validation-timing.md)
in 0.5.0 after local and hosted Ubuntu/Windows checks and independent archive review.
Hydration and overlays reject all conflicting subject/object kinds before RDF construction;
opaque default reports have explicit local detail opt-in.
Completed semantic artifacts and prior snapshots remain intact. Valid preflight results still
require full SHACL. Timings report actual phase boundaries, not in-phase heartbeat or percentage.
This does not close the broader evaluation/reuse/backend items below or establish the consumer's
full-run performance.

The implementation uses JavaScript on Node:
`rdf-validate-shacl` validates an in-memory N3 dataset. Hydration constructs and validates the
entire assembled graph, including when semantic artifacts were reused. There is no persistent
GraphDB backend or incremental validation. Querying a saved snapshot does not rerun SHACL.

The maintainer originally reported that validation pushed the consumer's overall generation beyond its
30-minute timeout, preventing snapshot publication and making adoption unusable. That report made
cold validation a release priority ahead of the remaining 1.0 work. Upstream has measured a specific
named-graph lookup cost in public synthetic fixtures, but has not measured that consumer graph or
diagnosed its complete timeout. The focused cold-validation fix shipped in 0.3.0, ahead of the
remaining 1.0 tasks. The consumer is now reported working after 0.4.0; exact performance and
repeat-hydration acceptance evidence remains unrecorded. ADR 027 records the broader engineering evaluation.

[ADR 017](ADR-017-shacl-validation-union.md) records the implemented cold-validation optimization:
build a temporary union of every SPO triple for the same validator/shapes, while keeping original
named assertion graphs canonical for queries and serialization. It removes repeated wildcard
lookups across one graph per fact. In a bounded single-run public 2,000-fact unique-node case,
the original SHACL path took 31.502 seconds; union construction took 0.153 seconds and SHACL
took 0.467 seconds. A 10,000-fact unique-node union case used about 1.3 GiB process RSS. These
are synthetic phase measurements, not a private consumer reproduction or end-to-end guarantee.

The focused change still validates the whole graph each time. It does not add Rust, GraphDB,
incremental validation or a validation-result cache. T05a now adds early checks and phase timing;
worker progress and reuse remain unsupported, with the decision evaluated in ADR 027. Native code or a database does
not by itself establish faster or correct incremental SHACL.

Acceptance:

- Early errors identify the conflicting identity/kinds and relevant evidence through opaque
  defaults and explicit local detail opt-in. Preserve all underlying assertions for diagnosis;
  early checks are not a substitute for RDF/SHACL validation.
- Report elapsed time and honest progress for long validation. Current phase boundaries remain
  the supported progress signal: the synchronous validator blocks same-thread timers. Evaluate
  bounded worker execution before promising an in-phase heartbeat or cancellation; never display
  a fabricated completion percentage when the validator exposes no meaningful denominator.
- Record reproducible public-fixture sizes, fact/node counts, runtime versions, wall time and
  resource observations for construction and validation separately. Separate measured bottlenecks
  from hypotheses; include repeated identical input and small changed-input cases.
- Demonstrate improved cold full-graph validation, because reusing a previous validation result
  cannot unblock a first graph that has never completed. Keep private consumer acceptance and
  the overall generation timeout separate from synthetic validator-only benchmarks.
- Evaluate reuse of a successful conformance result only when validated graph content, shapes,
  validator version and applicable policy/semantics match. This reuse must not make historical
  evidence satisfy current-diff freshness, scope or provenance requirements.
- Evaluate dependency-aware incremental validation with insertions, updates, deletions, renames,
  affected relationships and global constraints. Revalidate the complete affected scope or fall
  back to full validation when it cannot be bounded safely; changed nodes alone are insufficient.
- Benchmark a suitable native/Rust-backed validator or optional persistent graph database if
  measurements justify a candidate. Compare supported SHACL behavior, positive/negative parity,
  installation, licensing, portability and maintenance cost. T02 adds no backend migration, and
  this evaluation does not commit the standalone toolkit to a mandatory service.
- Any optimized validation/projection path has equivalence tests, including negative cases;
  failure must preserve the prior snapshot. Keep model-independent profiling separate from live
  extraction performance and from the reported two-fact correctness defect.

The bounded closeout is recorded in [ADR 027](ADR-027-validation-closeout.md): 258 public
direct/worker cases cover cold/repeat/rebuilt and changed inputs; all 18 paired sample groups
match exact verdicts and data. Dense metadata and 10,000-fact memory measurements justified a
Rudof 0.3.35 evaluation: all 29 conformance/location cases agree, two diagnostic multiplicities
differ, and 12 native timings establish no clear overall file-transfer benefit. Retain direct full
validation. No cache, worker, incremental or native runtime capability is delivered. Exact-key
costs/misses and a changed-facts-only counterexample support the reuse/incremental decisions.
Consumer performance acceptance remains required; public fixtures do not silently replace it.

## T06 — Keep packaged documentation consistent with the release

Shipped in 0.6.0, with [ADR 022](ADR-022-release-documentation.md) defining the checked
scope. Changesets regenerates current-version sections in both READMEs and the release guide.
The dependency-free checker verifies source instructions and both actual tarballs before
publication; the fresh-consumer smoke exercises the checked pinned commands and archive pair
with an isolated npm/npx cache. Historical records and feature-introduction versions stay intact.
Source and publication validation are recorded in [validation](VALIDATION.md).

The original consumer installed 0.2.0 while its README still named 0.1.2 and some archive examples
used 0.1.1. Release 0.2.1 removed README version pins. T06 adds automation and replaces the release
guide's stale 0.2.1 current-install example. Immutable earlier archives retain their original text.

Acceptance:

- Distinguish current setup/version statements and executable installation examples from valid
  historical release evidence. Do not rewrite historical versions indiscriminately.
- Validate current instructions against the actual prepared core/toolkit versions and tarball
  contents before publication. Test both mismatches and intentionally historical references.
- Define how versioning updates or generates current-release documentation so normal Changesets
  bumps cannot silently leave it stale. Verify installation examples from fresh packed output.

## T07 — Traverse canonical documents with explicit coverage and authority

Start from configured SOT and master-roadmap entry points and recursively follow supported
canonical Markdown links to owner/task documents. Resolve against the chosen repository commit,
with cycle detection, canonical identities and deduplication. Report missing, ambiguous, outside-
scope or unsupported links instead of inventing targets or automatically fetching external URLs.

Extract requirements, business rules, constraints and cross-feature dependencies while retaining
source citations and explicit ownership. Reaching a document through a link does not approve it.
Routine implementation checklists and inferred plans cannot become approved intent through
traversal. Classify sources/claims explicitly; flag rules without clear SOT ownership and retain
their inferred/unreviewed state. Validation documents are excluded from product-intent extraction
by default and retained through a separately classified validation-evidence path.

Delivery increments:

1. **T07a implemented:** committed Markdown-link selection and an opt-in, no-model coverage preview: canonical targets,
   cycles/deduplication, ambiguous or unresolved links, exclusions and explicit budget status.
   Label this as prospective coverage until it drives hydration; existing hydration-plan documents
   and cache estimates must continue to describe actual execution inputs. The current graph linker
   also recognizes bare/code paths and is not itself a canonical traversal policy.
2. **T07b merged with local/hosted checks and review passed:** explicit roles/ownership and separate
   deterministic document presence/reference evidence. Optional per-fact metadata survives RDF,
   query and viewer projection without changing canonical Document identities. Reaching an owner
   does not approve a child or assertion; direct-source hydration remains unchanged.
3. **T07c merged with local/hosted checks passed:** opt-in hydration integration, incremental artifact reuse and cross-source linkage, with
   delete/rename handling and positive/negative real-extractor fixtures. Coverage failures stop
   new model work without discarding completed artifacts or the last valid snapshot.

[ADR 023](ADR-023-document-coverage-preview.md) records the T07a public API and `documents plan`
command. Entry points, document roots and read limits are operation arguments, with existing
semantic budgets used only for comparison. No configuration/cache identity or hydration selection
is changed. [PR 38](https://github.com/jchewitt/weftlet/pull/38) merged T07a with hosted Ubuntu
and native Windows checks; exact source validation is recorded in [validation](VALIDATION.md).
All three increments are now published in 0.6.0; registry verification is recorded separately in [validation](VALIDATION.md).

[ADR 025](ADR-025-document-classification.md) records T07b's shared classification contract
and standalone deterministic document-evidence API. `documents plan --document-policy <json-file>`
reads an operation-time sidecar; it adds no hydration configuration. The top-level `ready` checks
traversal/budgets, while `classification.complete` independently reports role/ownership gaps.
A resolved owner must be available, approved and an unambiguous intent source; an approved
validation/plan/reference or ambiguous-role owner is ineligible. Neither ownership nor links
transfer approval. Presence and references retain validation documents even without semantic
artifacts or outgoing links, without asserting test success. T07c now invokes these APIs from explicitly configured hydration and overlays; validation
evidence is preserved separately from semantic source selection. [ADR 026](ADR-026-traversal-hydration.md)
records cache compatibility, coverage gates, draft invalidation and source/assertion authority.

Acceptance:

- Split delivery into canonical selection/traversal, role/ownership classification and semantic
  extraction/linkage increments. Keep the existing direct-source configuration usable.
- The T02 preview exposes entry points, traversed paths, inclusion/exclusion reasons, roles,
  approval/ownership state, unresolved links and exact budget/coverage limits without model calls.
- Support cycles, shared targets, relative links/fragments and rename/delete cases without
  duplicate extraction. Test cross-feature owner/task references and validation documents,
  including mixed or ambiguous content that needs explicit classification.
- Compute the necessary selection before scheduling model work. If limits prevent full requested
  coverage, stop or require an explicit narrower scope/budget decision; never silently truncate
  dependencies to fit a document count. Persist incomplete coverage and its reason where relevant.
- Reuse unchanged extraction artifacts incrementally. Recompute reachability/classification when
  links or configuration change; invalidate affected relationships and preserve removed-source
  history. Partial failures retain completed artifacts and the last valid snapshot.
- Prove cross-source linkage using extracted public prose and real code relationships, with
  missing links, ambiguous ownership, conflicting claims and false cross-domain matches as
  negative cases. Separate deterministic fixtures from budgeted live-provider evaluation.

## Official 1.0 acceptance

Also review the [A1–A3 assessment and B1–B6 task list](PRE-1.0-BASELINE.md), added after the
0.6.0 candidate was published. The original list below remains necessary; a successful consumer
hydration alone does not close the requested business-context and exploration improvements.

With T01's upstream patch published, work through T02–T07 in bounded increments and record implementation
PRs and validation evidence here or in the linked validation record. Review the exact 1.0 scope
against completed evidence; any deferral needs an explicit maintainer decision and must remain
visible rather than being treated as done. The companion website, hosted AI and broader 2.0
product plan remain separate.

Before calling the consumer migration accepted or publishing 1.0:

1. Confirm the patched identity policy in a genuine consumer hydration, including completed full
   graph validation and snapshot publication, querying and an unchanged repeat. Keep provider
   details, source scope and remaining gaps explicit; the consumer performs its own application work.
2. Verify no-model scope preview, budget/coverage reporting, operational cache reuse and recovery
   diagnostics against the implemented task scope. Exercise SOT traversal and authority separation
   with public fixtures and reviewed consumer evidence.
3. Pass supported-platform build/tests, fresh packed and public-registry installation, real
   TypeScript indexing, RDF/SHACL, CLI/MCP, provenance and source-inventory checks. Check packaged
   release instructions before publishing the exact reviewed archives.
4. Record independently assessed usefulness and semantic-quality limits. Preserve the distinction
   between deterministic checks, live-provider tests, browser checks and private consumer results.
   Existing untested environments or deferred capabilities remain explicitly labeled.
5. Review the changelog, compatibility/migration guidance and remaining known issues, then use the
   normal reviewed version PR and trusted-publishing workflow. No 1.0 publication is claimed now.

For the reviewed minor candidate, retain a private consumer bundle and share only a sanitized
summary using the [consumer trial](CONSUMER-TRIAL.md):

- Record both package versions, consumer/adapter SHA, platform/provider/model, configuration and
  source scope; verify the no-model plan's roles, ownership, exclusions and budgets match execution.
- Complete genuine full hydration and SHACL publication with the approved timeout, then repeat
  unchanged inputs: zero new extraction, expected reuse and unchanged snapshot identity/content.
  Record total and phase timing; the ten-minute extraction limit does not extend an outer job deadline.
- Retain actual MCP requests/responses and continuations for predeclared changes, including a queue
  boundary. Review downstream consumers, contracts, implementations/tests and page-scoped coverage;
  a display group or a missing returned fact must not be mistaken for complete repository coverage.
- Independently inspect citations and semantic usefulness: misses, irrelevant results, conflicting
  claims, ownership gaps and misleading authority. Structural conformance is not a semantic-quality pass.
- Check browser interaction against the same JSON pack/snapshot using the
  [browser checklist](ENVIRONMENT-VALIDATION.md#browser-run-through-browser-mcp); keep deferred or
  untested environments explicit. Preserve saved queries and prior snapshots during a failed refresh.

Keep raw snapshots, artifacts, configuration and transcripts with the private consumer; do not
export credentials or private product content. Upstream fixtures and a published candidate do not
replace these consumer results or authorize an automatic 1.0 release.

The patch's upstream pass is necessary but does not replace consumer acceptance. Track follow-up
results without auditing or refactoring the source application's business logic from this repository.
