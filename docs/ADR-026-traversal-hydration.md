# ADR 026: Explicit traversal hydration with separate source and assertion authority

Status: accepted and merged in PR 44 after local/hosted validation. Publication and consumer
acceptance remain separate; exact commits and checks are recorded in [validation](VALIDATION.md).

## Context

T07a follows canonical committed Markdown links; T07b classifies source roles/owners and extracts
cited document presence/references. Neither changed hydration. Consumers need one reviewed scope
for preview, extraction, cache recovery and saved queries, including validation evidence that is
unsuitable for product-intent extraction. A broad source list or a capped agent search must not
silently replace that scope.

## Decision

An optional `documentTraversal` object in `context-graph.config.json` activates traversal hydration.
It accepts exact `entryPoints`, optional document `roots`, bounded `maxReadDocuments`, `maxReadBytes`
and `maxDocumentBytes`, and an inline T07b `policy`. Unknown controls are rejected. It replaces the
legacy `semanticSources` list for this mode. Existing direct configurations keep their behavior and
identity. Combining traversal with `agentContext`, or a programmatic `semanticSources` override,
is rejected rather than silently narrowing or broadening scope. Requests may still filter saved
impact queries; they do not change the traversal hydration selection.

`selectHydrationInputs` is shared by hydration, `hydrate --plan`, explicit cache adoption and draft
selection. Committed Git objects provide the closure despite working changes. Every discovered
source is reported; canonical cycles/shared targets extract once. Missing/unsupported/ambiguous
links, unread coverage, ambiguous source roles and semantic budget errors stop new model work
before ontology readiness, indexing or extraction. Existing completed artifacts and snapshot heads
remain intact. The no-model plan retains the full report on failure. Ordinary hydration points to
that local report without printing document paths/content in its new selection error.

Validation roles default from `evidenceRoots`, with explicit role mappings taking precedence. They
receive deterministic presence/reference evidence, including empty reports, and no model calls.
Semantic budgets count the remaining eligible sources; separate traversal read limits bound all
read sources. The nested traversal report's comparison ceilings are the maximum supported read
values, not a paid-work estimate; the plan's top-level `budgets` describes actual extraction limits.
An explicit non-validation override is a maintainer policy choice, never model inference.

Intent, plan, reference and unclassified sources may be extracted. Unresolved/ambiguous owner
mappings remain visible diagnostics, not newly invented hard CI rules. A valid owner must itself
be reached, approved and unambiguously intent. Being linked to an owner never approves a child,
and source approval never approves a model assertion. Policy role describes source context, not
a guarantee that every sentence is a business requirement. Model assertions stay inferred and
unreviewed; structural facts stay deterministic and inferred. Neither a written “PASS” nor the
presence of a test link asserts test execution.

The canonical document extractor owns Markdown references in this mode. The legacy linker still
emits assertion containment and supported bare/inline-code references. Assembly attaches role,
source authority, ownership and policy digest without modifying immutable provider artifacts.
Strict identity checks and SHACL remain required; assertions and contradictory evidence are not
silently removed to pass validation.

## Identity, reuse and overlays

Snapshots bind the full configuration, closure/classification digest and `document-selection-v1`
plus `document-evidence-extractor:1.0.0`. Core adds an optional `DocumentSelectionRecord`; saved
JSON, Markdown and HTML expose coverage separately from ownership and assertion approval. Older
snapshots remain queryable and cannot satisfy current-config/extractor/commit checks.

The unchanged built-in Codex adapter receives one source without traversal/owner metadata.
Its source/provider/prompt/version/confidence key remains intact. Its user-cache partition ignores
only the validated `documentTraversal` field in addition to the five existing operational semantic
controls. Enabling traversal or changing role/owner/read limits can reuse unchanged artifacts;
source selection changes and source/model/version/approval changes retain existing conservative
identity behavior. Snapshot profiles always retain the entire configuration. Explicit legacy
cache adoption keeps conflict checks and never scans unrelated profiles.

Custom modules are trusted code with an explicit versioned provider contract. Traversal modules
get a separate full-config `document-semantic-v1` artifact namespace even in workspace storage.
Direct-mode artifacts and changed configurations cannot be silently reused there. Identical
configuration and unchanged source identities reuse; providers with additional mutable inputs
must version their declared contract or force extraction. No arbitrary context-dependent module
is promised automatic dependency discovery.

Draft overlays recompute the closure from the isolated base plus captured bytes. They rebuild
presence/references with draft authority, invalidate changed/deleted/unreachable sources and
assertions whose owner changed, and retain only matching source/policy/ownership evidence. An
incomplete closure invalidates all retained document assertions and is labeled incomplete; it can
still be queried as a draft. No model runs. Temporary Git timestamps are excluded from draft
selection identity; the base SHA and capture digest bind it instead. Committed heads are unchanged.

## Validation and limits

Public fixtures compose actual committed traversal, unchanged Codex schema/citation handling with
an offline prose parser, real SCIP and strict RDF/SHACL. They cover the six-stage asynchronous
pipeline, warm reuse, configuration/cache isolation, source authority, rename/delete/reachability,
owner edits, draft gaps and saved-history freshness. CLI preview uses unavailable infrastructure
sentinels; installed consumer smoke uses the versioned module contract and real indexing.
These tests do not claim live model quality, browser interaction or TradePilot acceptance.

`documents plan --document-policy` remains a separate prospective operation, including its own
all-document budget comparison. Use `hydrate --plan` with the execution configuration to predict
actual extraction and reuse. No documentation generation/backfill, ownership inference, approval
UI, remote source adapter or model orchestration integration is added by this decision.
