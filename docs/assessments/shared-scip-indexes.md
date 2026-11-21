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

## Production implementation order

1. **Publish and resolve one index.** The TypeScript indexer currently normalizes a temporary file and renames it to `scip/<physical-snapshot-key>.scip`. Start with an opt-in managed-cache layout. Install the normalized payload under its SHA-256, verify any existing file before reuse, and keep a stable readable path for the symbol extractor throughout hydration. Finalize the per-generation reference against the validated snapshot manifest before advancing the head. A failed build must leave the previous head and its index usable. Keep clean-comparison files inside their operation-owned namespace.
2. **Read old and new generations side by side.** Resolve each index from its exact profile, snapshot ID and saved index digest. Test both existing physical filename forms and the new reference. In a mixed cache, an invalid shared reference must produce a specific error. An empty cache, an unchanged repeat, and two overlapping writers of identical bytes must each converge to the expected references and payload count. Verify a changed or deleted symbol against both the old and new graph.
3. **Migrate and retire safely.** Preview which authenticated legacy pairs can share bytes and which remain unattributed. Coordinate imports, active reads, builds and collection under the managed root. Verify each new reference before retiring its old copy in a reviewed operation. Derive reachability from durable references or a recoverable index. Exercise a crash after payload installation, after reference publication and during last-reference removal. Count the blob once and report per-version reference overhead. Compare allocated bytes before and after on Windows and Linux.
4. **Qualify delivery and rollback.** Today's snapshot export copies the graph and optionally semantic artifacts; saved impact queries use hydrated facts. Test that existing bundles still round-trip without a raw SCIP index. If a future exact-replay bundle includes indexes, verify their hashes and references on import. Keep a path back to legacy files for clients that need the old layout and test historical queries with the latest head moved. Select a production default only after these checks and a same-cache measurement.

## Opt-in publication implementation

The first two steps now have a production writer and resolver. Each ordinary hydration on a coordinated cache can install a verified SHA-256 blob and bind it to the validated graph before advancing the head. Existing per-generation files remain readable. The new resolver holds the same read-only file handle through verification and consumption. Clean comparisons use independent, operation-owned files. [Configuration and usage](../guides/CACHE-HISTORY.md#share-index-bytes-across-new-generations)

The [legacy index preview](../guides/CACHE-HISTORY.md#preview-sharing-for-existing-indexes) now measures verified groups and exact reference overhead on a coordinated cache. The [reviewed migration](../guides/CACHE-HISTORY.md#apply-a-reviewed-index-migration) installs replacements and journals legacy removal. [Shared retirement](../guides/CACHE-HISTORY.md#retire-shared-indexes) releases verified blobs once their last owner retires. Inventory currently counts shared files toward root usage and retains them as unknown objects. The consumer's duplicate-byte estimate describes an opportunity for migration. Actual reclaimed bytes require measuring a reviewed migration on that cache.

## Reproduce

Run the study from a built checkout with frozen dependencies. Set `TMPDIR` to select the filesystem for both layouts.

```sh
pnpm exec tsx scripts/storage-study/index-sharing.ts
```

The study creates and cleans up a public fixture and a separate disposable candidate layout. It uses the real TypeScript indexer and a deterministic public semantic provider.

[Measured run](shared-scip-indexes.json)
