# SCIP retention and temporary build space

## What was measured

The study uses the same generated TypeScript project as the [compact-snapshot query study](../guides/COMPACT-SNAPSHOTS.md#public-saved-query-measurement). Each run starts with an empty project cache, 18 public intent documents, real SCIP indexing, the deterministic fixture provider, strict RDF/SHACL validation and the compact snapshot writer.

1. Hydrate the initial commit.
2. Hydrate it again with the same head.
3. Commit a prose-only edit to a selected document and hydrate.
4. Commit a new exported TypeScript function and hydrate.
5. Independently rebuild the last commit with `compareClean`.

After each operation the study reads and hashes every retained index, checks the current index against the snapshot manifest, and compares historical index lengths and hashes with their earlier observations. It verifies the unchanged head on repeat, checks the comparison against the normal head, and inspects the index and work directories again after the independent workspace is removed.

A separate worker samples the project cache and the dedicated process temporary directory at a requested 20 ms interval. The scope includes committed-tree archives and extracted checkouts, index and snapshot staging, compiler work, comparison output and previously retained history. A file seen under two names in a scan counts once by device and inode. The receipt separates file length in bytes from filesystem-reported allocated blocks. A sample spans a directory walk and can straddle a rename or miss a brief allocation. Peak figures describe observed use. They cannot size a free-disk guarantee. Dependency installations, the original working checkout, directory metadata, memory and external tool caches outside those roots are excluded.

## Observations on November 19, 2026

Linux x64, Node v24.19.0, overlay filesystem, direct RDF backend. MB means 1,000,000 bytes. The initial graphs had 15,860 and 124,532 facts. Rows are consecutive operations within each corpus. “Working” includes cache work directories, staging files and the isolated system temporary directory. Its maximum can occur at a different sample from the total peak.

| Modules | Operation | Retained SCIP (MB) | Identical copies beyond first (MB) | Total after (MB) | Sampled total peak (MB) | Sampled working peak (MB) |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 16 | initial | 1.23 | 0.00 | 3.39 | 3.39 | 2.05 |
| 16 | unchanged | 1.23 | 0.00 | 3.39 | 5.00 | 1.61 |
| 16 | document-edit | 2.47 | 1.23 | 6.74 | 6.74 | 2.05 |
| 16 | code-edit | 3.70 | 1.23 | 10.10 | 10.10 | 2.06 |
| 16 | clean-comparison | 3.70 | 1.23 | 10.10 | 13.45 | 3.37 |
| 64 | initial | 9.86 | 0.00 | 28.43 | 28.43 | 18.53 |
| 64 | unchanged | 9.86 | 0.00 | 28.43 | 40.85 | 12.42 |
| 64 | document-edit | 19.71 | 9.86 | 56.83 | 56.83 | 18.50 |
| 64 | code-edit | 29.57 | 9.86 | 85.25 | 85.25 | 18.52 |
| 64 | clean-comparison | 29.57 | 9.86 | 85.25 | 113.69 | 28.46 |

The unchanged repeat kept a single verified index. A documentation-only commit retained a second copy with the same SHA-256. The TypeScript edit introduced a different index. After three commits, the larger corpus held 29.57 MB of indexes, of which 9.86 MB (11.6% of the final cache) was byte-identical duplication. This potential payload saving assumes all three generations remain and excludes reference records and migration overhead. With only the last two generations retained, whole-file deduplication would save zero bytes on this edit sequence.

During the larger clean comparison, total file length reached 113.69 MB, 28.45 MB above the starting footprint. The separately sampled maximum allocated size was 113.76 MB. The comparison reused 18 semantic artifacts, produced an independent matching graph digest and left the three regular indexes intact. The normal work directory also retained small RDF outputs (11,368 bytes across four normal hydrations). An unchanged repeat can leave some work files even when its index and snapshot bytes stay stable.

The [measurement receipt](scip-footprint-r5.json) contains phase-by-phase byte counts, observed allocation and index hashes. Private cache sizes, timing, peak memory and hard disk requirements need their own measurements.

## Reproduce

On Linux, from the Weftlet source checkout with Node 24, frozen dependencies and the core package built:

```sh
pnpm exec tsx scripts/storage-study/scip-footprint.ts 16 80
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsx scripts/storage-study/scip-footprint.ts 64 160
```

Choose `TMPDIR` on the filesystem you want to measure. Each invocation creates and removes its own temporary consumer repository and scratch directory. JSON output contains aggregate sizes, index hashes, corpus dimensions and the source checkout commit. The public corpus repeats similar function bodies. The results depend on source composition, edit history, filesystem allocation and sampling.

## Candidate decision

Give the reviewed history policy a way to reclaim the SCIP file paired with a superseded snapshot selected for removal. The current policy includes index bytes in its observed total and retains every index. A series of genuine code edits can therefore grow protected history even when every index has different bytes. Deduplicating identical files alone would leave those unique retired generations in place.

Keep the change within the existing coordinated prepare/apply and maintenance contracts. Show the companion file and its byte contribution in the reviewed plan. Bind its physical name and verified SHA-256 to the selected snapshot's manifest. Protect current, previous, pinned, shared, active and uncertain data. Include interrupted-removal recovery and legacy or missing-index cases in qualification. Unattributed indexes in older caches need their own ownership evidence before removal. This is a proposed retention change for the next slice.

Defer a shared SCIP blob store until a consumer inventory measures duplicate index bytes **among generations the policy will actually retain**. That denominator determines the extra benefit after safe retirement. Separate stored graph identities, provenance and integrity checks still apply even if two generations share identical index bytes. Keep necessary build space outside the configurable history target.
