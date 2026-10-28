# @weftlet/toolkit

## 0.6.0

### Minor Changes

- 6c59746: Add explicit source roles and SOT owner mappings to prospective document coverage, with a bounded JSON policy supplied through `documents plan --document-policy`. Report ambiguous, unavailable and ineligible ownership without transferring approval.
  
  Expose a deterministic document-evidence extractor that retains cited document presence and references, including empty validation documents. Preserve optional source metadata through RDF/SHACL, queries and the viewer while keeping existing hydration, cache identities and legacy facts compatible. Traversal-driven hydration remains a separate increment.
- 35de52e: Add a no-model `documents plan` command and public coverage API for committed Markdown links, with explicit scope, citations, incomplete frontiers and budget reporting. This prospective preview leaves existing hydration selection, evidence authority and semantic caches unchanged.
- b44053f: Add opt-in committed document traversal to hydration and its no-model plan. Report coverage and
  source ownership, retain validation documents as deterministic evidence without model extraction,
  reuse compatible artifacts, and invalidate changed or unreachable draft document relationships.
  Preserve direct-source configuration, strict SHACL, saved snapshots and assertion authority.

### Patch Changes

- eb7a234: Generate current package versions and installation examples during versioning, and verify the source and packed documentation before publication. Keep historical release records separate and exercise the checked examples in the fresh-consumer smoke test.
- d3fe532: Count code implementation and consumer evidence independently of its display group, including SCIP and contract relationships. Mark coverage as nonexclusive and scoped to the returned page, preserve evidence authority and snapshot bytes, and avoid query-wide absence claims for paginated results.
- Updated dependencies [6c59746]
- Updated dependencies [d3fe532]
- Updated dependencies [b44053f]
  - @weftlet/core@0.6.0

## 0.5.0

### Minor Changes

- c8db1f0: Detect conflicting node kinds before ontology compilation and RDF construction, with complete producer/evidence attribution and opaque default diagnostics. Add explicit local `--validation-details` and public preflight helpers without modifying facts, authority or semantic artifacts.
  
  Report elapsed times and graph counts at validation phase boundaries while retaining full SHACL and existing conformance verdicts. Preserve previous snapshots and completed artifacts on failure. Phase timing is not a live heartbeat, incremental validation or a conformance cache.

### Patch Changes

- 795c67a: Accept `semantic.timeoutMs: 600000` for approved ten-minute extraction attempts. Raise the configuration ceiling from five to ten minutes while keeping the two-minute default, finite positive integer validation, cancellation and retry limits unchanged. Compatible Codex artifacts remain reusable after this operational change; the snapshot configuration identity still changes.
- @weftlet/core@0.5.0

## 0.4.0

### Minor Changes

- a919b82: Report semantic hydration failures with opaque source IDs, safe failure categories, elapsed time, timeout scope, final completed/remaining counts and recovery guidance. Preserve the initiating failure during concurrent cancellation, retain completed artifacts and published snapshots, and keep private provider messages out of reports.
  
  Map source IDs locally through hydration preview; use `hydrate --json --quiet` for semantic failure JSON on stderr. Distinguish missing provider infrastructure from unknown provider errors, and keep extraction/cache identities and timeout defaults unchanged.
- 5b88985: Reuse built-in Codex semantic artifacts across timeout, retry, concurrency and document/byte-limit changes in user storage. Keep snapshot profiles and full configuration digests distinct, preserve existing workspace behavior and conservative custom-provider identities, and validate every reused artifact.
  
  Read the exact compatible legacy profile without scanning other caches; hydration can retain a validated copy atomically. Add no-model `cache adopt --from-config <previous.json>` with a read-only `--dry-run` to recover completed artifacts after operational settings were already changed. Corrupt or conflicting artifacts remain intact and are reported rather than overwritten. Existing 0.2.1/0.3.0 artifact keys and source provenance are preserved.

### Patch Changes

