# Focused portable evidence reports

The same explorer application can run from static files, without a Weftlet API, model provider,
repository adapter, Git checkout or graph database. A portable report includes selected complete
neighborhoods. The local `viewer serve` command browses the full saved snapshot. Storage and
access are independent: snapshot storage already supports the local read API.

Choose exact roots from `weftlet graph catalog --snapshot <id> --view intent --json`, then export:

```sh
weftlet viewer export --config context-graph.config.json --snapshot <id> \
  --node 'workflow:reserve' --depth 3 --output .context-graph/reports/reservation
```

The root above is illustrative; use IDs actually returned by your snapshot. Repeat `--node` for
multiple product areas. `--source-url-template` uses the same HTTPS, commit-bound template as
`viewer serve`. Export is read-only with respect to saved evidence and needs no extraction.

Serve the entire output directory with a static server, for example:

```sh
python3 -m http.server 4174 --bind 127.0.0.1 --directory .context-graph/reports/reservation
```

Open `http://127.0.0.1:4174/`. Static HTTPS hosting, including a subdirectory, also works. Keep
`index.html`, `explorer.json`, `assets/`, and `data/` together. Direct `file://` loading is not
supported: the app fetches data shards and uses Web Crypto on HTTPS or localhost. No external
requests or CDN assets are required. Python is only one example static server, not a toolkit
dependency. CI upload/deployment and access control remain the user's responsibility.

## What is included

Depth 1 expands each root's complete incident neighborhood, in both directions. Each additional
step expands its neighbors. Every expanded node retains all its saved incident assertions; nodes
seen only at the frontier appear with dashed borders and an **outside report** label. Entering one
explains the boundary and retains the prior view. Such a node is not absent from the source graph.

Catalog/search cover expanded nodes in this report. Snapshot totals, code coverage and snapshot
identity still describe the original saved evidence and are labeled separately. Exact assertions,
citations, authority, review state, selected diagnostic counts and neighborhood pagination match
the local query service. The report has its own cursor namespace and hashed read-table identity;
local and portable continuations are not interchangeable. Working-change status is captured at
export time and cannot be refreshed from a static artifact.

Full-snapshot path search is deliberately unavailable in the focused report. Use the local
explorer to search the full saved graph. The legacy `visualize` HTML/DOT/SVG formats remain
available for individual impact pages.

## Limits and publication

| Limit | Default | Maximum |
| --- | ---: | ---: |
| `--depth` | 2 | 8 |
| Distinct `--node` roots | explicit | 64 |
| `--max-facts` | 20,000 | 100,000 |
| `--max-nodes` (expanded + frontier) | 2,000 | 10,000 |
| `--max-bytes` (all JSON data, index and metadata) | 67,108,864 | 268,435,456 |
| Individual JSON shard | up to 100 facts / 8 MiB | 8 MiB |

Static application assets are additional to the JSON budget. The exporter fails if the selected
scope exceeds a limit; it does not remove relationships to make a report fit. Narrow the selection
explicitly or use the full local explorer. Even a single unusually large assertion/read table can
exceed the per-file bound and cause a clear failure.

Data is streamed into bounded files named by SHA-256, avoiding logical IDs in physical filenames.
The browser verifies data-file hashes and size limits before decoding them. These checks detect
changed data; they do not authenticate a publisher. Unchanged exports preserve the read-table and
fact-shard identities; capture-time checkout metadata can differ.

The destination must be a new directory, even if an existing one is empty. Export stages a
complete bundle next to it and atomically renames that directory only after a final evidence
check. An exclusive sibling lock isolates cooperating exports to the same destination. A process
crash may leave a staging directory/lock; verify that no export is active before removing only
those abandoned export files. Do not delete graph caches or snapshots as recovery.

Focused selection is not privacy redaction: the bundle contains exact saved assertions,
citations and source-snapshot metadata. Review that inventory before sharing; the command never
uploads or publishes it. Optional authenticated Docker hosting and database adapters are separate
work, not prerequisites for either current viewer mode.
