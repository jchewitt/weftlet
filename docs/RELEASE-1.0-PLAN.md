# Consumer hardening and the 1.0 release plan

Status: maintainer-directed work; release checkpoint on 2026-10-26 after verified 0.3.0 publication.
**New adoption blocker: T08, deterministic physical-file kind conflicts.** This takes release
priority over the remaining planned increments; T04 was completed first as requested.
The report concerned `@weftlet/toolkit@0.2.0`. **T01's upstream patch shipped in 0.2.1**;
genuine consumer acceptance remains pending. T02 and T05's focused cold-validation optimization
shipped in 0.3.0. T03 and T04 are implemented in development source after that release. Broader T05
follow-ups and T06 and T07 remain open. These tasks improve setup, reuse, diagnostics and document coverage
without expanding the consumer's migration. An official 1.0
follows this work and genuine consumer acceptance, with its exact release scope reviewed when
the evidence is available.

This is the near-term release task list. The [Weftlet 2.0 product plan](WEFTLET-2.0-PLAN.md)
remains a separate future direction for generation, approvals, a companion website and hosted
AI. None of those platform features is a dependency of the fixes here.

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
| **T08** | Canonical physical-file kinds and public adapter factory | **Blocking fix passes local publication checks; hosted checks/release pending** | Neutral contract consumers conflict with test Evidence; consumer framework migration remains separately required |
| **T01** | Coherent repository-document identity and kind | **Upstream patch shipped in 0.2.1; consumer acceptance pending** | SHACL and assertions preserved; genuine consumer re-run is still required |
| **T02** | No-model hydration/setup preview | Shipped in 0.3.0 | Shared selection/cache inspection, human/JSON plans; extend with T07 traversal coverage |
| **T03** | Artifact reuse across operational configuration changes | Merged; local and hosted Ubuntu/Windows checks passed; unreleased | Built-in Codex user artifacts share five operational changes; custom providers remain conservative; exact legacy recovery without model calls |
| **T04** | Actionable, privacy-safe timeout diagnostics | Merged; local and hosted Ubuntu/Windows checks passed; unreleased | Safe source IDs, settled counts, failure classification and T02/T03 recovery; no extraction/cache identity change |
| **T05** | Early identity checks and validation progress/profiling | **Cold-validation fix shipped in 0.3.0; consumer acceptance pending** | Full validation preserved; early checks, detailed progress and validation reuse remain open |
| **T06** | Packaged release-documentation consistency | Open; README version pins removed in 0.2.1 | Automated archive/version consistency check remains to be implemented |
| **T07** | Coverage-aware traversal from SOT/roadmap entry points | Planned bounded feature work | Use canonical identity from T01, preview from T02 and incremental reuse from T03; split selection/classification/extraction changes |

T02 and the focused T05 fix passed local publication checks and hosted Ubuntu/Windows checks,
then shipped in [0.3.0](https://github.com/jchewitt/weftlet/releases/tag/%40weftlet/toolkit%400.3.0).
Registry archives match the independently reviewed export; source commit, provenance and release
tags are recorded in [validation](VALIDATION.md). T03, T04, T06 and T07 remain independently
useful increments, separate from the optional platform work. A genuine consumer hydration and
repeat against the current release remain required; upstream fixtures do not establish that result.

## T08 — Resolve deterministic physical-file kind conflicts

The consumer reports 120 IDs reproduced by actual 0.3.0 deterministic producers: 34 neutral
contract-only, 57 local-framework-only and 29 overlapping. This is separate from T01's repository
document identity defect and does not diagnose semantic-cache corruption or business-rule drift.

[ADR 020](ADR-020-canonical-physical-file-producers.md) records the public core factory, producer
audit, deterministic version changes and preserved semantic-cache boundary. The upstream fix
routes physical-file producers through one policy, preserves strict SHACL/provenance/authority,
and distinguishes historical graph versions from current validation. Public tests include real
SCIP and actual extractor composition, plus negative overlay validation without routing.

Release requires local publication checks, hosted Ubuntu/Windows checks, reviewed archives and
fresh installed-package verification. Consumer acceptance then requires the published packages
plus its own framework adapter migration and composed Prisma/DI/decorator spec/test regressions,
followed by full hydration and repeat reuse. Neither an upstream-only release nor a local-only
adapter patch closes both ownership boundaries. Do not rewrite semantic caches or force model
work to work around the proven deterministic defect.

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
patch. Use the current 0.3.0 release, which also includes the cold-validation improvement.
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
none. Requested refs now govern agent scope; corrected snapshots use graph-v6 while valid 0.2.1
semantic artifacts remain reusable. T03's operational cache changes and T07's traversal/default
validation-document separation remain separate work.

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

Merged in [PR 22](https://github.com/jchewitt/weftlet/pull/22) after 0.3.0, with local publication
and hosted Ubuntu/Windows checks passing. This source checkpoint does not claim npm publication.
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

Merged in [PR 25](https://github.com/jchewitt/weftlet/pull/25) after 0.3.0, with local publication
and hosted Ubuntu/Windows checks passing. This development checkpoint does not claim npm publication.
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

The implementation uses JavaScript on Node:
`rdf-validate-shacl` validates an in-memory N3 dataset. Hydration constructs and validates the
entire assembled graph, including when semantic artifacts were reused. There is no persistent
GraphDB backend or incremental validation. Querying a saved snapshot does not rerun SHACL.

The maintainer reports that validation pushes the consumer's overall generation beyond its
30-minute timeout, preventing snapshot publication and making adoption unusable. That report made
cold validation a release priority ahead of the remaining 1.0 work. Upstream has measured a specific
named-graph lookup cost in public synthetic fixtures, but has not measured that consumer graph or
diagnosed its complete timeout. The focused cold-validation fix shipped in 0.3.0, ahead of the
remaining 1.0 tasks. Consumer acceptance remains pending; broader T05 items stay open.

[ADR 017](ADR-017-shacl-validation-union.md) records the implemented cold-validation optimization:
build a temporary union of every SPO triple for the same validator/shapes, while keeping original
named assertion graphs canonical for queries and serialization. It removes repeated wildcard
lookups across one graph per fact. In a bounded single-run public 2,000-fact unique-node case,
the original SHACL path took 31.502 seconds; union construction took 0.153 seconds and SHACL
took 0.467 seconds. A 10,000-fact unique-node union case used about 1.3 GiB process RSS. These
are synthetic phase measurements, not a private consumer reproduction or end-to-end guarantee.

The focused change still validates the whole graph each time. It does not add Rust, GraphDB,
incremental validation or a validation-result cache. Early checks and broader observability/reuse
remain follow-ups rather than reasons to delay the cold-path fix. Native code or a database does
not by itself establish faster or correct incremental SHACL.

Acceptance:

- Early errors identify the conflicting identity/kinds and relevant evidence using the configured
  privacy policy. Preserve all underlying assertions for diagnosis; early checks are not a
  substitute for RDF/SHACL validation.
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

## T06 — Keep packaged documentation consistent with the release

The consumer installed 0.2.0 while its packaged README still named 0.1.2 and some archive examples
used 0.1.1. Release 0.2.1 removes the README version pins; immutable 0.2.0 archives retain their
original text. The automated release-documentation consistency check remains open. Add that
repeatable check rather than relying on manual edits alone.

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

The patch's upstream pass is necessary but does not replace consumer acceptance. Track follow-up
results without auditing or refactoring the source application's business logic from this repository.
