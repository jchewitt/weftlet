# ADR 027: Retain full validation after bounded lifecycle and native evaluation

Status: accepted engineering decision for the 1.0 candidate, 2026-10-28. Private consumer
performance acceptance and official 1.0 remain separate gates. This increment changes development
benchmarks, tests and documentation; it does not change the runtime validator or publish a release.

## Decision

Keep complete, direct `rdf-validate-shacl` validation over the full SPO union, with the unchanged
shapes and supplemental citation-order check. Preserve the canonical named graph, provenance,
authority and prior published snapshots. Saved-snapshot queries remain independent of rebuilding.

Do not add a mandatory worker, validation receipt cache, incremental validator, Rust binary or
graph database for 1.0. The evaluations below support this choice; these capabilities are not
delivered or silently assumed. Reconsider when a measured consumer workload demonstrates a need.
Memory remains a material limitation, and these results do not establish a maximum supported
repository size or diagnose the private consumer's earlier 30-minute generation timeout.

The cold-path change in [ADR 017](ADR-017-shacl-validation-union.md) and identity/phase diagnostics
in [ADR 021](ADR-021-identity-preflight-and-validation-timing.md) remain the production improvements.
This decision closes their remaining engineering evaluation items without changing those
historical measurements. It does not waive genuine consumer hydration/repeat acceptance.

## Measurements and reproducibility

Raw, public, metrics-only records are in [the benchmark directory](benchmarks/validation-2026-10-28/README.md).
They contain versions, source/harness hashes, fixture/fact/node/quad counts, complete case results,
diagnostic hashes, timings and resource observations. There are no private graphs, model prompts,
credentials or live provider calls. Runtime code is unchanged from `174f2ae`.

Linux x64, Node 24.19.0, pnpm 10.18.2, N3 2.7.2 and rdf-validate-shacl 0.6.5 were used in a
32 GiB cloud container. Every fixture/mode/sample used a fresh bounded child, three samples per
case; garbage collection before cases was outside measurement. Repeated cases share their
session's imports/JIT state. The pipeline uses actual committed prose, the real Codex adapter
with a deterministic offline runner, real SCIP, cross-source linkage, SHACL and snapshot storage.
Its six eligible prose artifacts were reused on repeat; this does not test a live model.

Cold full-validation medians (union construction plus SHACL and the supplemental check):

| Input | Facts / nodes / canonical quads | Direct | Worker | Largest direct process RSS |
| --- | --- | ---: | ---: | ---: |
| Extracted six-stage pipeline | 241 / 97 / 4,929 | 167 ms | 159 ms | 308 MiB |
| Shared identities | 2,000 / 50 / 40,203 | 530 ms | 596 ms | 519 MiB |
| Unique identities | 2,000 / 4,000 / 56,003 | 620 ms | 696 ms | 554 MiB |
| Dense source metadata | 2,000 / 50 / 48,203 | 1,445 ms | 1,441 ms | 900 MiB |
| Unique identities | 10,000 / 20,000 / 280,003 | 2,860 ms | 2,830 ms | 1,676 MiB |
| Dense source metadata | 10,000 / 50 / 240,203 | 5,668 ms | 5,929 ms | 1,758 MiB |

RSS is the largest sampled process high-water mark across the reported lifecycle, not SHACL's
isolated allocation. It includes imports, fixture, canonical graph, serialization and union;
worker RSS includes its parent. The largest dense 10,000-fact worker case reached 3,058 MiB.
Dense fixtures attach source role/policy/ownership metadata to every fact, exercising the new
ownership disjunction. They are stress fixtures, not a claim about consumer metadata density.
The large cases are cold-only; the smaller fixtures include repeat and edits. There are 258
completed direct/worker cases and 18 paired sample groups with exact verdict/data equality.

Same-object repeat and rebuilt-identical graphs still execute full validation. Direct medians
for repeat/rebuild were 110/113 ms (pipeline), 471/481 ms (shared), 602/636 ms (unique), and
1,336/1,246 ms (dense). Insert, update, delete, rename, negative confidence, shared-identity
conflict and repair-by-deletion all use complete candidate graphs, retain canonical serialization,
and produce the expected verdict. This is correctness/performance evidence for full validation,
not an incremental algorithm. No timing thresholds are CI gates.

## Worker evaluation

The development worker uses the identical validator, shapes, input and full validation call.
All compared verdicts and serialized input hashes match direct execution, including failures.
The parent timer remains responsive: around 21 ms in 10,000-fact cases versus 5.4–8.2 seconds
for the direct harness operation (construction, serialization and validation combined). This
timer measures responsiveness, not percentage complete. Worker startup was approximately 0.8
seconds, structured cloning has a cost, and throughput/memory advantages were not consistent.

