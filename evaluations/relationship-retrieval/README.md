# Fixed-budget relationship retrieval

The [protocol](protocol.md) and public TypeScript fixture were fixed before ranking changes.
Both result files query the same strictly validated saved graph: **15,549 facts**, snapshot
content digest `653aa9a2488764ad3f343d4d0c1e021ac824a16c73e62c97aaa215670a4d3a25`.
Three domains each retain **5,128 reachable assertions** at depth three. There are no model calls.

| Measure | 0.7.1 ordering | Candidate ordering |
| --- | ---: | ---: |
| Returned assertions, three cases × three pages × 60 | 540 | 540 |
| Expected source files discovered | 12/12 | 12/12 |
| Specific call / callsite-reference / consumer targets present in snapshot | 36/36 | 36/36 |
| Those relationship targets retrieved within the budget | 0/36 | 36/36 |
| Assertions referencing TypeScript standard-library declarations | 450/540 | 0/540 |

The library metric recognizes actual TypeScript native declaration descriptors, independently
of the production ranking heuristic. Zero library assertions in these pages does not mean that
library evidence was deleted: graph counts and reachable counts are unchanged, explicit library
queries are tested, and complete pagination retains the entire reachable set. The source fixture
intentionally includes dense real library operations and local variable occurrences in the same
functions as the evaluated calls. This is a targeted regression, not a general relevance benchmark.

[baseline.json](baseline.json) records released `proximity-diversity-v1` results;
[candidate.json](candidate.json) records `local-relationships-diversity-v2` results and a byte-level
preservation check over seven evidence files (snapshots, heads, RDF/index and three semantic
artifacts). Saved calls, references and file-level consumers are scored separately; none is
substituted for another, and a queue-name mention cannot satisfy an invocation target.

To reproduce, build the checkout and create a public fixture under the desired ranking version:

```sh
pnpm evaluate:retrieval /tmp/retrieval-baseline.json --retain-public-fixture
```

Then run the second checkout against that **same** retained fixture, without hydration:

```sh
pnpm evaluate:retrieval /tmp/retrieval-candidate.json --rescore /tmp/retrieval-baseline.json
```

The first command creates a `.fixture-root` sidecar for the public temporary repository. The
second verifies source/snapshot identity, unchanged budgets and reachable counts, then checks
all evidence bytes before and after queries. Remove the retained temporary repository when done.
For the historical comparison, use the frozen fixture/measurement files with the ranking and
query implementation from published source commit `2d9ff2fb83ab72d5992cde61c3bbd1a461ab18b5`.
The ordinary test suite also creates a fresh fixture, runs real extraction/strict publication,
repeats all nine queries, checks exact page IDs, and proves library-symbol queries still work.

The separate high-branching path regression has 1,500 competing branches and a known direct
edge that sorts last by ID. The direct edge appears on the first page with the original
`depth=3`, `maxPaths=3`, `maxSteps=1000` limits. Exhaustive small-graph path and viewer parity
checks retain all simple paths, citations, truthful truncation and bounded continuation.

Private TradePilot acceptance remains open. Its sanitized diagnostic proves the reported
assertions were present and reachable; it does not establish their positions under this patch.
