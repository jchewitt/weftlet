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
