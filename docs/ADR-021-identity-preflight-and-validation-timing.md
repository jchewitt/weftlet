# ADR-021: Early identity conflicts and honest validation phase timing

Status: implemented in development source after 0.4.0. Publication and consumer acceptance
are separate checkpoints in [validation](VALIDATION.md). This is the bounded T05a increment.

## Decision

Before ontology compilation, invariant evaluation or RDF construction, scan every assembled
fact's subject and object identity for multiple kinds. The scan covers semantic, document,
static, adapter, routing and runtime facts, including conceptual identities. Working overlays
run the same check over retained and newly extracted facts before RDF construction/publication.
No fact, kind, ID, citation or authority is changed or discarded by the check.
This runs after semantic/static extraction; it is separate from no-model `hydrate --plan`.

`inspectGraphIdentities(facts, { repositoryId, includeDetails? })` returns a report;
`assertGraphIdentities` throws `GraphIdentityConflictError` on conflicts. Both are public toolkit
exports. A passing report has `passed: true` and **`shaclValidated: false`**. Consistent kinds
alone do not establish canonical classification, correct intent, valid citations or conformance.
The existing full RDF/SHACL path and shapes remain mandatory for successful publication. Direct
`RdfEvidenceGraph.validate()` and the saved `validate` command still run all checks and return
their existing verdict format. There is no validation cache, incremental validator or backend change.

The two-pass scan is linear in fact occurrences. The common conflict-free path creates no
per-evidence diagnostic records. On failure it reports every conflicting identity and occurrence,
including both ends of a self-reference, repeated fact IDs and late conflicts. Counts are complete;
there is no hidden document, hop or diagnostic cutoff. Reports retain input indices and side so
duplicate assertion IDs cannot conceal a producer's occurrence.

## Privacy and attribution

There was no general configurable diagnostic privacy policy. This increment therefore makes
local detail an explicit invocation option, without adding an extraction/configuration field.
Default reports contain repository-scoped opaque node, fact, source and extractor references,
counts and recognized kind names. Unknown kind strings are hashed as well. References correlate
records; they are not encryption or proof that a low-entropy identifier cannot be guessed.

`hydrate --json --quiet` emits a typed identity-failure report on stderr with empty stdout.
Use `--validation-details` on `hydrate` or `overlay` only when local identities and citations
may be displayed. That option includes exact node/fact IDs, extractor identity/version, citation
path/lines/digest/commit, confidence and the original optional authority/review fields. It does
not include labels, node attributes, source text, prompts or raw provider output. Absent authority
fields stay absent; source approval is never promoted into assertion approval.

The programmatic equivalent is `HydrationOptions.validationDetails` or the overlay's final
options argument. Detail changes do not enter snapshot, provider or semantic-cache identities.
The error message stays safe even when its report includes explicitly requested local details.
No diagnostic file is written automatically. Existing non-identity SHACL errors retain their
existing detailed behavior; this is not a claim that every command/error has been redacted.

## Timing and failure preservation

Hydration reports started/completed/failed boundaries and elapsed wall time for identity
preflight, RDF construction, union construction and full SHACL. Counts describe graph size,
not validator completion. A completed SHACL phase means the validator returned, including a
nonconforming verdict. `RdfEvidenceGraph.validate({ onProgress })` exposes its union/SHACL phases.

The synchronous JavaScript work can block same-thread timers. These events are not heartbeats,
percentages, new timeout controls or interruptible worker execution. Worker isolation remains a
separate decision. The public profiling harness records preflight and validation phase timings
alongside its existing construction, resource and runtime measurements.

Failure preserves completed semantic artifacts and prior snapshots/heads. Correcting and
versioning an adapter still requires a fresh assembly and full validation, but compatible
semantic artifacts can be reused. This preflight does not rewrite cached model assertions or
choose an authoritative business rule. Evidence disagreements must be resolved at their owner.

No extraction/assembly version changes are needed: accepted graph facts, cache identities,
RDF serialization and conformance constraints are unchanged. The check rejects an existing
single-kind violation earlier; it does not make old snapshots satisfy current validation.

## Evidence and remaining work

Tests cover full cross-source attribution, conceptual and physical nodes, exact authority,
default privacy, late conflicts, duplicates/self-references, immutable artifacts/snapshots,
corrected retries and non-kind failures that still reach full SHACL. CLI and packed-consumer
cases use actual TypeScript SCIP and public adapters. Existing positive/negative named-dataset
SHACL equivalence tests remain unchanged except for an additional timing/parity case.

Broader T05 work remains: worker-based progress/cancellation, repeated/changed-input performance
evaluation, and evidence-driven decisions about conformance-result reuse or incremental/native
backends. This increment does not infer private consumer performance from public fixtures.
