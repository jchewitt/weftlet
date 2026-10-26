# ADR-017: Validate a temporary RDF union without changing canonical evidence

Status: accepted and implemented for the focused 0.3.0 release plan; absent from 0.2.1.
See [validation](VALIDATION.md) for checks and recorded publication evidence.

## Problem and measured mechanism

The canonical RDF dataset has one named relationship graph per assertion, with assertion records,
node metadata and provenance in the default graph. The JavaScript `rdf-validate-shacl` validator
uses graph-wildcard dataset lookups through clownface. N3 indexes graphs first, so a lookup with
no graph restriction visits each graph before consulting its subject/predicate/object indexes.
Repeating those lookups for each focus node and shape property becomes expensive as assertion
graphs grow.

Bounded public experiments measured this cost in the current layout and compared an indexed union
using the same validator and shapes. They establish a synthetic scaling problem and a useful
optimization; they do not reproduce the private consumer's complete generation or diagnose its
reported 30-minute timeout. The consumer's total graph size and other phase costs remain unknown.

## Decision

For each `RdfEvidenceGraph.validate()` call, build a temporary single-default-graph N3 store from
every subject/predicate/object triple in the canonical dataset. Run the unchanged SHACL shapes
and validator on that store, and retain the existing explicit citation-order check. The canonical
named dataset remains unchanged and continues to serve SPARQL, fact projection and serialization.

This is still full-graph validation on every refresh. It introduces no GraphDB service, native/Rust
validator, incremental validation or validation-result cache. The short-lived union is not retained
as another persistent graph or used to replace canonical evidence.

RDF graphs are sets: identical SPO triples from multiple named graphs collapse in the validation
projection. The present shapes already use union lookups and node/value sets, and do not inspect
graph identity. Separate assertion records and their cited provenance remain intact in the original
dataset; no assertion, shape or constraint is removed. A future graph-sensitive shape requires an
explicit compatibility decision and new equivalence tests before using this projection.

## Bounded public measurements

Environment: Linux cloud workspace, Node 24.19.0, N3 2.7.2 and rdf-validate-shacl 0.6.5.
Each case ran once in a fresh child process with a 45-second hard deadline. The prototype copied
the same original dataset into a single graph only for validation; production-patch verification
is recorded separately in [VALIDATION.md](VALIDATION.md).

Fixtures contain public synthetic Workflow-to-Component assertions, cited metadata and one named
relationship graph per fact. Shared topology repeats 50 nodes; unique topology uses two distinct
nodes per fact. Timings below are seconds, with union construction separated from SHACL. RSS is
the process sample after validation, including Node, libraries and both datasets, not a measurement
of projection memory alone.

| Facts / topology | Original quads | Original SHACL | Union construction | Union SHACL | Union RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 shared | 20,203 | 3.889 | 0.061 | 0.239 | 352.3 |
| 2,000 shared | 40,203 | 19.550 | 0.102 | 0.410 | 440.0 |
| 1,000 unique | 28,003 | 5.731 | 0.104 | 0.308 | 352.6 |
| 2,000 unique | 56,003 | 31.502 | 0.153 | 0.467 | 457.9 |
| 5,000 shared | 100,203 | No verdict before process deadline | 0.251 | 1.131 | 825.5 |
| 10,000 unique | 280,003 | Not measured | 0.779 | 2.119 | 1,287.3 |

The 5,000-fact original-mode process was terminated after 45.051 seconds total elapsed time,
including startup and construction. It produced no SHACL verdict; this is not an inferred
completed validation duration. For the 10,000-fact unique union case, initial canonical graph
construction took 1.058 seconds in addition to the times shown. Its roughly 1.3 GiB RSS is a
material memory cost and should be measured on larger or different workloads.

These single runs are not statistical latency estimates or production guarantees. The experiment
does not measure semantic extraction, SCIP, SPARQL, serialization, snapshot publication or disk
storage. No private consumer data or live provider calls were used. The repository benchmark
`pnpm benchmark:shacl` reproduces bounded public comparisons using the current build; retain its
configuration, versions and raw output when comparing results.

## Correctness and compatibility

The prototype compared sorted conformance issues between the original and union paths across
valid repeated relationships/attributes, conflicting node kinds, out-of-range confidence, invalid
citations, empty citation paths, colliding assertion IDs and combined violations. All seven paired
cases agreed, and before/after serialization hashes preserved the canonical named dataset.

Production regressions must compare both paths for all supported constraints, including negative
cases, and preserve named-graph SPARQL results, fact projection, serialization and repeated calls.
Those checks establish parity for the current shapes, not arbitrary future SHACL rules. Failed
validation must continue to prevent publication and preserve the previous valid snapshot.

The optimization changes neither facts nor evidence authority and does not require a new semantic
cache identity. It does not make old evidence eligible for current-diff gates. Normal snapshot
commit, configuration, scope and provenance checks continue to apply.

## Release boundary and remaining T05 work

Ship the demonstrated cold-validation improvement after its independent review and required
validation, ahead of unrelated 1.0 work. A first graph cannot benefit from reusing a successful
validation result that does not yet exist. Private consumer acceptance remains pending after release.

Early identity checks, detailed progress/elapsed reporting, validation-result caching and safe
incremental validation remain open. The validator's main validation loop is synchronous; timers
on the same JavaScript thread cannot show a live heartbeat while it is blocked. Keep phase
boundaries honest and evaluate bounded worker execution before promising in-phase progress or
cancellation. Any later cached or incremental result must account for graph content, shapes,
validator/policy versions, deletions, affected relationships and global constraints, with full
validation when safe scope cannot be established.

Native engines and optional persistent database backends remain measurement-driven alternatives,
not prerequisites of this release. See the [1.0 task list](RELEASE-1.0-PLAN.md).
