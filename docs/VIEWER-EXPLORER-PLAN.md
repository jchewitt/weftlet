# Graph explorer milestone before 2.0

The local and portable Cytoscape explorer shipped in 0.8.0. Focused caller navigation is part of 0.16.0. The [self-hosted 1.0 plan](SELF-HOSTED-GRAPH-PLAN.md) schedules the deployable service, PostgreSQL, Sigma overview and vocabulary viewer before 1.0.

The maintainer selected **both portable reports and a local explorer**, explicitly allowing
a bundled application rather than a single HTML file. Portable reports should cover explicit
selected product areas with visible navigation boundaries; the local explorer can browse the
full saved snapshot. Optional hosting as a Docker service
on an existing SSH-managed host is desired. Available infrastructure does not select a
database or authorize changing a shared deployment. The [query boundary decision](ADR-044-viewer-query-boundary.md)
records the proposed local/hosted/storage split and its connection to the [2.0 plan](WEFTLET-2.0-PLAN.md).

## User problem and verified baseline

The reported viewer is difficult to navigate: no visible product intent, a wall of code
nodes and overlapping arrows at startup, lengthy blended sidebar content, buried gaps,
and no useful exploration from intent into implementation or back through cross-domain
relationships. The requested behavior is drag/arrange, pan/zoom and progressively entering
connected scopes, with a clear route back, rather than selecting nodes only to append details.

Source inspection confirms that `visualize` renders **one impact.scan page** (default 60,
maximum 200 facts). The exported viewer only knows that page. Selection fills a details panel;
neighbor/path operations cannot retrieve another neighborhood from the saved graph. A better
layout library alone cannot correct this data-access boundary.

The preserved public pipeline report contains 100/528 reachable facts: 24 primary-lane intent
facts and 12 rendered intent nodes. That does **not** reproduce the reported private zero-intent
case or establish its cause. Diagnose these independently:

- Intent absent or unclassified in the saved snapshot.
- Intent present in the snapshot but outside the selected query/export page.
- Intent present in the exported data but filtered, misclassified or difficult to discover.

Do not repair a missing-intent display by relabeling implementation or unreviewed inference as
approved intent. A declared source and approval of its extracted assertions remain separate.

## Interaction goals

- Start with an intent/capability/workflow overview and visible coverage/gap counts. Code is
  available through deliberate exploration, not a whole-snapshot rendering at page load.
- Navigate intent → contracts/obligations → implementation → tests/observations, and back from
  code to relevant intent, retaining the exact saved relationship direction and evidence.
- Explore cross-domain and asynchronous links when supported by saved facts. Static paths,
  shared references and transport declarations do not prove runtime causality or delivery.
- Enter a focused neighborhood, expand/collapse related scopes, follow connected nodes, and
  return using breadcrumbs/back history. Preserve positions and viewport during backtracking.
- Support drag, pan, zoom, fit/reset and clear selection. Layout changes do not edit evidence.
- Keep a compact, organized inspector: intent/source ownership, implementations, connections,
  evidence/citations and gaps. Full assertion details are deliberate drill-downs, not an
  always-open dump of every fact. Distinguish view scope from physical graph zoom.
- Label bundled edges/groups as presentation aggregates with their assertion counts. Every
  underlying fact remains inspectable; aggregation must not create an unrecorded relationship.
- Make omitted pages, export limits, unknown ownership, unreviewed assertions, stale snapshots,
  and missing evidence visible. Empty results are not proof of no dependency.

## Small implementation increments

