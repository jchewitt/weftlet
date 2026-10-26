# Consumer hardening and the 1.0 release plan

Status: maintainer-directed work, recorded on 2026-10-26 from a consumer integration report.
The starting release is `@weftlet/toolkit@0.2.0`. **Ship a patch for T01 first.** The remaining
items improve setup, reuse, diagnostics and document coverage; they do not block that patch
or justify expanding the consumer's migration. An official 1.0 follows this work and genuine
consumer acceptance, with its exact release scope reviewed when the evidence is available.

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
| **T01** | Coherent repository-document identity and kind | **Adoption blocker; patch work in progress** | First isolated patch; preserve SHACL and all assertions |
| **T02** | No-model hydration/setup preview | Planned usability work | Shares selection/cache identity with hydration; extend it with T07 traversal coverage |
| **T03** | Artifact reuse across operational configuration changes | Planned efficiency work | Preserve T01's semantic identity separation; keep snapshot/config identity distinct from reusable artifact identity |
| **T04** | Actionable, privacy-safe timeout diagnostics | Planned diagnostics work | Use stable source identifiers and run progress; document recovery with T02/T03 |
| **T05** | Early identity checks and validation progress/profiling | Planned correctness/observability work | Build on T01; profile latency independently before selecting optimizations |
| **T06** | Packaged release-documentation consistency | Planned release tooling work | Check the actual release archives; does not require a runtime architecture change |
| **T07** | Coverage-aware traversal from SOT/roadmap entry points | Planned bounded feature work | Use canonical identity from T01, preview from T02 and incremental reuse from T03; split selection/classification/extraction changes |

T02–T07 can ship in independently useful increments after the blocker patch. Do not combine
all seven into one diff or delay T01 for the optional platform work. Normal required release
checks still apply to every shipped increment.

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

Completion evidence will link the implementation PR, tested source commit, validation record,
published patch and subsequent consumer result. No patch publication or consumer pass is claimed
by this task list yet.

## T02 — Preview scope and work without calling a model

Add a no-model preview command, tentatively `hydrate --plan`; the CLI spelling is not implemented
by this plan. Use the same source-selection and identity logic as hydration to avoid preview drift.
Report selected sources and sizes, inclusion reasons, role/approval classification, expected
artifact hits/misses and extraction count, plus document/byte limits and any violations.

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
  incomplete/invalid ones are re-extracted, and source provenance remains correct.

## T04 — Explain timeouts and recovery

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

Add inexpensive graph-assembly checks for incompatible identities before expensive validation.
Keep the full conformance requirement. Separately instrument and profile large RDF/SHACL
validation to determine where time is spent before choosing optimizations.

Acceptance:

- Early errors identify the conflicting identity/kinds and relevant evidence using the configured
  privacy policy. Preserve all underlying assertions for diagnosis; early checks are not a
  substitute for RDF/SHACL validation.
- Report elapsed time and honest phase/heartbeat progress for long validation. Do not display a
  fabricated completion percentage when the validator exposes no meaningful denominator.
- Record reproducible public-fixture sizes, fact/node counts, runtime versions, wall time and
  resource observations. Separate measured bottlenecks from hypotheses.
- Any optimized validation/projection path has equivalence tests, including negative cases;
  failure must preserve the prior snapshot. Keep model-independent profiling separate from live
  extraction performance and from the reported two-fact correctness defect.

## T06 — Keep packaged documentation consistent with the release

The consumer installed 0.2.0 while its packaged README still named 0.1.2 and some archive examples
used 0.1.1. Source documentation has since been updated, but immutable published archives retain
their original text. Add a repeatable release-documentation check rather than relying on a
post-publication source edit.

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

After T01's patch is available, work through T02–T07 in bounded increments and record implementation
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