A bounded prototype terminates the worker after its actual SHACL-started boundary. In the
recorded runs termination took about 19–22 ms; no verdict was returned or accepted, and there is
no storage/publication call in this probe. This does not establish production cancellation or
failure recovery across a new worker boundary. Current runtime progress remains truthful phase
boundaries; in-phase heartbeat, interruption and worker memory limits would need separate API,
packaging, cancellation and head-preservation integration. There is no measured need to introduce
that complexity into this candidate.

## Exact successful-result reuse

The study computes an experimental key over complete named RDF serialization plus validator,
shape, authority/progress code hashes, workspace dependency lock and Node version. It never reads
a cached verdict: every case validates. Identical/rebuilt/repaired input yields the same key;
edits and a manifest-only timestamp change yield different keys even when conformance is unchanged.
Serialization plus hashing alone costs roughly 23 ms for the cold pipeline, 137 ms for 2,000
shared facts, 157 ms for 2,000 unique facts and 125 ms for 2,000 dense facts. Graph construction
is still required. A manifest timestamp therefore prevents reuse across otherwise equivalent
hydrations under this conservative key.

Do not ship this prototype as a cache. A production receipt needs a reviewed validation dependency
key, actual resolved engine/dependency identities, complete supplemental-rule inputs, coherent
immutable input, atomically written and checked successful receipts, and invalidation for every
shape/policy/semantic change. Excluding manifest fields is a separate correctness decision, not
an arbitrary optimization. A failed/missing/corrupt receipt must trigger full validation; no
receipt may satisfy current commit/scope/working-diff freshness requirements on historical data.
The measured seconds saved do not yet justify that state and trust surface for 1.0.

## Dependency-aware incremental evaluation

The regression demonstrates a concrete counterexample: validating a changed assertion alone
passes, while joining it with the unchanged producer of the same node fails `kind` maxCount.
Revalidating all producers of that identity reproduces the full verdict. Removing the conflicting
old producer repairs the graph without adding a fact. Renames require both old and new identities;
source-role/ownership checks also depend on all contributing assertions at a fact identity.

A safe implementation would need an index of every shape target and dependency, old/new affected
subjects and property values, removed targets, identities and incoming/outgoing relationships,
plus invalidation of prior violations. Shape/validator/policy changes and unbounded/global rules
require full fallback. There is no such reviewed dependency index in the toolkit. Retain full
validation for insertions, updates, deletions and renames; do not call a changed-facts pass a valid
whole-graph verdict. No previous violation is baselined away by this decision.

## Native candidate

Material memory use justified a bounded evaluation of **Rudof 0.3.35**, an Apache-2.0 Rust CLI.
The official Linux GNU asset was downloaded outside the repository and verified against its
release SHA-256. No binary, dependency or license requirement is added to the product.

The probe exports every SPO triple, passes the exact current shapes, and applies the same JS
citation-order supplement (which is not itself a SHACL shape). All 29 public cases agree on
conformance and diagnostic locations. Exact diagnostic multiplicity agrees on 27: for non-integer
start/end lines Rudof emits two results at the failing property where the current validator emits
one. Neither validator accepts those inputs. The raw report retains both diagnostics; no shape,
failure or assertion is suppressed. The probe exits 1 to make this exact-parity difference visible.

Each timing sample starts a fresh native process, with a 30-second whole-process-group deadline:

| Input | Native parse/startup/validation median | Node export preparation, measured once | Largest native-only RSS |
| --- | ---: | ---: | ---: |
| 2,000 unique facts | 1,049 ms | 711 ms | 488 MiB |
| 10,000 unique facts | 4,631 ms | 4,377 ms | 2,264 MiB |
| 2,000 dense facts | 968 ms | 833 ms | 552 MiB |
| 10,000 dense facts | 5,217 ms | 3,318 ms | 2,534 MiB |

Native time includes the Python measurement wrapper, process startup and RDF parsing, unlike the
JS validation-only column. Its RSS excludes the Node graph/export process; these columns are not
engine-only apples-to-apples comparisons. Native dense SHACL invocation is competitive, but this
file-transfer integration provides no demonstrated overall latency or memory win. An embedded
binding might behave differently; this experiment does not measure one or generalize to all Rust
engines. Native Windows/macOS installation, release asset delivery, supply-chain verification,
schema evolution and diagnostic compatibility would also need support. Do not make it mandatory
or add an optional backend that cannot yet be maintained and validated across supported installs.
No graph database was benchmarked: there is no demonstrated persistent-service need, and adding
one would change the toolkit's installation and operational boundary.

## Acceptance still required

Retain full upstream positive/negative/provenance/packaged-installation gates. Publish the reviewed
minor candidate before the consumer trial. Record genuine cold and repeated hydration, successful
full SHACL and snapshot publication, semantic reuse, observed resource/phase timing, saved querying
and the approved ten-minute provider retry in TradePilot. These public measurements cannot supply
that acceptance. Browser/live-auth work remains separately tentative as previously agreed; official
1.0 requires the consumer result and release review.
