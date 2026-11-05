# ADR 044: shared evidence queries for the graph explorer

Status: product direction agreed on 2026-11-05; implementation/schema details proposed.

## Context

The existing HTML viewer is a rendering of one bounded Context Pack. It cannot discover
intent outside that page or retrieve deeper neighborhoods on navigation. The maintainer
requests an intent-first interactive graph application for both portable CI reports and local
use, with optional Docker hosting and a path to 2.0 review/backfill workflows.

## Direction

Separate the explorer UI, its data-access contract, and the underlying evidence storage.
HTTP routes and MCP tools must use shared query semantics and the same saved graph facts.
The browser must not construct a competing knowledge graph, infer missing calls, or promote
implementation into intent. Preserve exact node/fact identities, provenance, source and assertion
authority, snapshot/configuration/scope metadata, coverage, bounds and deterministic continuation.

Provide discovery/search and focused navigation rather than requesting an entire graph canvas.
Treat pinned immutable snapshot indexes as reusable across queries; measure the existing repeated
load/projection/hash cost before introducing storage machinery. Any optimized projection or index
requires equivalence tests. Keep saved evidence usable without a model, formal compiler or cloud.

Use one application with two loaders: live local/hosted read-only queries and a portable indexed
export. A bundle may contain multiple assets/data shards; a single index.html is not a constraint.
Static report coverage is explicit, and unavailable operations must not silently fall back to
incomplete data. Preserve the existing bounded export API while adding the explorer path.

A deployable Docker service is useful before 2.0. Keep existing immutable graph artifacts on
persistent storage initially. PostgreSQL fits metadata and later transactional review/approval
history; an RDF store remains a measured performance option, not a prerequisite. Redis and
vector storage are optional future capabilities with distinct purposes. Do not select several
databases without a demonstrated requirement or provision shared infrastructure from this ADR.

For 2.0, reviewed proposals and publication events are versioned records associated with exact
claims and source revisions. Write-back occurs through supported source adapters, followed by
snapshot refresh. The graph is not an editable replacement for authoritative source documents.

## Acceptance and limits

The [viewer milestone plan](VIEWER-EXPLORER-PLAN.md) owns implementation increments and validation.
Demonstrate catalog/neighbor/path/evidence parity across loaders and agent-facing services,
usable browser navigation, explicit missing-intent cases, large-graph resource bounds, fresh
installation and immutable-byte preservation. Hosted deployment additionally needs reviewed
access controls and operational configuration; no private graph is uploaded by default.

No viewer implementation, database migration, hosted deployment, new provider, approval workflow
or license change is established by this decision record. Current 1.0 consumer acceptance and
the narrow SELinux release remain separately tracked.
