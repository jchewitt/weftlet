# @weftlet/core

## 0.6.1

No changes in this release.

## 0.6.0

### Minor Changes

- 6c59746: Add explicit source roles and SOT owner mappings to prospective document coverage, with a bounded JSON policy supplied through `documents plan --document-policy`. Report ambiguous, unavailable and ineligible ownership without transferring approval.
  
  Expose a deterministic document-evidence extractor that retains cited document presence and references, including empty validation documents. Preserve optional source metadata through RDF/SHACL, queries and the viewer while keeping existing hydration, cache identities and legacy facts compatible. Traversal-driven hydration remains a separate increment.
- b44053f: Add opt-in committed document traversal to hydration and its no-model plan. Report coverage and
  source ownership, retain validation documents as deterministic evidence without model extraction,
  reuse compatible artifacts, and invalidate changed or unreachable draft document relationships.
  Preserve direct-source configuration, strict SHACL, saved snapshots and assertion authority.

### Patch Changes

- d3fe532: Count code implementation and consumer evidence independently of its display group, including SCIP and contract relationships. Mark coverage as nonexclusive and scoped to the returned page, preserve evidence authority and snapshot bytes, and avoid query-wide absence claims for paginated results.

## 0.5.0

No changes in this release.

## 0.4.0

### Minor Changes

- 7b3b0a4: Export the dependency-free `repositoryFileNode` factory from core and use its existing physical-file policy across neutral, SCIP, contract, document, routing and architecture producers. Contract consumers in spec/test files now retain Evidence kind and join the neutral file records under strict SHACL; production files remain Component and documents retain canonical Document identities.
  
  Advance deterministic extraction/assembly identities, preserve historical snapshots and semantic artifacts, label extraction-version mismatches on saved queries, and reject old versions in current validation. Validate overlays with SHACL regardless of routing configuration. Consumer adapters should adopt the public factory; this release does not modify their code or reinterpret non-document semantic assertions.

## 0.3.0

No changes in this release.

## 0.2.1

No changes in this release.

## 0.2.0

### Patch Changes

- 2e4a3bb: Prioritize nearby consumers and varied evidence sources in impact.scan while preserving the same reachable facts and continuation coverage. De-emphasize shared unresolved imports and keep keyword matches within proximity tiers. Responses identify the ranking version; continuation tokens from older orderings require restarting the scan. Saved snapshots remain unchanged and can be queried without refresh.

## 0.1.2

### Patch Changes

- 7969bc5: Add reviewed release PR automation, synchronized package versions and changelogs, and
  verified package tags and GitHub Releases after trusted npm publication.
