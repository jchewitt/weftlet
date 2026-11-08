# 0.8.1 original owner-intent consumer acceptance

Status: **the reported original-page missing-intent regression is resolved in
this consumer replay**. Maintainer-supplied sanitized TradePilot evidence,
2026-11-06 Central / 2026-11-07 00:58 UTC. Upstream has not loaded the private
graph or independently rerun this private query.

Both official `@weftlet/core@0.8.1` and `@weftlet/toolkit@0.8.1` archives were
independently verified by the consumer; all **528 installed archive files** match
the downloads. The upstream release source is
[`ce3d5320a4539382ca61ef8a2492efb23b3f1a90`](https://github.com/jchewitt/weftlet/commit/ce3d5320a4539382ca61ef8a2492efb23b3f1a90),
published through [release run 42315084899](https://github.com/jchewitt/weftlet/actions/runs/42315084899).

## Original request and evidence identity

The original `impact.scan` request was retained: the owner argument was present
and unnormalized, with the original task, three checklist items, eight changed
files, depth **3**, and **60** results. This was a fresh first page with no
continuation input. The producing configuration was unchanged. There was no
private rehydration or model call.

- Snapshot ID:
  `b01f372a0ac88a5bd3830771d1e37d01bcfd3fd8-graph-v12-links-2.0.0-files-2.0.0-contracts-1.2.0-symbols-2.1.0-c0d10e16442a69b2-e2b0c4e32bbb-runtime-4f53cda18c2b`.
- Manifest content digest:
  `2fe11730912019700e7038edd48ad90b2ad80581055cc42dcae93ed54b0e55af`.
- Whole snapshot-file SHA-256:
  `0cac5d5e6c6c31ef597337860d06d81ccc719b6df5e1e85ca383f934bbc8c531`.
- Owner argument SHA-256:
  `157224b1f0e596fda7314f46b88cf19ea5e35892d4183052a086e1cd343de57d`.
- Original task argument SHA-256:
  `720065160962a66db21cf48a67476cb1d2e9ed79f9d9264f0b9d121294fe4f00`.

The manifest digest and file SHA-256 describe different representations; they
are not expected to equal each other. No source text, labels, prompts, raw request
arguments or account data are included here.

## Retrieval versus coverage accounting

| Measurement | Original saved page | 0.8.1 original-request replay |
| --- | ---: | ---: |
| Primary display-lane intent | 0 | 2 |
| Source-intent coverage, applying the **same new definition** to both pages | 3 | 6 |
| Exact-owner-cited assertions returned | 1 | 4 |
| Page size | 60 | 60 |
| Reachable facts | 459,338 | 459,338 |

The six intent-coverage facts are **not six newly retrieved assertions**. The
original page already contains three facts under the new source-intent definition.
The new full-page coverage is **6 intent / 11 contracts / 26 implementation /
23 validation**, with nonexclusive counts. Depth, truncation and continuation
reporting remain present. The 56 non-priority results preserve their original
relative order. All 60 returned fact objects exactly equal stored assertions,
including citations and authority.

The first four assertions now cite the exact owner. All four are semantic
assertions, not generated document links. Source authority remains **declared**,
assertion authority **inferred**, and extraction review **unreviewed**.

| Rank | Predicate | SHA-256 of assertion ID (not the assertion ID itself) |
| --- | --- | --- |
| 1 | `consumes` | `520385e99449802cd9445e674e1b4a17711de0f2e037fb7d7ccaae4914279c02` |
| 2 | `governedBy` | `eaef890ecd04c33fa6b333715947eaa67cfd68d16a8ef228a1e335b5df78a1bb` |
| 3 | `consumes` | `f89f547769a1746b13689a65973489bafadc1645321ab7d42249616f91b0cad9` |
| 4 | `references` | `530a08d699742495d2f586cdebfa65bab6226194963b395e2eb4c745327894dd` |

The full saved graph still has **573,347 facts**. Its **165 owner-cited/source-intent
facts include 54 semantic assertions**. The earlier primary-intent subset remains
exactly **15 semantic + 65 document-linker** facts. These are different accounting
sets, not evidence of new extraction or fact creation.

## Preservation, transport parity and limits

A fresh 0.8.1 stdio MCP process and the released CLI returned the same ordered
60 fact IDs, snapshot and coverage. **56 consumer tests passed**; one existing
Windows symlink case was skipped. All **116 preserved fingerprints** match,
covering the **1,116,685,237-byte snapshot**, producing configuration, original
capture/helper and **112 semantic artifacts**. Runtime evidence remains empty.

The already-open desktop reader still needs to reconnect. Fresh-process parity
does not establish that the desktop has reloaded. This acceptance closes the
specific original-page missing-intent report in
[the investigation](OWNER-INTENT-RETRIEVAL.md) and supports the bounded selection
in [ADR 045](ADR-045-owner-intent-retrieval.md). It does not establish universal
task relevance, semantic correctness, full recall, current-diff graph/review
acceptance, runtime behavior or a new hosted viewer deployment.

Subsequent update, 2026-11-08: the separate indirect-worker ranking ticket passed
its [own 0.8.1 consumer replay](assessments/consumer-pm-0.8.1-2026-11-08.json).
That result is independent of this EQT acceptance. The final official 1.0 release
decision remains in the [work queue](1.0-WORK-QUEUE.md).
