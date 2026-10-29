# ADR 031: retain SCIP and expose its code occurrences

Status: B2b decision recorded on 2026-10-29. Implementation belongs to B3a; no production
extractor, public schema, dependency or published package changes in this experiment.

## Decision

Keep SCIP TypeScript as the default. Build a versioned, richer projection of its declarations
and reference occurrences for explicit rule-to-symbol resolution. Do not replace it with
Graphify or require both indexers. Preserve an adapter seam for a future producer with a
measured capability that justifies its installation and maintenance cost.

The current Weftlet projection discards useful information already present in the index.
Improving it addresses the immediate need for cited function identities and document bindings
without introducing another runtime. SCIP references do not prove calls, execution, data flow
or business intent. Native calls remain unsupported by this projection; a separate measured
producer could address that gap later.

## Evidence and interpretation

Inputs were frozen at `f1844f31717341f5ff95314a68def80eae509734`; the unchanged baseline engine
is `f3b0f99cc7f01227925bf7372f3ab7a60f0de62c`. See the [complete measurement record](../evaluations/code-graph-results/2026-10-29/README.md),
including pinned versions, commands, exported native artifacts, exact citations, per-case results,
costs, retained failed attempts and scoring amendments. No paid/model calls or private inputs.

Cold results combine two public corpora, without counting repeats as more independent cases:

| Evidence requested | Current Weftlet projection | Richer raw SCIP | Pinned Graphify static API |
| --- | --- | --- | --- |
| Declaration families, 15 positive cases | Exact track unsupported; 7 coarse candidates | 15/15 | 14/15 |
| References, 16 positive cases | Exact track unsupported; 12 coarse candidates | 16/16 | 8/16, including one ambiguous re-export counted as missing |
| Native calls, 10 positive cases | Unsupported | Unsupported | 7/10; retains native inferred/extracted tags |
| Ten named false-join negatives | Unsupported in exact track | None asserted | None asserted |
| Citation/identity failures in these scored outputs | 0 | 0 | 0 |

These are labeled-case results, not whole-graph precision estimates. Hundreds of other references
are unjudged. Graphify's line-only evidence receives source credit only where the labeled token
has an unambiguous native target; it does not acquire column precision. Its overload implementation
counts as a family, while two missing signature spans remain missing. The ambient vendor declaration
is absent. Other misses include type-use occurrences, test top-level calls and an execution call;
raw artifacts retain coarser import edges even when exact-use credit is unavailable.

Graphify is faster and lighter on these tiny TypeScript fixtures. For the 21-file business corpus,
two-sample median extraction phases were 0.808 s for SCIP indexing and 0.035 s for Graphify static
extraction. Whole worker times were 2.056 s and 1.087 s respectively, including startup; the SCIP
worker also assembles the unchanged baseline graph. Sampled aggregate process RSS was about
335 MiB versus 75 MiB, with shared pages potentially counted more than once. Cgroup peaks are
recorded separately. Small unequal sample counts, warm host caches and different phase boundaries
do not establish production speed ratios or large-monorepo behavior.

All 96 corrected experimental graph assemblies pass strict SHACL and exact RDF/SPARQL fact
projection parity. Every arm retrieves the documented collection → execution → notifications →
mobile chain, relevant test and both freshness rules, and loses the chain when its handoff sentence
is removed. Billing remains unrelated. Shared Status connects API and mobile in every arm.
Fixed-document/routing dispatch retrieves 16/16 expected files with zero of seven named distractions;
code-only retrieves 13/16. Some dispatch queries retain explicit continuation after the three-page
budget: these are successful labeled retrievals, not exhaustive graph searches.

The fixed business layer is identical across arms. Its documents are declared fixture intent;
grammar-derived assertions remain inferred/unreviewed. None of these results proves model
extraction quality, rule compatibility, delivery over a queue, or a function implementing a rule.
Both tools leave dynamic-target and undeclared-queue gaps silent. Only the richer SCIP adapter
explicitly reports the external implementation as declaration-only. B3–B5 must address binding,
obligations and coverage rather than treating absent edges as zero impact.

Repeat and dirty committed-source runs preserve normalized content and identities. Graphify's raw
dirty output differs only in its absolute `extracted_sources` inventory; nodes/edges are unchanged.
Edits preserve unrelated identities, rename/delete remove old current spans, omitted worker inputs
are explicitly excluded, and old snapshots remain unchanged. This tests full re-extraction with
cached document artifacts, not incremental code indexing. Graphify's pinned JS/TS path does not
prove useful incremental parse reuse merely because it accepts a cache directory.

## Limits and next implementation boundary

The comparison used Linux, Python 3.12.14, Node 24.19.0, SCIP TypeScript 0.4.0, and pinned Graphify
source `0a8cd4e1e342235fe53e881fb5d591bf0460071f`. Its source API imports with 30 locked runtime
distributions; the manifest/lock project-version mismatch is explicitly handled without installing
a project distribution. This is not a Graphify package, Windows/macOS, multi-language or managed
service validation. No upstream code or dependency enters the npm packages.

B3a will add first-class code entities and cited occurrences with stable identities, containing
file/project, declaration spans, references and explicit unresolved/declaration-only states. It
must retain canonical physical-file kinds, distinguish overload families from spans, and avoid
joining duplicate names. Explicit document bindings must preserve both source revisions/spans,
source approval and assertion-review authority. Rename/delete, dirty overlays, cache/version
identity, historical snapshots, RDF/query parity and fresh installation need regressions before
publication. Do not copy this experiment's legacy file-to-symbol projection into the public schema
and call that function-level binding. B3b separately assesses remaining inferred-mapping needs.

The next candidate remains unreleased until the agreed B1–B5 increments and B6 qualification.
This decision does not mark official 1.0 or private consumer acceptance complete.
