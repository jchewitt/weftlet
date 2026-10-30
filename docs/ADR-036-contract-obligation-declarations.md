# ADR 036: Cited producer and consumer obligations

Status: B4a implementation; validation recorded separately. B4b compatibility acceptance is next.

## Scope and choice

Free-text `governedBy` assertions and explicit routing declarations already preserve business
rules and asynchronous handoffs. They do not provide structured fields for comparing the two
sides. B4a adds an optional deterministic declaration in selected Markdown, using existing
`emits` and `consumes` relations to a shared Contract node. This is an exact opt-in path;
ordinary prose remains available through existing semantic extraction. No new model prompt,
provider schema or semantic artifact identity is introduced. Automatic conversion of prose
into these declarations is not implemented or claimed.

Use one JSON object in a `weftlet-obligation` fenced block:

```weftlet-obligation
{
  "schemaVersion": 1,
  "id": "execution-age",
  "role": "requirement",
  "endpoint": "services/execution/src/execute.ts",
  "contract": {
    "scope": "readings",
    "id": "stored-reading",
    "kind": "stored-data",
    "version": "1"
  },
  "statement": "Execution revalidates reading age immediately before use.",
  "domain": "sensors",
  "stage": "execution",
  "constraint": {
    "metric": "reading-age",
    "operator": "at-most",
    "value": 60,
    "unit": "seconds"
  },
  "revalidation": "required"
}
```

Required fields are schemaVersion, id, role, endpoint, contract and statement. Role is
`guarantee` (producer) or `requirement` (consumer); transport kind is `queue` or `stored-data`.
Domain, stage, contract version, constraint and consumer revalidation are optional. A constraint
requires a metric, finite numeric value and operator (`at-most`, `at-least`, `equal`); its unit
may be unknown. Revalidation accepts `required` or `not-required` on consumers only. Omitted
values stay absent in JSON/RDF and display as unknown. No default time unit, normalization,
semantic equivalence, unit conversion or compatibility interpretation is performed.

The endpoint is an exact repository-relative regular committed file. Its canonical physical
kind is retained, including Evidence for test/spec files. Existing indexed facts let agents
continue into code, but the declaration establishes neither a particular function mapping nor
implementation correctness. Function-level mappings remain the explicit selectors in ADR 033.

## Identity and authority

Contract identity hashes repository ID, exact scope, contract ID, transport kind and version.
Labels, endpoint paths and statement wording do not determine this identity. Missing version is
unknown and does not join a named version. The namespace is explicit; equal names across scopes,
repositories, transports or versions never imply a shared contract. Domain is a cited descriptive
field, not an implicit identity override: contradictory descriptions are retained for review.

`GraphFact.contractObligation` retains the complete typed declaration and endpoint source
path/digest/SHA. Main provenance cites the exact Markdown fence in the original committed bytes.
The assertion has inferred authority and deterministic extraction review. Configured source
approval, role and traversal ownership metadata remain independent. Deterministic parsing is not
an approval process. Plans and unclassified documents cannot silently become approved intent.
Validation documents are excluded from obligation assertions with a cited diagnostic, including
directly selected evidence-root documents without traversal.

Both sides connect through the contract, independently of imports, calls or a particular queue
library. This is documented dependency evidence, not observed message delivery, shared storage
access or proof of fulfillment. Existing runtime evidence remains separately authoritative for
what was observed. Different limits at different stages are not automatically contradictions.

## Integrity, bounds and lifecycle

Unknown fields, duplicate JSON keys, invalid paths, nonfinite values and unsupported enums
produce cited extraction gaps with no partial declaration. Missing, symlink or submodule
endpoints cannot create joins. Duplicate declaration IDs within a source retain every valid
assertion and report ambiguity; no assertion silently wins. Contracts with only one role in
the selected structured declarations report the missing counterpart without claiming repository-
wide absence. No text matching or implied route fills those gaps.

Extraction uses already selected committed sources, including traversal-read validation docs
solely to report exclusions. It performs no provider call. Each block is limited to 64 KiB;
overlong blocks report a gap. More than 500 blocks abort extraction before provider/indexer work
instead of publishing a silently truncated set. Existing document-selection budgets still apply.

RDF exposes each field on its cited assertion record. SHACL checks obligation-specific cardinality,
types, roles, metadata and authority without adding a broad per-fact disjunction. Deterministic
integrity checks require canonical contract/endpoint identities, role/predicate agreement, matching
endpoint/document revision and separate implementation evidence. Shared SPARQL, neighborhoods,
paths, impact queries, Markdown and viewer details read these same facts. SHACL checks structure;
it does not establish business compatibility.

Assembly advances from 10 to 11 and records `document-obligation-extractor@1.0.0`. Historical
snapshots remain readable but are not compatible with current validation until refreshed.
Unchanged semantic artifacts remain reusable. Clean hydration reproduces declarations. Full
RDF/SHACL validation is retained; this is not incremental validation or a new graph backend.

Overlays re-read declarations from captured draft bytes and replace prior obligation facts.
Document/endpoint edits, deletes and renames regenerate or invalidate joins. All draft assertions
and endpoint citations use the base SHA plus draft content digests, not disposable checkout SHAs.
Known endpoint paths are included in capture; newly declared endpoints outside captured scope
require configured scope before rebuilding. Saved committed evidence remains unchanged.

## Acceptance and remaining work

The independent public fixture covers stored-data and queue producers/consumers with actual
TypeScript indexing, both freshness limits, missing fields, missing endpoints, unrelated same-name
domains, unknown versions and test-file classification. It exercises bounded agent queries,
SPARQL/projection parity, strict named/union SHACL, corruption negatives, unchanged semantic reuse,
clean comparison, dirty queries and renamed/deleted draft declarations. An empty offline provider
is deliberate: these structured assertions must come from the real declaration extractor.
Fresh packed-consumer smoke uses the exported API and installed runtime assets.

B4b still owns a bounded compatibility acceptance example, including consumer revalidation,
an explicit documented incompatibility and missing evidence. Any hard failure must come from an
explicit approved deterministic policy; model findings remain tentative. No such policy or gate
is introduced here. Live model quality, private consumer usefulness and browser interaction remain
separate evidence. Release PR stays open until candidate qualification.
