# Lossless snapshot encoding study

A contributor can reproduce this experiment with Node 24 and the frozen workspace dependencies.

```sh
pnpm benchmark:storage 64 160 --compare-codecs
```

The study hydrates the [public R2 corpus](storage-profile-r2.md) once using real SCIP,
the deterministic public semantic provider and strict validation. Gzip level 6 and
Brotli quality 4 each read the same immutable snapshot file. The encoder streams to
a temporary file. The decoder streams into a SHA-256 calculation and byte counter.
The study checks both against the original file and compares verified cache inventory
before and after. Temporary compressed files are removed as each measurement finishes.

The timings include stream and filesystem I/O. Decode timing includes hashing. One
run per codec in a fixed order shares the host's filesystem cache. The byte counts
cover the complete snapshot JSON, including its current manifest. Separate SCIP files
and future compact-envelope metadata are outside those totals. The corpus has
many similar TypeScript functions. A consumer can expect its own compression ratio
to depend on the distribution of code, facts and citations in its graph.

## Results on November 19, 2026

| Facts | Original bytes | Codec | Stored bytes | Size reduction | Encode (s) | Decode + hash (s) |
| ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 15,860 | 29,216,773 | gzip-6 | 2,784,572 | 90.47% | 0.42 | 0.32 |
| 15,860 | 29,216,773 | brotli-4 | 1,759,680 | 93.98% | 0.31 | 0.17 |
| 124,532 | 231,213,517 | gzip-6 | 22,765,249 | 90.15% | 2.57 | 1.49 |
| 124,532 | 231,213,517 | brotli-4 | 17,916,773 | 92.25% | 2.40 | 1.27 |

Both codecs reproduced the exact input bytes at both scales. The [measurement record](snapshot-codecs-r5.json)
includes the source hashes, tool environment, verified lengths and corpus dimensions.
Brotli quality 4 produced the smaller payload on both graphs. Use it as the first codec
for the compact storage prototype. Compare production read latency, peak memory and
the cost of integrity checks before selecting a default. Entity interning and SCIP
blob sharing remain separate options whose savings need independent measurements.

## Reader and migration requirements

The current store exposes a snapshot file to inventory, retention and verified transfer.
Export copies that file into a JSON bundle. Import checks collisions against the
persisted file bytes. A new encoding needs a common way to open the **logical JSON
stream** and a separate identity for the **physical stored file**. This preserves the
existing transfer contract and lets retention count the actual bytes it can reclaim.

Prototype a versioned envelope with a bounded manifest and a streamable compressed
payload. Bind the manifest, payload length and digest together. Cold manifest lookup,
inventory and impact queries need separate timings. A byte-perfect sequential decode
establishes fidelity but leaves the cost of loading a large graph for a query open.

Qualify an opt-in writer and a reader that handles both representations. Exercise an
existing oversized cache with mixed generations, including duplicate IDs, interrupted
publication, transfer in both directions, current/previous heads, retention and rollback
to JSON. Compare full impact pages, citations, authority, cursors and strict validation
against the same saved graph. Measure peak disk and memory as well as the steady-state
size. These are the release checks for enabling the compact format in the toolkit.
