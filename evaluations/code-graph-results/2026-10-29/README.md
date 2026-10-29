# B2b measurement record

This directory records execution of the unchanged B2a inputs at
`f1844f31717341f5ff95314a68def80eae509734`, digest
`04fa4584bd80a9b1a1d964420dcaf35b5e8c61a67515cc57e2476fd44fa798b3`.
`setup.json` is the premeasurement tool receipt. Results and a decision are recorded separately
after execution. Nothing in this setup record establishes a comparative winner.

The baseline engine is `f3b0f99cc7f01227925bf7372f3ab7a60f0de62c`. A separate checkout was
materialized from committed blobs, installed using its frozen pnpm lock and built. Node 24.19.0,
SCIP TypeScript 0.4.0 and its TypeScript 5.9.3 dependency are verified by version and hash.
The fixture typecheck uses TypeScript 5.5.4. No source application or private consumer is mounted.

Graphify uses the pinned source API and 30 runtime distributions installed from the unchanged
upstream uv.lock, with no extras/dev group. Its manifest says 0.9.97 and the lock's project
entry says 0.9.96; `--no-install-project` avoids misrepresenting that as a validated project
distribution installation. The source API imports successfully. Every installed distribution
matches a locked wheel version/tag; archive hashes, RECORD hashes and installed-content hashes
are retained. Original upstream licenses remain in the external checkout and distributions.
No Graphify code, skill or Python dependency is copied into Weftlet's runtime/package.

The shared runtime image pins Python 3.12.14 on Debian 12 and adds Git 2.39.5. Its immutable
image ID, base-image digest and Dockerfile are recorded. Extraction containers have no network,
a read-only root, two CPU quota units, a 2 GiB cgroup memory limit with no swap, and 128 PIDs.
Only disposable public work/output directories are writable. The memory/network probe returned
the expected limit and ENETUNREACH. A 10 ms watchdog samples aggregate container RSS and bounds
phase time and output size. Kernel cgroup peak includes cache and is reported separately from
sampled RSS; neither is described as an exact per-function allocation measurement.

## Harness interpretation fixed before measurement

- Normalizers receive native output, committed code bytes and their SHA; they never receive
  expected case labels. Original SCIP bytes, schema `toObject()` JSON and Graphify output survive.
- Raw SCIP retains local IDs scoped by file, all declaration/reference occurrences and ranges.
  It does not acquire calls by relabeling references or using another parser. The current
  projection remains the unmodified baseline extractor and receives only coarse file/symbol
  credit. Exact-track unsupported cases remain visible, including negative cases.
- Graphify's line-only locations are marked as such. Multiple distinct targets on one cited
  line cannot resolve an exact token: those cases are ambiguous, positives count as missing,
  and negatives do not become proven passes. Exact-span wrong targets remain false positives
  even when the same source also returns a correct target. This is conservative treatment of
  insufficient source-location evidence, not a change to the frozen labels or denominators.
- File nodes are excluded from declaration matching using the pinned emitter's own file-node
  representation (label equals its cited filename, no callable marker). Names never join code
  entities across files. Native caller/callsite/callee evidence is required for call credit;
  module callers may carry a file span. No live runtime execution is inferred from static calls.
- Native EXTRACTED/INFERRED tags and numeric scores remain in normalized records. Experimental
  legacy GraphFact projection retains supplied scores, uses 1 for deterministic EXTRACTED records,
  and uses an explicit conservative zero when an INFERRED record supplies no numeric score.
  That zero is a projection sentinel, not a measured probability. Authority remains inferred.
- The common file/document/semantic/routing layer comes from actual baseline hydration and is
  held identical across arms. Its source annotations, review state and provenance are preserved;
  it earns no native-extractor score. Code-only and fixed-business results remain separate.
