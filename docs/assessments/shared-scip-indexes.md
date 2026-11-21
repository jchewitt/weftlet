# Sharing immutable SCIP index bytes

Eight public TypeScript modules and 18 intent documents produced three independently hydrated, strictly validated graphs. The second commit edited Markdown. The third removed a function from one module. The document edit reproduced the first SCIP file byte for byte. The deletion produced a different index.

The experiment stores each distinct index once by SHA-256 and gives each generation its own small reference containing its repository, commit, snapshot ID, graph digest and index digest. Resolution checks the complete reference against the saved manifest and verifies the payload against the expected digest. The toolkit's published file store continues to own all three graphs.

## Allocation and retrieval

| Index storage for three generations | Files | Logical bytes | Allocated bytes |
| --- | ---: | ---: | ---: |
| One SCIP file per generation | 3 | 939,749 | 946,176 |
| Two shared blobs and three per-version references | 5 | 627,400 | 643,072 |

Sharing saved 303,104 allocated bytes (32.0%) on this fixture. Snapshot sizes are outside this comparison.

The measurement uses the Linux overlay filesystem’s reported block counts, in units of 512 bytes, for regular files. It includes each prototype reference and blob, excludes directory metadata, and measures the two layouts separately. The accompanying JSON records logical size, allocation, fact counts and per-operation timings. Each timed index read verifies SHA-256. The shared read also opens and checks its manifest. Each saved impact query opens its snapshot by exact ID and returns 60 facts at depth three. All replay queries ran after moving the original index directory out of the fixture cache. Their complete pages matched the baselines, including citations, authority, order, coverage and continuation.

The query engine reads hydrated facts from the snapshot. It does not open the raw SCIP index to answer impact queries. Query timings are individual warm-filesystem observations in one process, with other work running. They establish that the bounded historical queries completed on this fixture. They provide no latency guarantee or evidence of a query speedup.

After retiring the first experimental reference, the second still resolved the original index and a saved query returned the same page. The function definition and its source span survived in the second graph and were absent from the deletion graph. Retiring the second reference reclaimed the original blob and left the deletion generation queryable. All original snapshot files retained identical SHA-256 values. A same-length edit to a disposable index failed integrity verification.

## Decision

Proceed to a production design for sharing byte-identical retained SCIP indexes. Keep per-generation identities and verify complete bytes. Before enabling shared storage, exercise concurrent publication and reads, interrupted removal and recovery, migration of legacy indexes, export/import and accounting on Windows and Linux. This experiment runs sequentially in a disposable directory.

The consumer reported 14.58 GB of duplicate logical index data among indexes its preview would retain. Filesystem allocation and eventual reclamation on that cache remain unmeasured. All 338 reported full snapshot hashes differed. Evaluating shared **graph** chunks requires a separate format study with historical query, change/deletion, authority and provenance checks. A small completion receipt can preserve a decision. Re-running an arbitrary historical query requires retaining its graph.

## Reproduce

Run the study from a built checkout with frozen dependencies. Set `TMPDIR` to select the filesystem for both layouts.

```sh
pnpm exec tsx scripts/storage-study/index-sharing.ts
```

The study creates and cleans up a public fixture and a separate disposable candidate layout. It uses the real TypeScript indexer and a deterministic public semantic provider.

[Measured run](shared-scip-indexes.json)
