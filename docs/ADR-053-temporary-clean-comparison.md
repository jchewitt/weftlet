# ADR 053: Independent clean comparisons with temporary output

Status: implemented for review, November 17, 2026. This is storage task R1 in the
[retention plan](CACHE-RETENTION-PLAN.md), following onboarding qualification.

## Problem

Each successful `clean-compare` previously retained another timestamped full JSON
snapshot, a `-clean` head, a SCIP index and compiler output. A consumer measured
more than 1 GiB per graph. Keeping all successful duplicate builds makes repeated
verification consume substantial disk space.

## Decision

Comparison captures the selected normal head's manifest and resolves the requested
ref once. It requires matching committed source/configuration, then creates a
unique directory under the configured storage root's `work` directory. A separate
snapshot store, indexer and compiler write there. It performs real indexing,
assembly, identity checks, RDF/strict SHACL and temporary publication before comparing
the freshly computed logical digest with the captured original digest.

Semantic artifacts are revalidated through the existing cache contract. Comparison
reads primary/legacy artifacts without provider calls, promotion or rewriting.
Missing/incompatible artifacts fail with a cache error; the user previews and
explicitly hydrates missing evidence before retrying. `forceSemantic` is rejected.
A forced semantic revision that cannot be reproduced from the ordinary compatible
cache can still report drift; comparison never silently approves a different result.

On success, failure or cooperative cancellation, remove only the operation-owned
workspace. The normal head, prior snapshots, reusable artifacts and other operations'
workspaces remain untouched. Concurrent publication can advance the normal head;
the receipt remains bound to the original snapshot captured at comparison start.
It is not a claim about that newer head.

Each operation publishes a separate, immutable receipt (at most 256 KiB) containing
source/configuration/scope/tool identities, original and independent digests,
strict-validation and comparison outcomes, timestamps and cleanup status. Scope
and semantic-key lists are represented by digests/counts. Failure receipts retain
only phase/status, never raw errors, source text, prompts or full graph payloads.
The receipt is written after cleanup, so success explicitly includes successful
cleanup and receipt publication. A receipt write error remains an error even when
the graph comparison passed.

Existing plain CLI output remains the matching content digest. `--json` additionally
returns the receipt path, original/independent IDs and counters. The JavaScript
result still includes the independently built in-memory graph, with an optional
`comparison` record. Its independent ID is temporary and is not a saved query target.
Custom `HydratorDependencies` must provide `cleanComparison.storageRoot` and a
`createTools(root)` factory whose indexer/compiler direct every build output into
that supplied root. Built-in application construction supplies this automatically;
there is no fallback to permanent output for custom implementations.

## Ownership and recovery

The workspace has a unique lease token and an open lease handle. Cleanup verifies
the ordinary directory's identity and exact lease bytes before recursive removal;
linked/junction ancestors and swapped roots are rejected. Removal does not follow
child symlinks. No process scans or reclaims another operation's directory by age.

SIGINT/SIGTERM in the CLI request cooperative cancellation. Active indexing/compiler
work settles before cleanup, then phase checkpoints prevent normal publication.
A killed process or machine crash can leave an operation directory and lease. R1
never guesses that a PID/old timestamp authorizes deletion. Inspect the lease and
confirm its operation has stopped before manually removing that exact temporary
directory. R3 owns coordinated crash recovery and cross-process GC leases.

## Boundaries

R1 stops normal successful-comparison duplication. It does not remove old clean
snapshots/heads, impose a 10 GiB cap, reserve peak build space, compact graphs or
provide archive storage. Independent builds still need temporary space. Small
receipts accumulate for later policy-managed retention. Full failure bundle retention
is not offered in this increment; any future option must be explicit and budgeted.
Existing semantic identities, snapshot formats, strict constraints, citations and
source-authority policy are unchanged.

Public regressions cover real SCIP and strict validation, repeated/concurrent
comparisons, concurrent normal publication, missing cache, drift, compiler/SHACL
failures, cancellation, unchanged saved bytes, linked/swapped directories and bounded
atomic receipts. Platform and packaged results are recorded in [VALIDATION.md](VALIDATION.md).