- Experimental RDF adds only existing file-to-symbol `contains`/`consumes` relations. Calls and
  other native details remain in lossless experimental results; they are not fabricated as
  supported public predicates. Unresolvable/unprojectable native targets remain in the raw and
  normalized outputs. SHACL stays strict and SPARQL must return every imported fact unchanged.
- Code query metrics use the frozen page/depth/work limits. Required gaps are explicit only
  when source-specific diagnostics support them; absent edges alone are silent. A conflicting
  asserted target is separately labeled fabricated. No score establishes general semantic quality.

Run `python scripts/code-graph-study/run.py --workspace <disposable-setup> --receipt <sealed-json>`
only after committing the harness and creating a receipt containing that exact commit. The
driver refuses changed input hashes or a dirty/mismatched harness. Default maximum is three
samples. A failed attempt is retained; fixing the harness requires another sealed commit and
receipt. The global 1,800-second measurement bound includes container startup and materialization.

Repeat reuses the preceding cold output/cache. Edit/rename/delete/omission/handoff variants start
from the same base commit and cache state; dirty edits stay uncommitted while both tools read
the original committed bytes. Old snapshot files, isolated inputs and active checkout state
must remain unchanged. Artifacts and their hashes identify the corresponding input/engine/harness
commits. Setup cache conditions are recorded rather than presented as a clean-machine install race.

### Retained harness amendment before the replacement run

Attempt 1 (`d58df3e`) completed eight business scenarios and all dispatch-cold
worker phases, then its checkout-state assertion stopped: the dispatch fixture does not ignore
its configured `.context-graph` output. The harness now excludes exactly that output path
from the tracked/untracked source-state comparison. Committed-input hashes and historical
snapshot checks remain unchanged. No labels, scoring, tools or source inputs changed. The
failed attempt remains recorded, and its elapsed time is charged against the same 1,800-second
budget using `priorMeasurementSeconds`; a replacement run cannot reset the measurement budget.

### Post-observation normalization correction

Review of saved native JSON found two harness defects: Graphify's `re_exports` spelling was
omitted, and declaration scoring looked only at a family's first anchor instead of accepting
any of its frozen overload declarations. Both are corrected with focused tests. No native
output, input label, dependency or case denominator changes. Overload signature-span coverage
remains separate. Line-only re-exports with multiple targets remain ambiguous, without guessed
token locations. Original and corrected scores are retained; the decision uses the corrected
replay and explicitly acknowledges this post-observation amendment.

Further extraction stopped after one full matrix and six additional completed business scenarios;
the next assembly finished but lacks the driver's final invariants and is not credited. The first
attempt's eight completed business runs remain diagnostic history, not additional score samples.
This keeps each scenario within three native extractions across attempts. The replay uses only
the 16 fully recorded runs from attempt 2, without indexer/provider calls, and is charged to the
original total time budget. Sample counts are unequal and too small for general speed claims.

## Measured outcome

Decision: [retain SCIP and improve its projection](../../../docs/ADR-031-code-extractor-selection.md).
The corrected 51-case cold comparison resolves 15/15 declaration families and 16/16 references
from raw SCIP. Graphify resolves 14/15 families, 8/16 references and 7/10 native calls. Current
Weftlet provides coarse candidates for 7/15 families and 12/16 references; it does not expose
exact occurrences. Neither SCIP projection has native call evidence. No named false-join negative
was asserted by the two exact-track arms, and no invalid citation or ambiguous identity was found.
This is not general precision: unjudged references remain in every output. Graphify has one
ambiguous line-only re-export and only one of three parse-overload declaration spans.

The corrected record covers **16 completed scenario runs**: all eight business scenarios and
dispatch cold/repeat, plus a second sample of business cold/repeat/body-edit/rename/delete/dirty.
The earlier attempt and uncredited partial run remain in the archive. Native executions never
exceed three per scenario across attempts. Replay calls neither extractor. Total charged
measurement time, including failed/interrupted work and replay, is **342.50 seconds** of 1,800.
No worker exceeded its time/memory/artifact cap, reported OOM, or made a model request. Largest
original output is 2,428,883 bytes. Source isolation and retained snapshot hashes pass.

