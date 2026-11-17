# R2 public snapshot representation study

Measured November 17, 2026, on Linux x64 / Node 24.19.0, using the R2 candidate
built on `8543be5`. [Aggregate measurements](storage-profile-r2.json) contain no
consumer source, prompts, configuration or graph facts. Temporary public fixture
files were removed after the checks. This is a reproducible corpus recipe, not a
claim that a fresh run will have the same Git/snapshot identity or timing.

```sh
pnpm benchmark:storage 64 160
```

The fixture generates 64 TypeScript modules with 160 exported functions each,
shared helpers, same-file calls and one test per module. Eighteen public Markdown
rules link to implementations. Real SCIP indexes committed source; a deterministic
fixture provider extracts those simple rules. No external model or API is called.
This isolates storage measurement from semantic-quality evaluation.

| Measurement | Observed |
| --- | ---: |
| Selected public Markdown | 2,390 bytes / 18 documents |
| Generated TypeScript and tests | 1,214,081 bytes |
| Published facts | 124,532 |
| Stored snapshot JSON | 231,213,517 bytes (220.5 MiB) |
| Hydration, including strict validation/publication | 216.8 seconds |
| Streamed snapshot profile | 17.0 seconds |
| Node payload occurrences / distinct full payloads | 249,064 / 31,533 |
| Repeated full node payload value bytes | 74,798,313 |

An earlier 16-module / 80-function run produced 15,860 facts and 29,216,773 stored
bytes; profiling took 2.1 seconds. These are two single-host observations, not a
scalability guarantee, memory benchmark or acceptance of the private 574k-fact graph.

## What the bytes suggest

`subject` and `object` payloads together occupy 87,450,893 compact value bytes.
Their full-payload repetition counter remained complete at the default 100,000
fingerprint bound. This supports testing lossless entity interning in R5, including
labels and all other payload fields in equality. Equal IDs alone are insufficient.

Provenance values occupy 30,474,320 bytes, but complete provenance records show
little detected repetition: 392 repeated occurrences / 72,732 bytes before and
after the tracking bound filled. There are 24,140 untracked occurrences, so this is
a lower-bound observation, not a total duplication claim. Per-occurrence locations
vary even when source paths, commits and digests repeat. Interning only complete
provenance records may offer much less value than sharing their repeated fields.

Fact string values show 124,422,127 detected repeated bytes, with 111,978 untracked
occurrences. That counter is explicitly incomplete. String and entity categories
overlap; adding them would double-count potential savings. Reference IDs, tables,
chunk indexes and integrity manifests also cost space. No compression ratio is
claimed without implementing and measuring an equivalent representation.

The full fact-field/section and cache-class tables are in the JSON receipt. Code
occurrences, call proof and provenance remain necessary evidence; R5 must preserve
them and prove hydration/query equivalence, rather than discarding those fields.
SCIP bytes are measured separately from the graph and semantic artifacts. A small
selected-document budget clearly does not bound the resulting code graph.

## Checks and limitations

Hydration completed strict validation and snapshot publication. The profiler's
record count equals the hydrated fact count; a full pre-profile SHA-256 equals its
streamed digest. Before/after verified inventory objects, including artifact hashes,
match exactly, and the saved snapshot reloads with its original content digest.
The profiler itself only checks JSON/basic snapshot structure, not SHACL again.

All facts contribute to section and field totals, including when repetition maps
fill. The fixture deliberately repeats code patterns, so its ratios do not predict
an arbitrary application. Allocation is host filesystem accounting; no deletion,
peak-build reservation, format migration or compression experiment occurred.
The small real-SCIP regression runs in the deterministic suite; this larger study
is an explicit development command. Consumer storage acceptance remains separate.
