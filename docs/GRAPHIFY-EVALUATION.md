# Graphify evaluation for the pre-1.0 baseline

Status: preliminary source/document review on 2026-10-28. **No comparative execution or
replacement decision yet.** This is B2 of the [baseline plan](PRE-1.0-BASELINE.md).
No Graphify dependency, code, binary, skill or service was installed into Weftlet. Public source
was read at a pinned revision outside the repository; no private consumer material was used.

## Reviewed candidate

- Repository: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify).
- Reviewed commit: `0a8cd4e1e342235fe53e881fb5d591bf0460071f` on its `v8` branch.
- That commit's [package manifest](https://github.com/Graphify-Labs/graphify/blob/0a8cd4e1e342235fe53e881fb5d591bf0460071f/pyproject.toml)
  identifies distribution `graphifyy`, version `0.9.97`, Python >=3.10 and Apache-2.0 licensing.
  This is source metadata, not verification that a particular registry archive matches it.

The [README](https://github.com/Graphify-Labs/graphify/blob/0a8cd4e1e342235fe53e881fb5d591bf0460071f/README.md)
describes local tree-sitter extraction, broader language coverage, document/rationale extraction,
paths and agent integration. Marketing/benchmark claims are not adopted as Weftlet measurements.
The code inspected below supports evaluating it as a richer code-evidence producer; it does not
establish that it is more accurate than compiler-backed TypeScript indexing on our tasks.

## Findings from source inspection

| Area | Observed at the pinned revision | Implication for an experiment |
| --- | --- | --- |
| Code granularity | [Extractor models](https://github.com/Graphify-Labs/graphify/blob/0a8cd4e1e342235fe53e881fb5d591bf0460071f/graphify/extractors/models.py) represent function/call syntax, declarations, imports, aliases, exports and symbol uses. The [engine](https://github.com/Graphify-Labs/graphify/blob/0a8cd4e1e342235fe53e881fb5d591bf0460071f/graphify/extractors/engine.py) emits code relationships and source locations. | Evaluate function/method/call relationships that our current file/shared-symbol projection does not expose. AST structure alone does not establish complete dynamic calls or data flow. |
| Workspace resolution | [Resolution code](https://github.com/Graphify-Labs/graphify/blob/0a8cd4e1e342235fe53e881fb5d591bf0460071f/graphify/extractors/resolution.py) handles TypeScript aliases, project references, workspace/import/export origins and ambiguous barrel candidates. Its comments explicitly describe skipped npm-package tsconfig extensions. | Exercise our actual alias/barrel/same-name/TSX cases rather than assuming all pnpm projects resolve. Preserve unresolved and ambiguous outcomes. |
| Identity | [Base identity helpers](https://github.com/Graphify-Labs/graphify/blob/0a8cd4e1e342235fe53e881fb5d591bf0460071f/graphify/extractors/base.py) derive file/symbol prefixes from paths; comments describe a later repository-relative remap. | Test roots, collisions, repeated names, rename/delete and clean/dirty isolation. Map imported entities into Weftlet's canonical identity and snapshot provenance instead of adopting labels as join keys. |
| Evidence semantics | Extracted edges carry source file/location and `EXTRACTED` or `INFERRED` tags. | These tags do not mean owner-approved intent, observed runtime behavior or successful test execution. Measure citation precision and retain derivation when transforming facts into RDF. |
| Deployment | The manifest depends on Python, NetworkX and multiple tree-sitter grammars; its optional services/providers are separate features. | Account for installation, platform support, artifact sizes, process boundaries, licensing and maintenance. Do not introduce hosted services or paid inference to compare static code extraction. |

Graphify already covers documents and rationale too. The comparison initially isolates code
extraction so that changing document inputs/providers cannot explain an apparent code improvement.
Its [published benchmark](https://github.com/Graphify-Labs/graphify/blob/0a8cd4e1e342235fe53e881fb5d591bf0460071f/BENCHMARKS.md)
reports an ERPNext six-question evaluation and a small FastAPI inferred-edge audit, including
noisier same-name test helpers. Those are upstream-reported results, not a TypeScript comparison
against Weftlet or SCIP and not evidence for complete asynchronous or business-rule linkage.

## Fixed comparison protocol

1. Freeze public source commits, expected relationships, negative cases, query/page budgets,
   platform, versions and resource ceilings before measurement. Reuse the A1–A3 fixtures and
   the existing dispatch negative case; add function-level examples without changing old labels.
2. Compare **the current Weftlet SCIP projection**, **a bounded richer projection of raw SCIP**,
   and **pinned Graphify static extraction**. Record raw index coverage separately from what
   each adapter exposes. Do not attribute information discarded by our projection to SCIP itself.
3. Include exact symbols, local/private functions, aliases, barrel exports, overloads, duplicate
   names in separate domains, test mocks, TSX and service packages. Include a declared queue
   boundary, a stored-data handoff and an undeclared boundary. The expected result for an
   unsupported boundary is an explicit gap, not a guessed edge based only on a matching string.
4. Hold business documents and their approved source classifications fixed. Check that the same
   business-to-code links survive, then evaluate any finer function bindings separately. Keep
   inferred mappings, source approval and reviewed assertions distinct.
5. Measure precision/recall against predeclared edges, correct task-level consumers, false joins,
   unresolved targets, citation validity, identity stability, cold/repeat/edit time and peak memory.
   Compare same-process and subprocess measurements honestly. Count install/transfer overhead.
6. Exercise deletion/rename, repeated clean runs, isolated committed materialization and dirty
   queries. Retain old snapshots. Prove RDF/SPARQL/traversal equivalence for imported facts;
   reject incompatible identities rather than weakening SHACL or dropping contradictory evidence.
7. Run in a disposable tool environment with model calls disabled. Record reproducible commands
   and sanitized outputs. Any live semantic experiment needs a separate bounded budget and
   authorization before substantial paid usage. No private application checkout is modified.
8. Produce an ADR choosing to keep SCIP, improve its projection, add an optional supported
   producer, or replace the default. Replacement is a valid outcome if evidence supports it;
   two permanently required indexers are not a prerequisite. If a change is selected, implement
   compatibility/versioning and fresh-install tests as a separate milestone before publication.

Graphify does not become a second authority for product intent merely by importing its graph.
Neither tool can establish an undocumented business mapping from graph density alone. B3/B4
must address those evidence and meaning questions independently of the code backend decision.
