# ADR 039: Opt-in, unreviewed rule-to-function proposals

Status: implementation and public protocol prepared, November 2, 2026. Live model accuracy,
independent usefulness assessment and candidate qualification remain pending.

## Decision and scope

The maintainer accepted the bounded inference recommendation after ADR 034's deterministic
assessment. Add an explicit proposal operation alongside saved graph evidence. It addresses
documented rules with file associations or document links but no exact symbol binding. It does
not generate missing intent, approve mappings, prove compliance, backfill documents, alter
semantic hydration or insert proposed relationships into the canonical graph.

One request chooses an exact saved snapshot, business rule ID, approved source document and
one to four already-linked files. Eligible business nodes are Invariant, Capability, Workflow
and Contract. A source must be declared, with intent role or legacy unspecified role; recorded
ownership must be resolved or not-required. Existing extracted subject assertions retain their
review state. Source approval never approves their interpretation or a proposed mapping.

The no-model plan checks existing explicit bindings, source intent/mapping diagnostics, recorded
code coverage, regular committed files, exact source digests/revisions and indexed callable name
occurrences. It rejects unknown/omitted indexing and ambiguous named callable identities. Syntax
must have an actual implementation body. Canonical test/spec file identities are validation
evidence and cannot be proposed as product implementations by this operation. Ambient declarations
and anonymous callables are counted as excluded; this increment does not invent identities for
them. Code is joined by exact indexed
positions, never label similarity. Co-location supplies candidate scope, not an implementation claim.

The selected source document and callable excerpts are read at the saved commit, independently
of the active checkout. An old snapshot can be used deliberately and remains labeled stale with
excluded working changes; it cannot pass current-diff validation. Draft-overlay proposal creation
is deferred because captured source bytes need a distinct durable input contract. Existing
overlay graphs remain queryable.

## Bounds and authority

Defaults: at most eight candidates, 32 KiB of prompt/schema input, and one provider request.
Explicit request ceilings are 20 candidates and 128 KiB input. There are at most five source reads,
each at most 1 MiB according to immutable Git tree metadata. A candidate/input overflow blocks
execution rather than selecting an unreported subset. The configured semantic timeout (up to
600000 ms) applies to the provider phase; mapping does not inherit semantic automatic retries.
Oversized previews bound retained candidate metadata and report observed/returned counts with
`candidateEnumeration.complete: false`; incomplete enumeration never runs a provider. Candidate
`excerptBytes` exposes a body that exceeds the input limit without retaining its oversized text.
For blocked plans, `inputBytes` counts only prepared input, not omitted candidate material.
These are request/byte/time bounds, not a token billing or dollar cap.

Provider output must select exact candidates and cite both the documented rule's supporting
source span and the candidate's implementation extent. Unknown/duplicate IDs, unsupported line
ranges, extra fields, invalid confidence and inconsistent proposal/abstention states fail before
storage. Model-reported confidence is uncalibrated. Structural citation validation cannot prove
the proposed interpretation is correct. Rationale and source text remain untrusted content.

The result is either a proposed set or an explicit abstention. Every saved result is permanently
`authority: inferred`, `extractionReview: unreviewed`, `establishesCompliance: false`. Original
subject/association facts and code-definition proofs are retained, including their independent
authority and provenance. No rule violation, test success, compatibility or approval is inferred.

## Provider, cache and failure contract

Use the existing Codex CLI authentication configuration: ChatGPT by default; API-key mode only
when explicitly configured. The runner is isolated, read-only, ephemeral, ignores user rules and
configuration, disables shell tools, and requires structured output. Authentication never falls
back to another billing mode. Fake-transport tests cover the invocation; live operation is a
separate validation. Module providers must explicitly export `createMappingProposalProvider`
with a matching configured identity and a `propose(input, { signal, timeoutMs })` method. The
semantic-provider interface alone does not qualify. Local modules are trusted code and must honor
abort signals, bound their own work, and keep input/credentials out of logs.

The outer deadline/cancellation race rejects uncooperative providers and prevents late results
from publication. Progress contains only phase, opaque operation ID and elapsed time. Unknown
provider errors never expose stderr/prompts. Publication after validation is a single atomic
commit point; cancelling after a completed publication does not erase a valid artifact.

Proposals use their own versioned identity and `artifacts/mapping-proposals` namespace. Keys bind
the exact saved snapshot/facts, requested scope/budgets, source input digest, provider/model and
reasoning configuration. Operational timeout/retry changes do not invalidate artifacts. Module
authors must version their identity when implementation or output-affecting configuration changes;
deadline/retry fields are operational under this contract. Identity
hashes use persisted JSON semantics so optional undefined fields survive a write/read round trip.
Input/plan/output checks run again on reuse; model/prompt/code/source changes require a new key.
This initial cache is conservative and snapshot-bound: it does not reuse across a new snapshot,
even when an unrelated file changed. No force overwrite or automatic baseline acceptance exists.

Bounded hash filenames and atomic hard-link publication preserve a concurrent winner. Concurrent
cache misses can each spend their independently authorized request; there is no cross-process
provider single-flight lock. Conflicting
outputs fail without overwriting it. Existing graph heads, snapshots and semantic artifacts are
unchanged. Saved proposal reads require neither provider initialization nor source re-extraction;
they bind the exact snapshot and report current evidence state. Integrity hashes detect mismatches,
not malicious rewriting of a local artifact and all its hashes.

## Interfaces and acceptance

`mappings plan --request request.json` previews scope, candidate proofs, exclusions, bytes,
cache identity, readiness and expected request count. `mappings propose --request request.json
--allow-model` explicitly permits one new request; a cache hit needs no model permission.
`mappings read --snapshot ID --key KEY` reads a saved result. CLI JSON is the shared API result.
MCP exposes only `mapping.plan` and `mapping.proposals`, both read-only and unable to spend model
requests. Follow returned exact symbol IDs through `graph.neighbors`/`graph.paths`. Normal graph
queries and the viewer do not silently acquire proposed edges.

Deterministic public tests cover real prose extraction/SCIP, misleading-name candidates,
cross-domain file rejection, declared versus unreviewed authority, citations, missing/omitted/
declaration-only code, budgets, model consent, reuse with unavailable provider and dirty checkout,
rename/delete invalidation, historical reads, timeout/cancellation and immutable concurrent writes.
Fresh packed installation exercises actual CLI/MCP and exported APIs with a visibly canned module.
No canned result is semantic-quality evidence.

[The predeclared live protocol](../evaluations/mapping-proposals/README.md) permits three bounded
public requests only after usage approval. It separates target accuracy, abstention, output
validity, infrastructure failure and independent rationale/usefulness review. A live result and
maintainer review are needed before calling B3b qualified for the 1.0 candidate. B6 still owns
consumer hydration/repeat and real agent usefulness; release PR #53 remains open.
