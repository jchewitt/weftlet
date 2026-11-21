# Storage retention across successive builds

The public qualification edits an exported TypeScript symbol in six successive commits. Each run indexes TypeScript, compiles the graph, passes strict SHACL, and publishes its own immutable snapshot. An offline fixture supplies structured semantic output for the unchanged documents. Subsequent builds must reuse all six artifacts. One managed profile has a one-byte history target, a pin on its first generation and a head that keeps its current and previous generations. The deliberately small target exercises protected overage on every build.

After each publication the harness runs recurring maintenance, checks the protected snapshots and their raw indexes by SHA-256, verifies retired IDs are absent, measures regular files and checks that compiler scratch is empty. Once the window is full, four successive measurements must each contain three graphs, three references and three distinct SCIP blobs, with retained payload sizes within a 5% band for these equal-size source edits. Per-file counts measure both logical and allocated bytes. Durable journals are included in whole-cache totals. Directory metadata, transient build peaks, filesystem-wide free space reclaimed and long-run performance are outside this measurement.

A final capacity probe requests the volume's available space through the production transfer floor and expects refusal. A seventh hydration then injects ENOSPC at the immutable snapshot publication system call in the isolated study process. It checks the failure, saved head, retained snapshot hashes and the entire cache file inventory. These two checks exercise preflight and publication failure without filling a developer disk.

## Initial Linux measurement

On toolkit source `78b61e88b5ddbd3b1dd1887c52ede3853d62549d`, Linux overlayfs and Node 24.19.0, direct RDF produced 552 facts per generation. For the four settled measurements, the graph/reference/index payload ranged from 265,517 to 265,750 logical bytes and occupied 294,912 allocated bytes each time. Whole-cache allocation rose from 327,680 to 339,968 bytes across those measurements as maintenance wrote journals. The protected evidence and capacity checks passed.

A separate Linux run on source `1caf5d1` exercised a real ENOSPC on a 16,777,216-byte private tmpfs. The fixture published 549 facts, and the one-byte retention target reported 106,738 bytes of protected overage. The next hydration completed strict validation. With zero bytes available at publication, it failed, and the original head, snapshot bytes and raw SCIP index remained intact. To reproduce, run `bash scripts/storage-study/full-volume.sh` from the built checkout on Linux with Docker. The container has no network and can only read the study checkout.

In the same cloud environment the actual pinned openCAESAR container reached Gradle, which could not fetch its dependencies from Maven Central. Hosted workflow jobs run the real compiler on Ubuntu and direct RDF on Ubuntu and Windows. Their artifacts record the tested checkout, backend, filesystem, measurements and per-file observations. A passing report from each job is needed for that platform/backend combination.

## Reproduce

From a built checkout with frozen dependencies, choose a fresh output filename. The report and temporary cache contain only the public fixture. The optional compiler also needs a Linux Docker engine with access to the pinned Gradle image and Maven dependencies.

```sh
WEFTLET_SNAPSHOT_FORMAT=brotli-v1 node --import tsx scripts/storage-study/history-plateau.ts rdf rdf-allocation.json
WEFTLET_SNAPSHOT_FORMAT=brotli-v1 node --import tsx scripts/storage-study/history-plateau.ts opencaesar gradle-allocation.json
```

On Windows set `$env:WEFTLET_SNAPSHOT_FORMAT='brotli-v1'` in PowerShell and run the Node command with `rdf`. The native allocation helper opens each regular file and reads `FILE_STANDARD_INFO.AllocationSize` on NTFS. Linux uses the file's allocated block count multiplied by 512. [Storage qualification workflow](../../.github/workflows/storage-qualification.yml)
