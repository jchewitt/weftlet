# Evidence explorer

The local application starts from snapshot-wide product-intent discovery,
then queries focused neighborhoods over the full saved snapshot.

```sh
weftlet viewer serve --config context-graph.config.json --snapshot <exact-snapshot-id>
```

Open the loopback URL printed by the command (default `http://127.0.0.1:4173`; change it with
`--port`). No adapter, model provider, compiler or refresh is started. The saved snapshot stays
pinned while checkout freshness can be refreshed separately. Historical/configuration-incompatible
evidence remains browsable and is never reported as current-diff validation.

The bundled Cytoscape.js application supports drag/arrange, pan/zoom, focused node navigation,
back/breadcrumbs restoring layout, exact relationship predicates/directions, authority filters,
literal catalog search and deterministic continuation. Start at intent, contracts, implementation
or tests/observations. Source authority and extraction approval remain separate. Logical component
concepts can appear in intent; physical code nodes are reached through relationships. No approved
intent is manufactured from code.

Inspect an edge to open grouped, collapsed assertions with exact citations. A selected node can
fill either endpoint of the bounded path search. Paths preserve stored predicates/directions and
do not prove causality. Overview connections only cover displayed catalog nodes and bounded
neighborhood pages; counts state remaining pages. Authority filters act on the returned page.
The diagnostic panel retains gaps and omitted-summary counts.

To enable source links, add `--source-url-template` with an HTTPS template containing `{commit}`
and `{path}` (and optionally `{line}`), as in the legacy example below. Nothing is sent to a CDN.
The server binds only to loopback, rejects other Host/Origin values, accepts bounded read queries,
and serves an allowlist of packaged assets. Remote binding, authentication and Docker deployment
are a separate milestone; do not expose this local server through a public proxy.

`weftlet viewer export` creates [focused portable bundles](PORTABLE-EXPLORER.md) around explicit
product areas, with navigation boundaries, while the local explorer browses the full snapshot.
See the [milestone plan](VIEWER-EXPLORER-PLAN.md) and [shared discovery contract](EXPLORER-DISCOVERY.md).

## Authority inspection and resolution

The viewer is read-only. Inspect grouped assertion citations and authority/review
metadata, then use the [evidence decision guide](guides/EVIDENCE-DECISIONS.md) to
resolve source-policy, document, extraction or retrieval issues. There is no
accept button, automatic approval queue or authority edit in this viewer.
Changing a filter does not approve a source; config/source changes require an
explicit refresh and selection of the new snapshot.

## Legacy impact-page exports

The existing `visualize` HTML/DOT/SVG outputs retain their page-local behavior.

`context-graph visualize --changed-file src/discovery.ts --snapshot <id> --output graph.html`
renders the same Context Pack returned by `impact.scan`. HTML is self-contained; DOT and SVG
remain available. No CDN, service, model or alternative graph extraction is involved.

[Visualization rendering](../src/visualization/visualization.ts) consumes the
[impact-query result](../src/graph/query.ts). [Viewer interaction](../src/visualization/viewer-interaction.ts)
handles page-local filtering and path selection. [Rendering tests](../src/visualization/visualization.test.ts)
check generated output; interactive browser validation remains a separate check.

Nodes are grouped by evidence lane, then module/layer metadata or node kind. Filter by cluster,
authority or source text. Select a node (click or Enter) to inspect its relationships, confidence,
extractor, source approval, extraction review state and commit-bound citations. The neighbor
filter narrows the view. Select a target to highlight one shortest directed path within the
displayed page and enabled authority filters; edge direction follows the recorded predicate.

The status panel exposes commit/configuration/scope, excluded changes, draft/staleness, counts,
depth exhaustion and continuation. A missing path is not proof of no dependency. Retrieve another
page with `--continuation`, or rerun with a larger `--max-depth` when the depth bound was reached.
The viewer accepts at most 200 facts and 500 runtime references. References are shown separately;
only runtime facts present in the query become edges.

Source navigation displays exact paths, lines and commits. To link to a trusted code host, use:

```sh
context-graph visualize --snapshot <id> --output graph.html \
  --source-url-template 'https://github.com/OWNER/REPO/blob/{commit}/{path}#L{line}'
```

Templates must use HTTPS without credentials and include `{commit}` and `{path}`. No source URL is
invented by default. The artifact itself contains evidence labels and citations, so review it
before sharing it outside the repository.

Tests cover graph/fact equivalence, escaping, script syntax, source URL validation, path bounds,
cycles and coverage indicators. No real-browser automation or visual accessibility audit has run
in this cloud environment. This is a bounded inspection tool, not a whole-repository canvas.

Future sources such as Figma should enter through `ContextGraphAdapter` / `FactExtractor`,
preserving stable IDs, source citations, approval boundaries and extraction identity. They must
produce the same graph records and pass SHACL/projection tests. No Figma adapter is implemented.