| Item | Deliverable | Completion evidence |
| --- | --- | --- |
| V0 — Diagnosis and library prototype | Public reproduction of the current navigation/data limits; compare a few established libraries and demonstrate scoped drag/pan/zoom with real evidence | Inspect intent at snapshot/query/export/render boundaries; record the unreproduced private case honestly. Exercise a browser prototype, licensing, offline assets and package size. |
| V1 — Shared query contract and index | Intent/source discovery, search, neighborhoods, paths, fact details, coverage and gaps over one pinned saved snapshot; reusable immutable index | Equivalence with existing graph facts and CLI/MCP queries, stable IDs/cursors/provenance, mixed authority, negative/empty cases and no saved-byte changes. Benchmark first-load and repeated-query cost before selecting a database. |
| V2 — Explorer application | Modular app using the selected graph library and shared data contract, with the interactions above | Real browser checks for starting at intent, following business/async/code relationships, returning to prior scope, drag/pan/zoom, readable edge selection, keyboard use and structured evidence. Do not substitute markup snapshots for interaction tests. |
| V3 — Both delivery modes | Local read-only HTTP service and indexed portable export bundle using the same app | The same selection yields the same assertion IDs, citations and authority through both loaders. Support static CI hosting; expose export coverage and unsupported/offline operations explicitly. Avoid a single huge JSON/string or full-graph render. Retain existing HTML/DOT/SVG compatibility during migration. |
| V4 — Packaging and deployable service | Fresh npm consumer support, versioned assets, documented Docker service with persistent storage and explicit authentication boundary | Fresh install/build/export/serve smoke; no CDN requirement; license inventory; no model/Docker ontology dependency for saved queries; Docker readiness and read-only evidence tests. Review configuration before any shared-host deployment. |
| V5 — Consumer acceptance | Bounded real-project viewer evaluation before moving into 2.0 | Verify the reported intent visibility, readable navigation and actual relationship retrieval on the consumer's saved graph. Retain latency/memory/coverage evidence and browser results without exporting private source or graph payloads publicly. |

V1 does not change the impact-ranking acceptance denominator. It provides explicit browsing
queries instead of treating an impact result as an exhaustive graph overview. Retain the
existing direct-path result, strict validation, snapshot/cache compatibility and the
[accepted private two-assertion replay](assessments/consumer-pm-0.8.1-2026-11-08.json).
Missing relationships remain gaps; do not manufacture calls or intent links.

The first V1 increment implements snapshot-wide intent/other-evidence catalogs, literal search,
exact assertion detail, snapshot counts, and a shared revision-aware index for discovery,
neighborhoods and paths. Both CLI and MCP expose the new queries. The V2 application now provides local HTTP access, intent-first Cytoscape navigation and
structured diagnostic/assertion drill-down. Public real-browser interaction checks are distinct
from private consumer acceptance. The portable loader supports complete selected neighborhoods and explicit frontier boundaries.
Hosted deployment and private acceptance remain subsequent work;
do not mark V0–V5 complete from query or public browser tests alone.

## Graph library evaluation

Candidate metadata checked against npm on 2026-11-05:

