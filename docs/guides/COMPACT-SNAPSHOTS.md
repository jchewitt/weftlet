# Store new snapshots in compressed blocks

**Candidate after 0.10.0.** Upgrade every Weftlet reader, writer, CI runner and local
tool sharing the cache before enabling the compact writer. Start with one writer.
On Linux, macOS or WSL, run the following from an installed consumer project.

```sh
WEFTLET_SNAPSHOT_FORMAT=brotli-v1 npx --no-install weftlet hydrate --ref HEAD
```

In PowerShell set `$env:WEFTLET_SNAPSHOT_FORMAT = 'brotli-v1'` before invoking the
CLI. CI can set the same environment variable on a trusted hydration or snapshot-import
step. The default writer uses `json`. The setting applies to new files, including new
imported snapshots. Existing IDs retain the first successfully published file. On an
unchanged repeat you may therefore see the original size. The format setting lives
outside project extraction configuration and semantic cache identity.

Readers detect the encoding from the file contents. MCP, viewer and CLI queries use
the same snapshot store. The physical filename still ends in `.json` so that either
format competes for one atomic publication slot. Callers of `file()` or `withFile()`
receive **physical bytes**. Use the store's `read()` method for a graph, or
[snapshot export](SNAPSHOT-DELIVERY.md) for ordinary JSON with a verified bundle.

Each compact file contains a version marker, the decoded byte length, SHA-256 of the
original JSON, SHA-256 of the framed payload, and length-prefixed Brotli blocks. Each
block represents up to 1 MiB of original JSON. Full reads check lengths, both digests
and end of file. Manifest-only cache inventory reports partial inspection. The
store's head-manifest lookup still validates the complete stream. A cold query
loads the graph into memory and ranks its facts using the existing query engine.

Use `cache usage --verify` for a physical inventory. `cache profile` reports physical
bytes and decoded JSON bytes. Verified inspection and delivery enforce byte limits
on decoded data. Retention uses the physical file length and checksum for selection
and deletion. A stored snapshot still carries its original commit, logical content
digest, provenance and authority.

## Roll back

Select `json` or unset the variable on writers to resume JSON publication. Upgraded
readers continue to open compact history. For a reader running an older toolkit,
export the required snapshot with the upgraded toolkit and import the verified
bundle into a fresh cache using the JSON writer. Include semantic artifacts in the
transfer when they are needed for future extraction reuse. Check the receiving
snapshot identity and query before retiring the original. Changing modes leaves
existing generations in place. There is no in-place bulk conversion command.

## Public saved-query measurement

The production writer stored a 15,860-fact graph in 2,114,835 bytes versus 29,216,773
bytes as JSON (92.76% smaller). A fresh impact query over each file returned the
same complete 60-fact page, including citations, coverage and continuation. Linux
Node 24.19.0 took 2.45 seconds for the compact scan and 1.99 seconds for JSON.
Full head-manifest reads took 1.66 and 1.29 seconds respectively. These single runs
used fresh service instances with a warm filesystem cache. Private-repository size,
peak memory and query latency need separate measurements.

Reproduce with `pnpm exec tsx scripts/storage-study/run-query.ts` in the source
checkout. The [measurement receipt](../assessments/compact-query-r5.json) records
the dimensions and timings. Block framing changes the compression ratio from the
earlier whole-file study.
