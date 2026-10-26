# @weftlet/toolkit

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