- 7b3b0a4: Export the dependency-free `repositoryFileNode` factory from core and use its existing physical-file policy across neutral, SCIP, contract, document, routing and architecture producers. Contract consumers in spec/test files now retain Evidence kind and join the neutral file records under strict SHACL; production files remain Component and documents retain canonical Document identities.
  
  Advance deterministic extraction/assembly identities, preserve historical snapshots and semantic artifacts, label extraction-version mismatches on saved queries, and reject old versions in current validation. Validate overlays with SHACL regardless of routing configuration. Consumer adapters should adopt the public factory; this release does not modify their code or reinterpret non-document semantic assertions.
- Updated dependencies [7b3b0a4]
  - @weftlet/core@0.4.0

## 0.3.0

### Minor Changes

- 63c70f8: Add `hydrate --plan` and `--json` to inspect committed semantic documents, source approval, cache reuse estimates and document/byte budgets without loading providers or repository adapters. Incomplete scope needs review; corrupt or unavailable artifacts are distinguished from cache misses. Expose the same planner through `planHydration`.
  
  Share selection and cache identities with hydration, fix empty source lists selecting the entire repository, and resolve agent scope against the requested commit. New snapshots use graph-v6 while saved snapshots remain available and valid 0.2.1 semantic artifacts remain reusable. Recursive document traversal and operational-configuration cache reuse remain separate work.

### Patch Changes

- e45fda5: Accelerate full SHACL validation by indexing all assertion triples in a temporary union graph. Preserve the unchanged constraints, failure diagnostics, named-graph queries and provenance; no validation result is skipped or reused. Add negative parity regressions and a bounded public scaling benchmark.
- @weftlet/core@0.3.0

## 0.2.1

### Patch Changes

- 42ba9b7: Fix cross-document semantic extraction assigning both Component and Document to the same repository document. Normalize physical document references consistently with deterministic links, preserving assertions, citations and review authority. Version the extraction cache and snapshot assembly so incompatible old artifacts are not reused; old saved snapshots remain available. The first refresh re-extracts semantic sources, and subsequent unchanged refreshes reuse the corrected artifacts.
- @weftlet/core@0.2.1

## 0.2.0

### Minor Changes

- 991f93b: Resolve explicit Markdown document links against committed files, preserving precise citations and evidence authority. Report missing targets without guessing or expanding directory mentions, and align test-file identities with SCIP. New graph-v3 snapshots preserve older saved evidence. Add implementation references to the project docs and package the Markdown parser for independent consumers.
- 1c2c699: Add opt-in committed TypeScript source projects with explicit test-file selection and local package aliases. Keep source-project changes and indexed workspace imports in draft overlay scope, and document the measured impact-retrieval improvement on Weftlet.
- 5b8d496: Add opt-in committed routing declarations for explicitly mapped producer/consumer dependencies.
  Preserve declaration citations and inferred authority, report missing/ambiguous mappings, and
  rebuild draft routing evidence across edits, renames and deletions without replacing saved snapshots.

### Patch Changes

- 8e82453: Document a reproducible impact-retrieval baseline on Weftlet's own source, with bounded recall, extraction gaps and explicit limits on semantic-quality claims.
- 2e4a3bb: Prioritize nearby consumers and varied evidence sources in impact.scan while preserving the same reachable facts and continuation coverage. De-emphasize shared unresolved imports and keep keyword matches within proximity tiers. Responses identify the ranking version; continuation tokens from older orderings require restarting the scan. Saved snapshots remain unchanged and can be queried without refresh.
- e54ad71: Scope relative module requests to their importing directory so identical import spellings
  do not connect unrelated domains. Refreshes and draft overlays receive versioned identities;
  existing snapshots remain queryable and unchanged semantic artifacts remain reusable.
- 6f2f83f: Support standard global and local npm Codex launchers on Windows consistently across diagnostics,
  login checks and extraction, without a command shell. Bound executable discovery and terminate
  launcher child processes on cancellation. Preserve inventory integrity across Git CRLF checkouts
  and accept CRLF formatting in generated license notices while still rejecting substantive edits.
- Updated dependencies [2e4a3bb]
  - @weftlet/core@0.2.0

## 0.1.2

### Patch Changes

- 7969bc5: Add reviewed release PR automation, synchronized package versions and changelogs, and
  verified package tags and GitHub Releases after trusted npm publication.
- Updated dependencies [7969bc5]
  - @weftlet/core@0.1.2
