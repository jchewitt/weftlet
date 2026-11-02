# ADR 040: Preserve evidence while removing whole-graph string and RDF copies

Status: implemented; large-corpus qualification in progress. Consumer acceptance remains open.

## Problem

The 0.7.0 consumer report reaches 561,777 facts / 174,710 nodes, reusing 18 semantic artifacts
without model calls, then fails at `sha256(stableJson(logical))`. Node's string ceiling is
536,870,888 UTF-16 code units; increasing the heap does not remove it. Snapshot JSON writing,
JSON reload and full RDF exports had similar allocations. The old internal SPARQL projection
also rejected more than 100,000 facts.

A generated public TypeScript corpus additionally demonstrated the memory cost of retaining a
full named N3 dataset and its validation union simultaneously. The fix must retain every assertion,
test fact, citation, confidence, authority and review state. It does not change extraction scope.

## Decision

- `stableJsonDigest` incrementally hashes the **existing encoding**, including sorted keys,
  escaping, number formatting and legacy undefined-field behavior. `persistedJsonDigest` retains
  the existing JSON-normalized digest contract. Neither is a new canonicalization standard.
- Stream ordinary snapshot/artifact JSON to exclusive temporary files, then publish with the
  existing atomic hard-link/head replacement rules. Read JSON incrementally with a strict parser.
  Header-only checks parse the complete document but retain only the manifest. Old files need no
  migration and existing immutable winners are never rewritten.
- Stream default semantic N-Triples and optional openCAESAR file digests, preserving their existing
  byte encodings and hashes. No Docker or provider is required to query saved evidence.
- Use one RDF encoder for named exports, SPARQL matching and validation partitions. RDF/JS matching
  streams complete groups and indexes subject/graph lookups; Comunica remains the SPARQL engine.
  Cardinalities are exact, never guessed for optimizer shortcuts. The traversal record projection
  has equivalence tests against SPARQL, including duplicate-ID join multiplicity, and no graph-size
  response cap. Public query result limits still report truncation.
- `serializeChunks()` / `serializeTo(writable)` export complete N-Quads with backpressure. The
  legacy `serialize(): Promise<string>` convenience necessarily remains limited by the JavaScript
  string ceiling. N-Quads ordering can differ from 0.7.0; its quad set is unchanged. Export order
  is not a snapshot identity. Snapshot JSON encoding and semantic RDF digests are preserved.

## Strict SHACL without two complete RDF stores

Keep `rdf-validate-shacl` and every current constraint. Group all outgoing triples for a subject
together, including every occurrence of a shared identity; do not validate isolated conflicting
assertions as if each were a separate node. Current shapes inspect direct outgoing properties;
their only cross-subject constraint is `sh:class`. Supply complete graph-wide `rdf:type` membership
for those references. Determine the original targets before adding support-only type triples and
express those same targets as `sh:targetNode` for the batch. Support-only nodes are checked with
their complete records in their own batch.

Every subject and constraint is evaluated. Missing proof targets, contradictory metadata, kind
conflicts, corrupt citations and malformed code evidence still fail. Existing TypeScript proof
and provenance checks run over all facts after SHACL. No validation result is reused or inferred
from semantic cache hits. An allowlist rejects new SHACL vocabulary or non-direct paths until
partition locality is reviewed; unsupported constraints cannot silently pass. Batch progress
reports completed groups and elapsed time, not an estimated completion time.

This changes execution/storage, not asserted semantics: assembly 12, extractor identities,
semantic cache keys, schema version and logical snapshot IDs remain unchanged. Old snapshots stay
addressable; existing extraction incompatibility checks still apply.

## Validation and limits

Tests compare against a frozen 0.7.0 RDF builder at
`073edab3f1cef875f2fc058ffbc0ddc59cf934d2`. They compare complete named and union quad sets,
positive/negative verdicts and issues, real SCIP/code-proof metadata, cross-partition class
references, aggregates and traversal projections. Hash compatibility includes Unicode, surrogate
boundaries, optional fields and an encoding larger than V8's actual string ceiling. Storage tests
cover malformed/truncated JSON, special property names, legacy files and concurrent publication.

The repeatable public workload is generated TypeScript with shared helpers, same-file and
cross-file calls, spec files and 18 prose documents. Its provider is a deterministic fixture
parser, not a live model. It exercises real SCIP, strict hydration, snapshot reload, streaming
N-Quads parsing and bounded SPARQL, unchanged repeat and clean comparison; it asserts canonical
encoding size above the actual string ceiling, exact provenance, semantic reuse, unchanged
versions and immutable snapshot/artifact bytes.

```sh
pnpm build
pnpm exec vitest run tests/large-graph-lifecycle.test.ts tests/rdf-scaling-parity.test.ts
node --max-old-space-size=8192 --import tsx scripts/large-graph/run.ts 1100 40 --require-large
```

The large run is deliberately separate from ordinary CI; its scaled fixture runs in CI.
Full-run results must be recorded in VALIDATION.md before claiming qualification. Linux results
do not establish native Windows consumer acceptance. This is a capacity regression, not a
semantic-quality or universal performance guarantee. Parsed graph objects and indexes still use
memory; a single very large record/identity can exceed a group target. Arbitrary SPARQL joins,
sorts and aggregates have their own time/memory costs. There is no persistent graph database,
incremental-validation cache or Rust validator in this change.