All 96 corrected arm/mode assemblies conform to strict SHACL and return identical facts through
SPARQL. All arms preserve the fixed business controls and review authority. Without the handoff,
collection loses the downstream chain; code-only never establishes it. All fixed-business dispatch
queries retrieve 16/16 labeled targets, zero of seven distractions; code-only gets 13/16. Current
and richer SCIP dispatch searches have remaining pages, explicitly reported. Graph density is
not a proof of query completeness or business-rule compatibility.

Cold business indexing/static extraction medians are 0.808/0.035 seconds; whole SCIP/Graphify
workers are 2.056/1.087 seconds. They have different work boundaries, and there are only two
samples. Dispatch has one sample. The report retains every observed value, min/max and cache
state, along with original and corrected assembly/query times. These measurements establish
neither large-repository scaling nor a cross-platform performance guarantee.

Repeat reuses five business document artifacts (three dispatch) and extracts zero again. Removing
the handoff extracts one changed document and reuses four. This is the deterministic fixture
provider, not a live model. Both code tools execute again. All same-SHA normalized outputs match;
Graphify dirty raw JSON differs only in the absolute extracted-source list. Unrelated declaration
identities survive edits, renames and deletions. Deleted mock cases (nine) and excluded worker
cases (two) are listed explicitly; omission is not a zero-impact finding. Selected/indexed source
counts are 21/21 business, 18/18 dispatch, and 20/20 after delete or worker omission.

Dynamic-target and undeclared-queue gaps remain silent in every arm. Raw SCIP's adapter reports
the external implementation as declaration-only; the other arms do not. Source-only graph
connectivity does not fill undocumented business mappings or deployment wiring.

## Durable evidence and reproduction

- `setup.json`: premeasurement tool/dependency/image receipts, licenses and resource probe.
- `results.json`: corrected scores, original score comparison, source commits, controls, scope,
  timings, cache counts and identity checks. Cold rows retain every case's native target witness.
- `public-evidence.tar.gz`: original native SCIP bytes/JSON, Graphify JSON, normalized outputs,
  snapshots, queries, worker logs/metrics and sealed receipts for both attempts and replay.
  Destination-authored harness source at each sealed SHA is included for reproduction after squash merge.
- `export-inventory.json`: exact allowlisted members, sizes and SHA-256 hashes, plus the archive hash.

The archive contains only outputs generated from the frozen public fixtures, including disposable
Linux paths. It excludes consumer checkouts, `.git`, caches, credentials, installed dependencies
and Graphify source. These are destination-authored experiment artifacts, not extracted product
snapshots. The archive and evaluation scripts are outside the npm runtime file list.

Read a member without extracting it, for example:

```sh
tar -tzf evaluations/code-graph-results/2026-10-29/public-evidence.tar.gz
tar -xOzf evaluations/code-graph-results/2026-10-29/public-evidence.tar.gz \
  replay-8b97b9df4da8/1-business-cold/output/comparison.json
```

Use the actual replay prefix in `results.json` if selecting a member programmatically. Setup and
run commands are retained in the receipts and each `*.execution.json`. The driver requires its
sealed harness SHA, exact frozen blobs and the prepared isolated tool paths. This is a bounded
research harness, not an npm-user setup command. `replay.py` reprojects recorded outputs after
an explicitly sealed correction. `report.py --workspace <study> --output <report>` reads them to
produce the summary and allowlisted archive without extraction, network or provider calls.

Post-observation corrections limit the strength of a claim that the original scorer was perfect.
They are retained rather than hidden: definition-family credit increases for Graphify, and the
re-export becomes explicitly ambiguous rather than silently absent. Frozen inputs, source labels,
negative cases, authority and resource limits remain unchanged. A fresh, independently designed
corpus would be needed to establish generalization.
