# ADR-015: Canonical repository document identities

Status: accepted for the document identity patch.

## Problem

The 0.2.0 semantic prompt requested `component:file:<path>` for every repository path,
while deterministic Markdown linking used `document:<path>` for document files.
Independently valid model assertions could assign Component and Document to the same
file ID. Combining those facts correctly failed the single-kind SHACL constraint.
This is an extraction identity defect, not evidence of contradictory product intent.

## Decision

Physical repository documents ending in `.md`, `.mdx` or `.txt` use
`document:<repository-relative-path>` with kind Document. The semantic hydration
boundary canonicalizes both reserved prefixes (`component:file:` and `document:`)
for those extensions, using the same file-node policy as deterministic document links.
This applies to Codex and module providers, before fact IDs, OML and artifact hashes
are computed. Diagnostic references are remapped with the assertions.

Paths retain their exact spelling and case; no basename matching, existence guess,
ownership inference or concept merging is performed. Distinct business concepts such
as `contract:retention` remain separate from the document that describes them.
Every assertion, predicate, citation, confidence and label is retained. Raw provider
output remains unchanged for inspection. Normalizing physical identity never approves
an assertion or establishes that a referenced file exists. Snapshot assembly continues
to mark semantic assertions inferred/unreviewed, independently of source approval.

The RDF identity and SHACL shape stay unchanged. Other conflicting kinds still fail
validation; this policy does not hide genuine conflicts or remove assertions.

## Artifact and snapshot migration

An implementation-owned `repositoryNodeIdentityVersion: 1` participates in every
semantic artifact key, including custom providers with unchanged user configuration.
Codex's prompt contract advances to v3. Assembly advances to `graph-v5`, records the
policy version in the manifest and uses a different immutable snapshot ID even for
the same commit/configuration. Historical snapshots and artifacts remain untouched
and queryable; they are not relabeled as newly validated evidence.

The first semantic refresh after upgrading requires extraction under the new contract.
Unchanged subsequent refreshes reuse the new artifacts. Do not delete the old cache or
force a revision as an upgrade workaround. Provider cost for that first refresh remains
subject to the consumer's configured budgets and authorization.

## Validation and limits

The public regression uses two committed documents referencing the same implementation
document, a deterministic module provider returning the conflicting legacy identities,
real TypeScript indexing, deterministic links and RDF/SHACL. It checks preserved facts,
citations and review authority, old-cache isolation and repeat reuse. An unnormalized
negative control retains the SHACL failure. This is provider-independent deterministic
coverage, not a claim that a private consumer's full extraction has passed.

Operational-config cache reuse, broad identity diagnostics and full-graph SHACL latency
remain separate work in the [1.0 plan](RELEASE-1.0-PLAN.md).
