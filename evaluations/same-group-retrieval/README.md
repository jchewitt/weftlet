# Same-group retrieval evidence

See the [frozen protocol](protocol.md) and [decision](../../docs/ADR-043-shared-symbol-specificity.md).
Both variants use real TypeScript extraction, strict SHACL and saved evidence; no model calls.
Before/after comparisons query the same immutable snapshots. `v3-*` reports were captured before
production changes. Their frozen implementation is retained in the study directory for audit.

| Variant | Facts / reachable | Direct | Reference rank v3 → v4 | Consumer rank v3 → v4 | Complete pairs / 136 | Sources in 180 v3 → v4 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Selective shared symbol | 6,417 | 113 | 3,074 → 141 | 323 → 10 | 0 → 2 | 63 → 38 |
| Symmetric witnesses | 6,416 | 113 | 3,074 → 2,892 | 323 → 309 | 0 → 0 | 63 → 60 |

Each report records all 180 returned assertion IDs, full target facts, source/group ordinals,
all 136 pairs (272 exact assertions), truthful limits and unchanged four-file fingerprints.
Target predicates remain `references` and `consumes`; no saved call proves the reference.
The symmetric case deliberately records a failure of bounded recall. It is not retargeted to
an earlier-ranked worker. Private consumer acceptance remains open.

Reproduce a fresh public run (writes only a temporary public fixture plus the chosen report):

```sh
pnpm evaluate:same-group specific /tmp/specific.json --retain
pnpm evaluate:same-group symmetric /tmp/symmetric.json --retain
```

Query the retained public fixture without new extraction using
`--saved-public-root <root>` instead of `--retain`. The runner verifies every expected corpus file
before querying, fingerprints all saved evidence before/after and compares the frozen v3 order.
The retention pointer is local-only and is not part of the archived report.

Check all three pages through the built CLI and a fresh stdio MCP server:

```sh
pnpm exec tsx scripts/same-group-study/entrypoints.ts . <saved-public-root> /tmp/specific.json
```

The first argument can also point at a fresh installed package directory. This check does not
hydrate or call a model, and verifies the exact saved target facts and all original storage bytes.

The separate `prior-36-control.json` retains all 36 expected relationships, 12/12
page-one expected source suggestions/citations and 0/540 TypeScript library assertions.
It uses the original three domains and unchanged per-case depth / 3 × 60 budgets.
