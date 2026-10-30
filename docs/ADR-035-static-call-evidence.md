# ADR 035: Static call evidence from TypeScript syntax and SCIP

Status: implemented for the next candidate, 2026-10-29. Live consumer acceptance remains B6.

## Decision

Use the TypeScript parser to recognize `CallExpression`/`NewExpression` sites in the exact
committed documents already read by the SCIP extractor. Join callee tokens to exact SCIP
occurrence positions, and callable names to indexed definitions. Keep native identities.
This adds no second indexer or type-resolution program and rereads no source files. The parser
is an explicit pinned runtime dependency (`typescript@5.5.4`), included in license notices and
the packed-consumer test. Existing SCIP indexing continues to supply resolution.

Each `calls` assertion retains caller, selected target, full invocation span, optional/member/
construction syntax and proofs of caller definitions, target occurrences and all indexed target
definitions. Caller proof selection uses the actual AST callable, including assigned arrows;
native lexical enclosure alone does not identify a caller. Repeated callsites remain separate.
Top-level calls use the canonical physical-file node. Imports/re-exports follow SCIP identities.
CodeSymbol IDs and ordinary `references`/`definedBy` evidence remain available independently.

`codeCall.target` distinguishes an indexed body, indexed class construction, bodyless declaration
and external symbol. A member call selects the declaration referenced by the index; it does not
prove runtime receiver type or rule out overrides, monkey-patching, proxies or reassignment.
Even lexical calls are static evidence, not guaranteed execution. Authority is implemented
(draft in overlays), extraction review is deterministic and runtime is explicitly not observed.

Callbacks passed as values, type uses and ordinary references do not become calls to those
values. Invocation through a parameter, computed dispatch, value alias or unsupported expression
produces a cited gap rather than an invented concrete target. Anonymous callbacks/initializers
without an exact indexed callable identity do not inherit the enclosing method as their caller.
Decorators/computed names remain in their enclosing evaluation context; instance field and static
block initializers currently report gaps. Defaults are attributed to their callable. Ambient files/namespaces provide declarations only; their decorator/default syntax produces no
runtime call assertions. Syntax errors cause explicit file-level abstention. Implicit JSX factory, getter, operator and framework
invocations are not synthesized. This is neither complete data flow nor whole-program analysis.

## Shared evidence and compatibility

The same assertions and proofs are projected into RDF, SPARQL, `graph.neighbors`, `graph.paths`,
impact packs and viewer source links. A `calls` predicate requires typed metadata; SHACL rejects
missing fields, invalid kinds/ranges and authority promotion. Consistency checks compare proof
IDs, endpoints, revisions and source spans against actual same-snapshot code facts. Validation
targets call records directly rather than scanning every ordinary fact through a new disjunction.
The validator remains JavaScript and still validates the complete published graph.

`FactExtractor.extractWithDiagnostics(context)` is an additive optional core contract returning
facts and gaps together without mutable last-result state. Hydration and overlays prefer it;
existing adapters implementing only `extract` remain supported. The built-in SCIP extractor's
legacy `extract` returns facts; callers needing its gap report should use the complete method.

SCIP projection is version 2.1.0, call extraction 1.0.0 and graph assembly 10. These identities
require refreshed code evidence for current validation while historical snapshots stay queryable.
The semantic schema still has its original predicate list: model output cannot invent `calls`.
Prompt/provider/artifact identity is unchanged. No semantic-cache rewrite or forced paid run is
required. Draft proof IDs and revisions are remapped after code extraction; renamed/deleted
relationships are replaced while committed snapshots retain their original bytes.

## Acceptance and limits

The public fixture/expectations were introduced in `0afbd19` and its data representation bounded
in `d69d65c`, before extraction. Later supplements cover import aliases and evaluation scopes.
The roughly 3,000-line file contains a real public string catalog between meaningful helper
chains and distant definitions. It tests location/isolation, not 3,000 lines of algorithmic
complexity or representative monorepo performance. Budgets: 800 total facts, 90-second hydration,
four two-fact neighborhood pages and 80,000 response bytes; helper-to-rule paths have explicit
depth six, three-path and 500-step limits. Truncation is retained, never treated as completeness.

Real indexing/hydration tests cover repeated sites, recursion, private/local functions, shadowed
names, overloads, re-export/import aliases, TSX, BOM/Unicode columns, cross-file callers, values
and callbacks, declarations without bodies, decorators/defaults/initializers and unresolved
dispatch. Actual query follow-ups reach a cited rule with its unreviewed mapping authority intact.
RDF projection and named/union SHACL agree, negative provenance/approval cases fail, and repeat,
dirty querying, line shifts, rename/delete and draft proof regeneration are exercised.

Run `pnpm evaluate:calls` in a development checkout for the public observation report. It uses
the fixed offline grammar provider, never private inputs or a model. Reports retain original
assertions, requests/responses, budgets, source hashes, configuration and runtime identity. Tests
provide the full acceptance assertions; this observation command is not a model-quality grader.
Browser interaction and live TradePilot usefulness remain separate evidence.
