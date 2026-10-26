# ADR-019: Safe semantic failure diagnostics and settled progress

Status: implemented in development source after 0.3.0; validation and publication are recorded
separately in [validation](VALIDATION.md). This decision does not change extraction identity.

## Problem

A generic timeout does not identify which source failed, how much work survived, or how to
resume. Concurrent workers can also cancel each other: reporting the last error can hide the
initiating timeout, and reporting before active writes finish can undercount retained artifacts.
Arbitrary provider exceptions and abort reasons may contain private input.

## Decision

Keep semantic-run scheduling and reporting in `application/semantic-run.ts`, separate from graph
assembly. Record the first source failure before aborting siblings, stop scheduling queued sources,
and wait for active workers to settle before constructing `SemanticHydrationError.report`.
The report has a versioned kind, safe code/category, phase, committed SHA, configuration digest,
elapsed time and scope, effective timeout and its scope, final counts, and recovery guidance.

Completion means a validated artifact was retained or successfully reused. A write already in
progress can finish after cancellation and remains a completion. A provider result returned after
abort is rejected before validation/publication. Late storage failures remain failures, not sibling
cancellations. Cancellation between sources has phase `semantic-scheduling`, no failing source ID,
and run elapsed time; it does not relabel successfully retained artifacts as cancelled.

Counts have these meanings:

- `completed = extracted + reused`.
- `total = completed + failed + cancelled + notStarted` after active workers settle.
- `remaining = total - completed`; this includes failures, cancellations and queued work. It is
  not a promise about the number of model calls required by a future run.

Known provider timeouts, cancellations, unavailable infrastructure, process exits and invalid
output remain distinct. Configured unresolved-mapping and confidence rejections retain separate
`unresolved` and `low-confidence` codes and remain extraction gaps. Their acceptance criteria are
unchanged. Unknown extraction exceptions become `provider-failure`, without an
invented diagnosis. Cache read/write failures have a separate code; invalid extraction validation
is an extraction gap. Module loading/export/identity problems are unavailable infrastructure.
No raw exception, cause, provider output, prompt, credential or source path is copied into the
report. These diagnostics are not approved intent or evidence that a product rule was violated.

The CLI prints safe errors and progress on stderr, leaving stdout for successful results.
`hydrate --json --quiet` produces a JSON semantic failure report on stderr. The JSON contract
covers the semantic-source run; configuration, repository, indexing and graph validation errors
retain their existing interfaces. SIGINT listeners are removed on both success and failure.
The saved-evidence MCP interface still performs no hydration and writes only protocol messages
to stdout. Trusted module code must itself avoid logging private inputs; this is not a sandbox.

## Source correlation and timeout meaning

A domain-separated SHA-256 of repository ID and stable semantic ID gives each source an opaque
`sourceId`. `hydrate --plan` explicitly maps that ID to its local path. The ID is stable across
retries and source edits when the stable semantic ID stays the same; renames without a declared
stable ID may change it. It is a correlation aid, not anonymization, encryption or an access
boundary. Do not publish the local preview without reviewing its paths and other metadata.
This ID never enters artifact keys, prompts, facts or snapshot configuration digests.

For source failures, elapsed time includes cache checks, authentication, provider attempts and
retries through failure. Codex's configured limit is per attempt; authentication has a separate
bounded status check. Module execution has one deadline covering import, factory and extraction.
The report distinguishes these scopes rather than presenting the limit as an end-to-end deadline.
No timeout default, retry policy, extraction contract or cache version changes here.

## Recovery and limits

Failures do not reach graph publication. Prior snapshots and completed artifacts remain intact.
Use the same configuration, committed ref and scope in the no-model preview to inspect current
reuse before retrying without `--force-semantic`. T03 preserves compatible built-in Codex artifacts
across supported operational changes; legacy recovery requires the exact previous configuration.
Custom modules retain conservative full-configuration identity. Completed forced revisions are
retained but are not automatically adopted by an ordinary rerun or a new forced revision.

The toolkit waits for built-in subprocess termination or the module wrapper's bounded promise.
It cannot forcibly terminate arbitrary trusted in-process module code. Cancellation before source
selection and outside semantic processing uses the existing safe cancellation error without
per-source counts. Phase boundaries remain the progress signal; no synchronous SHACL heartbeat,
incremental validator or invented percentage is introduced by this milestone.

Public deterministic tests cover failures, cancellation races, durable-write completion, counts,
privacy, reuse, unchanged snapshot heads, source mapping and installed CLI behavior. They do not
claim private consumer acceptance or live-provider semantic quality.
