# Frozen code-extractor comparison inputs (B2a)

Status: input specification only. No comparative extraction, timings, score or winner is
claimed. B2b must record its input commit and receipt before running the comparison.

`protocol.json` fixes the three arms, source/dependency pins, eight scenarios, budgets and
scoring rules. `cases.json` supplies exact source anchors, entity declaration families,
51 positive and negative labels, three required gap reports and three business controls.
The checker reports the actual case count; labels are evaluation hypotheses for these public
fixtures, not approved product policy. `inputs.lock.json` hashes every corpus/support file.

From the repository root, run `pnpm evaluate:code:check`. Once committed, use
`pnpm evaluate:code:check --ref <full-40-character-commit>` to verify Git blobs independently
of the checkout. The command is read-only: it neither runs extractors nor repairs the inventory.
Unexpected files, changed bytes, invalid/ambiguous anchors and inconsistent labels fail.
Generated `.context-graph`, `node_modules` and `dist` directories are excluded explicitly from
inputs; only the frozen source files may be materialized for extraction.
Working-tree CRLF conversion is checked using Git's attributes; a committed check reads exact
blobs. Extractor execution must materialize those blobs in a disposable directory, with no
user checkout cleaning or branch switching. The freeze commit goes in the run receipt; it
cannot appear inside its own content inventory. The inventory digest is a second identifier.

## Inputs and controls

The `project` corpus preserves the source and document bytes of A1–A3's linked business-context
fixture in `tests/business-context-acceptance.test.ts`: collection, execution, notifications,
mobile, shared Status contract and unrelated billing. Added math/worker files exercise local
and private methods, alias/barrel imports, overload families, duplicate names, shadowing mocks,
real JSX, dynamic dispatch and declaration-only external modules. Eight pnpm project manifests
make service/client/shared-package selection explicit. The aggregate tsconfig provides the same
aliases to each tool; project-level resolution/coverage must be reported separately. This does
not claim acceptance of arbitrary real monorepo build configurations.

The second corpus is the unchanged `evaluations/dispatch/project`, with its existing task labels
in `evaluations/dispatch/cases.json`. Its independent archive consumer and unrelated audit and
refund files remain controls. Do not copy or revise those labels after seeing an extractor's
answers. The original coarse impact scorer can score those tasks, but its file-level witnesses
are not function/call accuracy measurements.

For business retrieval, `protocol.json` maps the frozen config and provider into each disposable
corpus as `context-graph.config.json` and `provider.mjs`. The business configuration preserves
A1–A3's declared docs and adds the math alias for all arms. That parser recognizes a tiny explicit grammar; it is not
a model, an intent approver or a compatibility checker. Keep its unreviewed assertions and
source citations unchanged. Run code-only and fixed-business-evidence modes separately.
The undeclared `readings.ready` topic is deliberately not added to routing or intent docs.
Only the existing dispatch routing declaration and collection handoff supply their respective
non-call boundaries. Matching topic names alone must not prove runtime wiring.

## Measurement contract

Before timing, seal a setup receipt with exact source/lock hashes, installed distributions and
wheel/archive hashes, executable versions, commands, platform resources and the normalizer's
commit. The pinned Graphify source manifest says 0.9.97, while its uv.lock project entry says
0.9.96. Resolve and document that packaging discrepancy without silently refreshing dependencies;
the source SHA, not a registry version string, identifies this arm. Its dependency lock contains
platform/Python alternatives. Record the actual installed branch of that lock. Installation
failure is a blocked result, not permission to substitute another version. Do not copy Graphify
source or licenses into this corpus, install its agent skill, enable providers or launch services.

Use Linux Node 24.19.0 / Python 3.12.14 for primary measurement. Record hardware, OS, Git and
package-manager versions in the receipt. Run Windows compatibility separately; do not combine
timings across platforms or claim macOS support from this experiment. The test-only fixture
typecheck uses TypeScript 5.5.4; the pinned SCIP indexer resolves TypeScript 5.9.3. Report both.

Each sample starts with a fresh disposable output/cache directory. Run repeat immediately after
cold with the same directory. Other variants start independently from clean committed bytes,
except dirty which leaves edits uncommitted and indexes the original SHA. Three samples per
scenario are the maximum, not a guarantee that the global budget permits all runs. Retain partial
results when a ceiling is reached. Do not retry indefinitely or remove a slow/failed arm from the
report. Report median and range with sample count, never fabricated zero times. Record indexing,
normalization, RDF assembly/SHACL and querying separately; also show end-to-end and setup cost.

SCIP runs once per input/sample; the current and richer projections consume the identical raw
index. Charge indexing cost to both end-to-end totals but do not rerun it just to manufacture
different timings. The richer arm may preserve existing occurrences, local identities scoped
by file, definitions, ranges and relationships. It may not add a new AST parser or a guessed call
graph under the SCIP label. Graphify must use its static extractor only. During extraction,
network and model access are disabled; never expose credentials in commands or logs. Enforce
the process-tree deadline/memory limit, record enforcement, and stop a blocked arm if unavailable.

## Scoring and decision

Use the formulas in `protocol.json` per track and report every denominator, unknown and failure.
Normalize using actual source spans and raw entity IDs, never expected-answer labels or names.
Keep raw IDs and provenance alongside mapped IDs. Require cited committed bytes for source and
target. Duplicate raw edges do not inflate recall. Unjudged edges are listed separately; the
limited labels do not establish whole-graph precision. Overload signatures and implementation
are one family with separate declaration-span coverage. Distinguish resolving an external
declaration from finding its implementation.

Report coarse file/shared-symbol retrieval separately from exact occurrence resolution and
native call evidence. Current projection losses must not be attributed to the raw indexer.
An import/reference, JSX element use or possible dynamic target is not a proven runtime call.
Explicit gaps score separately as explicit/silent/fabricated; an absent edge or global disclaimer
does not establish a correctly diagnosed gap at the source. No single weighted score hides
false joins, authority errors, missing citations or coverage exclusions.

All imported facts must preserve strict SHACL conformance and exact RDF/SPARQL/projection
equivalence. Repeat/edit/rename/delete must retain historical snapshots and distinguish changed
current evidence. Function relationships the current schema cannot represent belong in a lossless
experimental result, not a fabricated existing predicate. Record that limitation before B3.

The decision ADR must account for every labeled false join and citation/authority failure. A
replacement recommendation requires no regression on existing business/task controls, a concrete
improvement on the declared code cases, reproducible installation within ceilings and an explicit
maintenance/platform tradeoff. If richer SCIP recovers the needed evidence with comparable
correctness, prefer the smaller supported dependency surface. If results tie or are blocked,
retain the current backend and record what is still unknown. This does not rule out replacement
or an optional producer when evidence justifies it. No backend change ships from B2a or B2b alone.

Changing a frozen input requires a reviewed protocol amendment and a new digest/commit before
new measurements; retain the previous results and state why they are no longer comparable.
Do not update the inventory to make a failed comparison pass. Output artifacts belong outside
these inputs and must identify their own source and normalizer commits.
