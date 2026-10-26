# ADR-016: Read-only hydration planning

Status: accepted and implemented in 0.3.0; absent from 0.2.1.
See [validation](VALIDATION.md) for recorded publication evidence.

## Problem

Consumers need to inspect document selection, extraction work and configured limits before
invoking a model. Constructing the execution application is unsuitable for that preview because
it loads configured repository adapters. Independently calculating source selection or cache keys
would also allow the preview to disagree with hydration.

## Decision

Provide `hydrate --plan` with a human summary and `hydrate --plan --json` with a structured
`hydration-plan` record. The public `planHydration(configPath, options)` function uses the same
planner. `--ref` resolves once to a commit SHA, including for agent scope. Configuration and
artifact storage are read from the current local environment, and the plan reports excluded
working changes rather than using their bytes as committed evidence.

The planner reads configuration, committed Git objects and existing semantic artifacts. It never
constructs an execution application or loads a configured provider/adapter. It does not probe
credentials, index TypeScript, collect runtime evidence, compile ontology artifacts, validate RDF,
publish snapshots or create cache directories. Git status disables optional locks so the preview
does not refresh the index. Source bodies and raw model output are not included in the result.

Committed source selection, duplicate semantic-ID checks and budget assessment are shared with
hydration. Provider identity and semantic artifact keys are pure functions shared with execution.
Per-source entries identify exact path/content digest, stable semantic identity, inclusion selectors,
line and UTF-8 byte counts, configured evidence role and matched source-approval patterns.

Classification follows configuration, not an inference about prose meaning. `sourceAuthority`
can be declared by an approved path while `extractionReview` remains unreviewed. A source matching
`evidenceRoots` is labeled validation evidence, but selecting it still schedules semantic extraction.
Recursive SOT traversal and default separation of validation documents belong to T07.

## Cache and readiness semantics

Cache inspection distinguishes these states without modifying evidence:

| State | Planned meaning |
| --- | --- |
| `hit` | Readable artifact matches source identity/content, extraction contract, structure and output digest |
| `miss` | No artifact exists for the current key; extraction is expected |
| `forced` | Explicit force requests fresh extraction; no forced key or artifact is created by planning |
| `corrupt` | Stored JSON, identity, structure or content digest is invalid; reuse is not claimed |
| `unavailable` | The artifact could not be read; its reuse state is unknown |

Corrupt/unavailable entries are not ordinary misses and are never silently repaired or overwritten.
An artifact can remain reusable after a source rename or a different commit with unchanged content;
its original path/commit need not equal the current path/commit. Hydration rebinds current provenance.
The preview's estimate is conditional on unchanged inputs and storage state, not a guarantee against
concurrent changes or a successful provider run.

Limits apply to every selected document, including cache hits: `maxDocuments` bounds the document
count and `maxSourceBytes` bounds each document's UTF-8 bytes. Total source bytes are reported but
are not a token or monetary budget. Selection is never trimmed to make these limits pass.

Budget, duplicate-ID and cache errors produce a blocked plan. Missing/no-document selectors and
omissions from existing bounded agent selection produce warnings and an incomplete scope that
needs review. Both yield `ready: false` and CLI exit 1, while retaining the full plan. `ready: true`
and exit 0 mean only that these planning checks passed; execution prerequisites and product-intent
completeness have not been established.

Warnings do not create new hard hydration gates. Existing hydration behavior can still publish a
new graph after deleting the last selected document, removing its old relationships. The preview
exposes that empty match for review. An explicitly empty source list is complete and selects none.

## Compatibility

The shared key/output-digest implementation preserves the released 0.2.1 semantic artifact contract,
including document identity-policy invalidation. Valid existing artifacts remain reusable; no
semantic re-extraction is required merely by this refactor. Operational configuration changes can
still affect cache identity/storage profiles; that is separate T03 work.

The empty-source fix changes graph assembly behavior: empty roots previously could enumerate all
repository documents. Assembly advances to `graph-v6` so corrected snapshots cannot collide with
immutable older snapshots at the same commit/configuration. Old snapshots remain readable and
unchanged. The requested ref also controls agent source selection instead of always using HEAD.

## Validation and next work

Public regressions cover committed and dirty inputs, unchanged index/files, absent or side-effecting
provider/adapter modules, empty scope, warm/cold/forced cache, malformed and unreadable artifacts,
released-key compatibility, budgets, duplicate IDs, missing selectors and historical agent scope
with explicit omissions. Existing rename/delete lifecycle checks remain applicable. Full validation
and release evidence are recorded separately in [VALIDATION.md](VALIDATION.md).

This increment makes no SHACL performance change. T05 will measure graph construction and full
validation before selecting caching, incremental validation or backend changes. See the
[1.0 plan](RELEASE-1.0-PLAN.md) for bounded follow-ups and the separate 2.0 platform direction.
