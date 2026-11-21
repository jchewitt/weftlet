# Storage retention across successive builds

The public qualification edits an exported TypeScript symbol in six successive commits. Each run indexes TypeScript, compiles the graph, passes strict SHACL, and publishes its own immutable snapshot. An offline fixture supplies structured semantic output for the unchanged documents. Subsequent builds must reuse all six artifacts. One managed profile has a one-byte history target, a pin on its first generation and a head that keeps its current and previous generations. The deliberately small target exercises protected overage on every build.

After each publication the harness runs recurring maintenance, checks the protected snapshots and their raw indexes by SHA-256, verifies retired IDs are absent, measures regular files and checks that compiler scratch is empty. Once the window is full, four successive measurements must each contain three graphs, three references and three distinct SCIP blobs, with retained payload sizes within a 5% band for these equal-size source edits. Per-file counts measure both logical and allocated bytes. Durable journals are included in whole-cache totals. Directory metadata, transient build peaks, filesystem-wide free space reclaimed and long-run performance are outside this measurement.

A final capacity probe requests the volume's available space through the production transfer floor and expects refusal. A seventh hydration then injects ENOSPC at the immutable snapshot publication system call in the isolated study process. It checks the failure, saved head, retained snapshot hashes and the entire cache file inventory. These two checks exercise preflight and publication failure without filling a developer disk.

## Initial Linux measurement

On toolkit source `78b61e88b5ddbd3b1dd1887c52ede3853d62549d`, Linux overlayfs and Node 24.19.0, direct RDF produced 552 facts per generation. For the four settled measurements, the graph/reference/index payload ranged from 265,517 to 265,750 logical bytes and occupied 294,912 allocated bytes each time. Whole-cache allocation rose from 327,680 to 339,968 bytes across those measurements as maintenance wrote journals. The protected evidence and capacity checks passed.

A separate Linux run on source `1caf5d1` exercised a real ENOSPC on a 16,777,216-byte private tmpfs. The fixture published 549 facts, and the one-byte retention target reported 106,738 bytes of protected overage. The next hydration completed strict validation. With zero bytes available at publication, it failed, and the original head, snapshot bytes and raw SCIP index remained intact. To reproduce, run `bash scripts/storage-study/full-volume.sh` from the built checkout on Linux with Docker. The container has no network and can only read the study checkout.

In the same cloud environment the actual pinned openCAESAR container reached Gradle, which could not fetch its dependencies from Maven Central. Hosted workflow jobs run the real compiler on Ubuntu and direct RDF on Ubuntu and Windows. Their artifacts record the tested checkout, backend, filesystem, measurements and per-file observations. A passing report from each job is needed for that platform/backend combination.

## Migration and historical retrieval

A second study creates three retained generations on a larger public TypeScript project. A document-only commit reproduces the original SCIP index bytes. Deleting an exported function in the third commit produces distinct bytes. The study runs the production migration for the first two copies and measures the logical and allocated size of every regular cache file before and after, including the distinct legacy index, shared references and removal journal.

With the producer head at the third generation, the study exports the first snapshot and its semantic artifacts. A separate clone strictly validates the historical import, reads the same ordered 60 facts and citations, then checks out the producing commit and hydrates again. The repeat must reuse all 18 semantic artifacts and reproduce the original snapshot and SCIP digest, with identical compact snapshot bytes throughout. Ubuntu and Windows produce a separate `storage-migration.json` report.

## Reproduce

From a built checkout with frozen dependencies, choose a fresh output filename. The report and temporary cache contain only the public fixture. The optional compiler also needs a Linux Docker engine with access to the pinned Gradle image and Maven dependencies.

```sh
WEFTLET_SNAPSHOT_FORMAT=brotli-v1 node --import tsx scripts/storage-study/history-plateau.ts rdf rdf-allocation.json
WEFTLET_SNAPSHOT_FORMAT=brotli-v1 node --import tsx scripts/storage-study/history-plateau.ts opencaesar gradle-allocation.json
node --import tsx scripts/storage-study/migration-delivery.ts migration-allocation.json
```

On Windows set `$env:WEFTLET_SNAPSHOT_FORMAT='brotli-v1'` in PowerShell and run the Node command with `rdf`. The native allocation helper opens each regular file and reads `FILE_STANDARD_INFO.AllocationSize` on NTFS. Linux uses the file's allocated block count multiplied by 512. [Storage qualification workflow](../../.github/workflows/storage-qualification.yml)

## Hosted results

GitHub Actions ran commit `26bec538752a31958cc7cf093064a415db610ee8` on Node 24.22.3. Each job published six 552-fact graphs through strict validation. Each retained the pinned generation and its current/previous head, released per-run compiler work and operation registrations, and verified the previous evidence after a failed publication. The four observations after reaching the history window measured the following regular-file allocations. [Run and downloadable measurements](https://github.com/jchewitt/weftlet/actions/runs/44949416800)

| Host and compiler | Retained snapshot/reference/index payload on each observation | Whole-cache allocation, first to last observation |
| --- | ---: | ---: |
| Ubuntu, direct RDF | 294,912 B | 327,680 → 339,968 B |
| Ubuntu, real openCAESAR in Docker | 294,912 B | 327,680 → 339,968 B |
| Windows NTFS, direct RDF | 284,040 B | 309,144 → 321,432 B |

The migration workload measured 307,200 allocated index bytes saved on Linux and 314,512 on NTFS. Both verified strict historical import, 60 unchanged query facts and 18 reused artifacts with zero extractions. A separate Ubuntu volume reached zero available bytes after strict validation and preserved its prior 549-fact graph and index on publication failure. The reports record the files, digests and measurement methods.

### Consumer replay

Start with the exact published toolkit/core pair and a disposable coordinated cache. Use normal project settings for an exact-commit hydration and an independent comparison. Record the commit, package integrities, graph digest, semantic reuse counts and whether operation-owned scratch returned to baseline. Query the saved graph from a fresh process. For retained-history behavior, run beyond the chosen current/previous/pin window and record snapshot, index and journal bytes separately. The private cache owner controls pin retirement, migration, cutover and any permanent cleanup on the original volume. Record private adoption separately at the exact consumer commit.
