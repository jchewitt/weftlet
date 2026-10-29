# ADR 033: Resolve explicit document declarations to indexed code symbols

Status: accepted for B3a's second increment; npm candidate pending. This builds on ADR 032,
without a new indexer, model inference, prompt change or semantic cache invalidation.

## Explicit selection and mapping

An ordinary CommonMark link opts in with `#weftlet-symbol=<exact-name>`. The destination names
one regular committed repository file. Match an exact name, public symbol ID or qualified name
built solely from indexed lexical parents. There is no basename search, fuzzy match or inferred
call. Duplicate identities are a gap, not a first-match selection. Missing native enclosure can
prevent qualification; an exact indexed occurrence remains available.

Optional `weftlet-line` and `weftlet-column` select a particular definition/reference, using
one-based UTF-16 start positions. Both are required. The source token must equal the selector
(or the exact symbol ID must match). This resolves aliases and re-exports through native evidence,
then cites every indexed definition for that identity, including overloads. Without any indexed
definition, the target is unresolved. `.d.ts` targets remain explicitly declaration-only.

A link without a mapping title creates Document→references→CodeSymbol. A title of
`weftlet:implementedBy <business-id>` or `weftlet:verifiedBy <business-id>` instead declares that
relationship from an existing Capability, Workflow, Contract or Invariant. The ID must already
be present in non-binding facts in this assembly. Nearby prose and link labels do not declare
mappings implicitly. Reference-style Markdown retains both use and destination citations;
conflicting destinations or mapping titles produce diagnostics. Images, code blocks, ordinary
heading fragments and traversal's existing treatment of titles retain their behavior.

## Authority and evidence

The dependency-free public `DocumentCodeBinding` metadata retains the explicit selector, document
citations, selected occurrence proofs, all target definition proofs and original business-subject
proofs. Each proof names an actual fact and exact provenance. Source digest/SHA checks require
committed regular files and the same indexed revision; stale/missing definitions never resolve.

Bindings have `inferred` authority: a declaration of mapping is not proof of fulfillment. Source
approval/classification is retained independently. A binding involving unreviewed subject evidence
remains unreviewed; otherwise resolution is deterministic, never an approval workflow. Validation
sources can declare `verifiedBy` or reference code, but cannot declare `implementedBy`. No test
execution is inferred. Contradictory declarations remain evidence; this increment does not resolve
product-policy conflicts or assess semantic truth. Inferred mapping proposals are B3b.

RDF has queryable binding selectors and citation/proof relationships plus lossless JSON records.
SHACL checks metadata cardinalities/types, supported relationships, target kinds and authority.
Deterministic consistency checks compare proof IDs/provenance/review to actual same-snapshot
assertions, selector positions and revision consistency. No kind constraint is weakened.
Neighborhoods, paths, impact scans, Markdown and the viewer consume the same facts; the viewer
exposes navigation to document, selected occurrence, target definition and subject-proof sources.

## Scope, bounds and lifecycle

Only sources already selected for hydration are examined. Read traversal-selected validation
sources are also checked for explicit links without including them in semantic extraction. Source
selection/SCIP scope omissions still matter; a missing binding is not evidence of no impact.
Ordinary file links coexist with symbol bindings. Missing/ambiguous selectors report cited
`implementationGaps`. Diagnostics include at most 100 candidate IDs and the total count. An
annotated subject with more than 100 supporting facts, or a binding requiring more than 1,000
selected/definition proofs, reports an explicit gap instead of publishing a partial binding.
These are conservative first-release bounds, not a silent best-effort coverage claim.

Assembly advances from 8 to 9 and records `document-code-binding-extractor@1.0.0`. Existing
snapshots remain readable, but current validation requires refresh. Semantic provider, prompt
and artifact keys are unchanged; unchanged extraction is reused. Clean comparison reproduces
bindings. Refresh remains a full assembly/indexing operation, not incremental SHACL.

Draft overlays regenerate all bindings against reindexed captured bytes and only retained semantic
subjects. Changed/deleted/renamed source documents and targets invalidate old mappings. Draft
fact IDs and proof references are rewritten together, retain the base SHA plus draft digests, and
never expose temporary checkout SHAs. A changed rule needs semantic re-extraction before an
annotated binding to it can return. Old committed evidence stays queryable and cannot become
current validation merely because it is still useful.

## Validation and boundaries

Public acceptance runs real TypeScript SCIP, offline deterministic prose extraction, hydration,
RDF/SHACL, SPARQL, agent query facades, repeat/clean reuse and draft edits/renames/deletes. Negative
cases include stale source/target digests, ambiguous names, conflicting titles, missing definitions
and subject IDs, malformed positions and authority/provenance tampering. Fresh packed-consumer
smoke uses the public API and actual installed code evidence. See VALIDATION.md for executed gates.

This completes explicit B3a resolution. It does not provide inferred mappings, actual call edges,
producer/consumer obligation compatibility or monorepo completeness; those retain separate queue
items and acceptance criteria. The frozen B2 study is unchanged. No private source or paid model
run is required by this increment.
