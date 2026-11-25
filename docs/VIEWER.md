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
and serves an allowlist of packaged assets. For remote access, follow the [self-hosting instructions](#serve-ci-evidence-from-another-machine) to deploy an exported snapshot.

`weftlet viewer export` creates [focused portable bundles](PORTABLE-EXPLORER.md) around explicit
product areas, with navigation boundaries, while the local explorer browses the full snapshot.
See the [milestone plan](VIEWER-EXPLORER-PLAN.md) and [shared discovery contract](EXPLORER-DISCOVERY.md).

## Follow a rule to its callers

1. Choose **Product intent** and type a recognizable word from the rule, such as `reservation`. Search matches part of a saved label, node ID or cited source path, ignoring case. Choose **All saved evidence** to search across facets.
2. Open the rule and choose **Implementations**. Each arrow follows a saved `implementedBy` assertion. Open a method when the binding names a method. A file-level binding takes you to the file.
3. At a method, choose **Callers** for incoming `calls` or **Callees** for outgoing `calls`. Expand a group in **Cited relationships** to see both endpoints, the direction and the source line. Open the assertion to inspect its authority, review state and supporting citations. A `references` assertion stays available under its own predicate.
4. Use the named breadcrumb to return to the rule. Back restores the previous filters and canvas layout. Each newly opened node starts with both directions so an incoming caller can be discovered after an outgoing implementation link.

The local explorer can query every saved neighborhood. In a focused report, a dashed endpoint names a real relationship whose other neighborhood needs the full snapshot. Selecting it keeps your place and identifies the boundary.

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

## JavaScript client for saved graph reads

In the next toolkit candidate, a browser or Node application can import the lightweight client directly. Start the local viewer, then pass its printed service URL and the exact saved snapshot ID.

```js
import { createGraphReadClient } from '@weftlet/toolkit/client';

const graph = createGraphReadClient({ baseUrl: serviceUrl, snapshotId });
const page = await graph.catalog({ view: 'intent', search: 'reservation' });
if (page.nodes.length) {
  const focus = await graph.neighbors({ nodeId: page.nodes[0].node.id, maxFacts: 30 });
  console.log(focus.facts, focus.selection.continuation);
}
```

The client uses `POST api/v1/query` relative to the service directory and pins every read to the supplied snapshot ID. Pass `contentDigest` from a trusted manifest for an additional identity check. `fact` and `paths` accept the same bounded query fields as their CLI equivalents. The server retains the original local endpoint for existing callers. The [self-hosted plan](SELF-HOSTED-GRAPH-PLAN.md) tracks remote access and PostgreSQL.

## Serve CI evidence from another machine

**Build once in the producer checkout.** Export the exact committed snapshot. Record the returned `manifestSha256` in your trusted deployment configuration. Transfer the output directory to the host as a private artifact. The default export contains the graph and its manifest. Keep the separate semantic cache on the producer.

```sh
weftlet snapshot export --config context-graph.config.json --snapshot "$SNAPSHOT_ID" --output ./graph-bundle
```

**Run on the host.** Install the same release of `@weftlet/toolkit` with Node 24. The service reads the bundle once, verifies its manifest, payload bytes and persisted graph digest, runs identity checks and strict SHACL, and then opens the listener. A running process keeps that generation in memory. To change generations, start another instance with the new trusted digest, check its catalog, and switch clients. Each restart rechecks the files.

```sh
weftlet viewer serve --bundle /srv/weftlet/graph-bundle --expect-digest "$MANIFEST_SHA256" --port 4173
```

For personal access, forward `127.0.0.1:4173` with SSH and open the printed loopback URL on your machine. Use the same port at both ends so the browser Host matches. The default trusts processes with access to the host's loopback interface. For a shared machine, use the authenticated mode below.

```sh
ssh -N -L 127.0.0.1:4173:127.0.0.1:4173 your-graph-host
```

**Give a team read access over HTTPS.** Set `WEFTLET_VIEWER_TOKEN` from your service manager's secret store to a random secret of at least 32 printable ASCII characters (up to 256, without spaces). Configure an exact origin dedicated to this project. The service checks the credential on every route, including metadata and static assets. It checks the HTTP Host and any browser Origin against the configured origin. Run one service and credential per project or access group. A credential grants read access to the entire selected snapshot, including saved citations.

```sh
weftlet viewer serve --bundle /srv/weftlet/graph-bundle --expect-digest "$MANIFEST_SHA256" \
  --public-origin https://graph.example.org --port 4173
```

Terminate TLS at a reverse proxy on the same host, forward to `127.0.0.1:4173` and preserve the public Host and Authorization headers. Exclude Authorization from proxy logs. Browsers use the HTTP login prompt with username `weftlet` and the token as password. Programmatic clients can send `Authorization: Bearer <token>` over HTTPS. Rotate the token by updating the service secret and restarting. For example, a Node process can use the shared client:

```js
import { createGraphReadClient } from '@weftlet/toolkit/client';

const baseUrl = 'https://graph.example.org';
const headers = { Authorization: `Bearer ${process.env.WEFTLET_VIEWER_TOKEN}` };
const graph = createGraphReadClient({
  baseUrl, snapshotId: process.env.SNAPSHOT_ID,
  fetch: (url, options) => fetch(url, { ...options, headers: { ...options.headers, ...headers } }),
});
const page = await graph.catalog({ view: 'intent', maxNodes: 10 });
```

The host needs the exported bundle and installed package. The viewer reports the saved commit, coverage and authority with checkout freshness unavailable. Plan memory for one full snapshot and its query index. The default bundle limit is 2 GiB of input bytes, configurable up to 16 GiB with `--max-bytes`. Measure startup and resident memory with your own snapshot. The service accepts four concurrent bounded queries. Remote MCP impact queries and PostgreSQL have separate implementation and acceptance steps in the [self-hosting plan](SELF-HOSTED-GRAPH-PLAN.md).