| Candidate | Version / license | Evaluation question |
| --- | --- | --- |
| [Cytoscape.js](https://js.cytoscape.org/) | 3.34.4 / MIT | Leading candidate for graph exploration, layouts, compound scopes and progressive expansion without committing the app to an editor workflow. Validate actual interactions and bundling. |
| [React Flow](https://reactflow.dev/) | @xyflow/react 12.12.1 / MIT | Useful if rich custom node components and a broader React application outweigh additional layout/state integration. Evaluate rather than assume an editor is the required product. |
| [Sigma.js](https://www.sigmajs.org/) | 4.0.4 / MIT | Evaluate if large visible-network rendering proves necessary. A large-canvas benchmark alone does not satisfy intent navigation or structured evidence inspection. |

Selected **Cytoscape.js 3.34.4**, after a real sandboxed-browser prototype exercised scoped
drag/pan/zoom and navigation. The app uses modular TypeScript without requiring a frontend
framework, bundles the MIT library and license, and needs no runtime CDN. React Flow and Sigma
were metadata/design comparisons, not implemented benchmark competitors. Positions are restored
in session history; persistent per-user layouts remain future work.

## Recommended viewer direction

Keep Cytoscape.js for the evidence explorer. Offer Intent and Code as two starting points on the same pinned snapshot. When a user follows a rule to a method, retain the breadcrumb and show the method's callers, callees, references and linked intent. Label the selected path and immediate neighbors without requiring hover. A file-level binding should open the file. Preserve the distinction between an export boundary and a missing binding in the saved snapshot.

Prototype Sigma.js for an optional **Repository map** after focused navigation works. Label domains and services at the overview scale. Selecting a cluster narrows the map; selecting a concrete node opens its exact neighborhood in Cytoscape. Both renderers should share snapshot and node identities, citations, navigation history and report boundaries. Evaluate the prototype by having a user find a downstream service, open its implementation, inspect the supporting evidence and return to the same map position.

Start ontology exploration with a **Graph vocabulary** view in Cytoscape. Show the meaning and direction of each predicate alongside a cited instance from the selected snapshot when available. Revisit Reactodia if authoring RDF or editing ontologies becomes a product requirement. These renderer choices are recommendations; the Sigma prototype is independent of the [1.0 retrieval item](1.0-WORK-QUEUE.md).

### Focused viewer release

Refine the existing Cytoscape application in the second minor release. Keep the current renderer and query interfaces. Give search a plain-language label and examples drawn from included nodes. Make the selected method, the breadcrumb back to intent and the direction of the highlighted relationship readable at a glance. Group the inspector by callers, callees, linked intent and tests, with citations available beside the relationship they support. Use the existing stylesheet to improve spacing, typography, contrast and keyboard focus for these controls.

Verify the journey in a browser with a saved public fixture: find a rule by a recognizable word, open its implementing method, inspect a caller and its citation, then go back to the rule with the prior layout restored. Exercise it in the full local explorer and a portable report containing those neighborhoods. In a shallower export, the frontier should explain which neighborhood is outside the report. The subsequent 1.0 milestone covers the Sigma overview and read-only vocabulary viewer. Ontology authoring remains a separate decision.

## Focused portable-report boundary

The maintainer selected focused portable reports, not an automatic copy of the entire graph.
Export explicit root node IDs and a bounded expansion depth. A fully included node must retain
all incident assertions; endpoint-only frontier nodes must state that their neighborhoods are
outside the report. Exceeding fact/node/byte limits fails the export rather than silently dropping
relationships. A separate report identity records the selection without rewriting the original
snapshot identity, citations or authority.

Use the same application with a static data loader, package all browser assets, and keep
supported query results equivalent to the local service. Search is report-scoped; unsupported
operations must be explicit. Chunk data rather than constructing a graph-sized string. Exports
are read-only evidence artifacts suitable for reviewed static CI hosting, with no automatic upload.
V3 implements this boundary through `viewer export` and the same application with a static
loader. Public parity and browser tests cover retained assertion IDs, citations, authority,
coverage, diagnostics, pagination and frontier errors; full-snapshot path search stays local.
See [portable report usage and limits](PORTABLE-EXPLORER.md).

## Hosting and 2.0 boundaries

The application should live-query the same evidence service as agents. HTTP and MCP are access
layers over shared semantics; current local stdio MCP remains supported. A portable loader
answers the same supported read contract from exported indexed data and states its limits.

Initially preserve immutable snapshots/artifacts in a persistent volume; object storage is a
natural hosted extension. The optional 1.0 PostgreSQL adapter serves immutable snapshots and metadata. A separate schema can support
2.0 proposal/review/publication records. Redis is optional for later jobs/coordination. Vector
search is a separate future capability, not a replacement for graph edges or provenance. No
MySQL/MongoDB/RDF-database migration is selected merely because a service is available.

The Docker service must be reviewable locally before deployment. Host/SSH connection, routing,
TLS, authentication, per-project access, storage/backups, imports and operating limits still need
concrete configuration. No automatic uploads or public graph hosting are authorized by this plan.

2.0 adds proposal → scoped review decision → source-adapter publication/PR → refreshed snapshot.
The explorer may show those records later, but it must not directly edit compiled facts or grant
source/assertion approval today. Approval, documentation publication, snapshot freshness and
implementation compliance are distinct states. Hosting does not make local operation or
Weftlet-managed AI mandatory. No license or commercial-policy change is selected here.
