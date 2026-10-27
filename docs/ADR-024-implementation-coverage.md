# ADR-024: Report evidence coverage independently of display groups

Status: implemented after T07a; validation and publication are recorded separately in
[validation](VALIDATION.md). This is a query-reporting correction, not T07b document classification.

## Problem

The consumer reports returned code relationships with zero implementation coverage. Public
reproductions using the actual contract extractor and real SCIP confirm the defect: a file's
definition or consumption of a Contract is placed in the contracts display group. Coverage used
the exclusive display-group counts, so these code relationships could not count as implementation.
The inverse also occurred: unapproved document/model facts in the fallback implementation group
could suppress an implementation gap. Page-local absence was described as query-wide absence.

## Decision

Keep primary display groups, returned facts, ranking, pagination and authority unchanged. Compute
implementation coverage from the returned evidence independently of display placement. A production
code relationship can count toward both contract and implementation coverage without appearing twice
in the returned facts. The other coverage categories retain their existing classification.

New reports include `coverage.scope: "returned-page"` and `countsAreNonExclusive: true`.
Both fields are optional in core for compatibility with older Context Packs. Counts are relationship
counts, not percentages, totals of display sections, product completeness or proof of correct behavior.
Markdown and HTML explain overlap. Missing-evidence messages refer to the returned page; continuation
and traversal bounds can leave further evidence outside it. Existing source diagnostics remain intact.

An implementation relationship must have effective `implemented` authority, a non-document,
non-validation citation, and no unreviewed extraction marker. Current document/model, runtime,
draft and validation evidence cannot qualify by merely mentioning a code file. Supported document
extensions and test/spec names use the canonical core file policy. Conventional test/validation
directories, including `__tests__` and `__mocks__`, are excluded from production coverage.

Legacy deterministic adapters that omitted authority retain the existing authority fallback only
when a canonical physical Component endpoint matches the cited file. An adapter explicitly marking
a fact `implemented` may also use logical Component/Provider identities with a production citation.
Unmarked legacy provider output cannot be distinguished from adapter output when their metadata is
identical; no new claim of provider verification or execution is made. Saved fact authority is never
rewritten by this reporting classification.

## Compatibility and validation

No extractor, prompt, semantic artifact, assembly or ranking identity changes. Existing immutable
snapshots immediately benefit when queried by the updated toolkit; no model run or hydration is
needed. Historical Context Packs keep their original reports unless queried again. Existing clients
should inspect the new metadata rather than summing counts as a disjoint total.

Regressions use actual contract extraction, real TypeScript SCIP, strict SHACL and immutable
round-tripped facts. They cover overlapping counts, page continuation, API/MCP/Markdown/HTML
consistency, document/model/test negatives and retained source diagnostics. Installed-package smoke
checks query actual extracted facts rather than constructing coverage values by hand.
