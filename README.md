# Weftlet — Context Graph Toolkit

Weftlet is an open-source context-graph toolkit that helps AI development agents understand
how a local change affects the broader product. It connects approved product intent, shared
contracts, implementing code, downstream consumers, tests and observed runtime evidence.

Agents can query cited evidence and explore dependencies across module and asynchronous
boundaries. See the [roadmap](docs/ROADMAP.md) and [validation](docs/VALIDATION.md) for
supported capabilities and limitations.
For a first real-project evaluation, use the [private consumer trial](docs/CONSUMER-TRIAL.md)
to retain reproducible queries, logs and human-reviewed findings.
Proposed future capabilities are recorded in the [Weftlet 2.0 product plan](docs/WEFTLET-2.0-PLAN.md).

## Set up a project

<!-- weftlet:release:start -->
Package versions in this checkout/archive: `@weftlet/toolkit@0.5.0` and `@weftlet/core@0.5.0`.
<!-- weftlet:release:end -->

Weftlet uses `@weftlet/toolkit`; its neutral `@weftlet/core` dependency is installed
automatically. Both packages are available on npm.
See [release status](docs/RELEASING.md). Existing Tently users should follow
the [migration guide](docs/MIGRATING-TO-WEFTLET.md).

From your TypeScript project's directory (Node 24+):

```sh
npx @weftlet/toolkit init
npx @weftlet/toolkit config validate
npx @weftlet/toolkit doctor
```

`init` asks for the repository ID, code roots, selected document paths and model, then writes
`context-graph.config.json` and adds `.context-graph/` to `.gitignore`. It fills in the internal
version fields, requires no Git commit or Codex login to run, and refuses to overwrite existing
configuration. Setup makes no model requests. For automation:

```sh
npx @weftlet/toolkit init --yes --repository-id your-org/your-project --code-root src --semantic-source docs/product --evidence-root tests
```

Source flags may be repeated. Without `--semantic-source`, non-interactive setup selects no
documents. Owner-approved sources always start empty; explicitly review and set
`approvedIntentSources` in the JSON file. Select contracts using `contractPatterns`.
Use `--config .config/context-graph.json` for another configuration location,
`--directory /path/to/project` to initialize another project, or `--no-gitignore` to leave
ignore rules alone. Configuration remains JSON; `config show` displays the validated settings.

Review the selected sources, configure Codex authentication when using semantic documents,
and commit the inputs you want indexed before hydrating:

In Weftlet, `semantic.auth.mode` defaults to `chatgpt`, using your existing Codex
ChatGPT login. API billing requires explicitly selecting `api-key`; credentials stay in an
environment variable. See [authentication configuration](docs/PROVIDERS.md#codex-authentication)
for both modes and their tentative validation status. The earlier `@launch-echo/tently@0.1.0` release predates this option.

```sh
npx @weftlet/toolkit hydrate --ref HEAD
npx @weftlet/toolkit impact scan --changed-file src/search.ts --json
```

Hydration with selected documents may incur model charges. Saved queries do not call a model.
Docker is optional for openCAESAR; the default RDF backend needs no Docker.
For a project-local dependency, install `npm install --save-dev @weftlet/toolkit` and use
`npx weftlet` or the compatible `npx context-graph` alias. MCP clients can launch
`npx --yes --package @weftlet/toolkit weftlet-mcp` with `CONTEXT_GRAPH_CONFIG` set to
the project's absolute configuration path. Pin a reviewed version for reproducible agent setup.

Linux/WSL is the validated full-suite path. Native Windows has a recorded live Codex pass;
the archive-byte, snapshot replacement and MCP startup regression suite also passes hosted
Windows CI. Full native Windows release preparation remains separately unvalidated.
See the [validation record](docs/VALIDATION.md).

## Preview hydration before model work

`hydrate --plan` requires toolkit **0.3.0 or newer**. Releases through 0.2.1 do not support
this flag. With a supporting version installed, inspect a project's committed inputs:

```sh
pnpm exec weftlet hydrate --plan --config /path/to/project/context-graph.config.json --ref HEAD
pnpm exec weftlet hydrate --plan --json --config /path/to/project/context-graph.config.json --ref HEAD
```

The human summary and JSON identify the resolved commit, current local configuration, selected
documents and inclusion reasons, UTF-8 byte sizes, source approval, expected cache reuse and
extraction counts, budget violations, and working changes excluded from the committed input.
Selection uses configured repository file/directory paths; `approvedIntentSources` uses its
separate glob matcher. An explicit empty semantic source list selects no documents, fixing the
earlier accidental expansion to the whole repository.

Planning reads Git objects and existing artifacts without loading a model provider or repository
adapter, indexing code, collecting runtime evidence, validating the graph or writing snapshots.
It does not check credentials or estimate tokens or dollars. Cache hits depend on unchanged
inputs; corrupt or unreadable entries are reported separately from misses. `--force-semantic`
shows planned re-extraction without allocating or writing a forced revision.

A plan exits 0 when its source/cache/budget checks are ready. It exits 1 with the full plan when
errors block those checks or incomplete selection needs review. Missing/no-document selectors
and existing agent-selection limits are warnings; they do not add a new hydration gate that
would prevent removing the last document and invalidating its relationships. All selected
documents remain visible when budgets are exceeded.

Source approval does not approve model assertions. Validation-document labels reflect configured
evidence roots; selected validation documents still undergo semantic extraction today.
Traversal-driven hydration and default validation-document separation remain T07 work; the
prospective coverage preview below is separate. See
[ADR 016](docs/ADR-016-hydration-preview.md) and the [1.0 task list](docs/RELEASE-1.0-PLAN.md).

Starting with **0.4.0**, preview also maps opaque diagnostic source IDs to local paths. Semantic
failures report completed/remaining work and recovery guidance; `hydrate --json --quiet` emits
their structured report on stderr. Built-in Codex can reuse completed artifacts after supported
operational changes such as increasing a timeout. See [provider recovery](docs/PROVIDERS.md#limits-and-reuse)
for preview, retry and explicit legacy-cache adoption instructions.

## Preview linked document coverage

This checkout/archive includes a separate prospective preview. npm 0.5.0 does not include this command:

```sh
pnpm exec weftlet documents plan --entry docs/sot.md --entry docs/roadmap.md --root docs --ref HEAD
pnpm exec weftlet documents plan --entry docs/sot.md --root docs --ref HEAD --json
```

Use your repository's exact committed entry paths. `--root` may repeat and defaults to the
repository root. The operation follows supported Markdown links with cycle protection and
deduplication, records citations and exclusions, and reports missing/ambiguous targets. Paths,
approval matches and validation-evidence labels remain explicit; following a link never approves
its contents. Git objects supply the input even while the checkout is dirty.

This reports prospective coverage and **does not change hydration inputs or estimate cache/model
work**. Continue using `hydrate --plan` for the current execution plan. No config fields are added.
Existing semantic document/byte budgets are compared after traversal, including validation
documents. Independent read limits (`--max-read-documents`, `--max-read-bytes`,
`--max-document-bytes`) leave an explicit unread frontier if reached. Incomplete coverage or
exceeded extraction budgets return a report with exit status 1, without model calls or graph writes.
The preview follows only supported local links; complete coverage is not a claim of complete
product knowledge. See [ADR 023](docs/ADR-023-document-coverage-preview.md) for limits and the
remaining hydration work.

The preview also accepts an optional JSON source policy:

```sh
pnpm exec weftlet documents plan --entry docs/sot.md --root docs --document-policy document-policy.json --json
```

```json
{
  "schemaVersion": 1,
  "roles": [
    { "id": "intent", "pattern": "docs/sot.md", "role": "intent" },
    { "id": "plans", "pattern": "docs/plans/**", "role": "plan" },
    { "id": "checks", "pattern": "docs/validation/**", "role": "validation" }
  ],
  "owners": [
    { "id": "sot-owner", "pattern": "docs/**", "ownerDocument": "docs/sot.md" }
  ]
}
```

Roles are `intent`, `plan`, `validation` or `reference`; unmatched sources are `unclassified`
unless configured evidence roots or approved intent sources provide a default. The owner must
be read within the selected coverage, match `approvedIntentSources`, and have an unambiguous
intent role. Owner mappings and links never transfer approval to another source or approve an
assertion. Conflicting mappings remain explicit gaps.

This file is an operation input, separate from `context-graph.config.json`. `ready` and the
exit status still describe traversal and budget checks; inspect `classification.complete` and
its issues for role/ownership gaps. The policy does not change current hydration or cache inputs.
The public `extractDocumentEvidence` API separately emits cited document-presence and reference
facts, including empty validation documents, without interpreting prose or treating a written
“PASS” as proof that a test ran. Queries, RDF/SHACL and the viewer preserve its source metadata.
Connecting these APIs to hydration is the next increment. See
[ADR 025](docs/ADR-025-document-classification.md) for the contract and limits.

## SHACL validation and performance

Starting with **0.5.0**, identity preflight runs before ontology/RDF work.
`hydrate --json --quiet` reports conflicts using opaque references; `--validation-details` explicitly
includes local identities, producer versions and citations. Validation emits phase-boundary times
and graph counts, without a percentage or live heartbeat. Full SHACL remains required after a
passing preflight. See [ADR 021](docs/ADR-021-identity-preflight-and-validation-timing.md).

Version 0.5.0 also accepts `semantic.timeoutMs: 600000` for an approved ten-minute extraction
attempt; the default remains two minutes. See [provider limits and reuse](docs/PROVIDERS.md#limits-and-reuse)
before retrying with compatible cached artifacts.

Starting with 0.3.0, the toolkit indexes a temporary union to accelerate cold validation.
The toolkit uses JavaScript `rdf-validate-shacl` and an in-memory
N3 store. Each hydration validates the complete graph; semantic artifact reuse does not make
validation incremental, and there is no validation-result cache, Rust engine or GraphDB service.
Saved queries do not rerun SHACL.

The current shapes use subject/predicate/object values independently of graph names. Validation
now builds one temporary union graph so repeated property lookups avoid scanning every named
assertion graph. The same shapes and validator run against that union. The original named dataset,
assertion records and provenance remain the source for SPARQL, queries and serialization.

In bounded, single-run public experiments, 2,000 facts with unique subject/object nodes took
31.50 seconds in the original SHACL path, compared with 0.153 seconds to build the union and
0.467 seconds for SHACL on that union. A 10,000-fact union case used about 1.3 GiB process RSS;
the extra projection has a memory cost. These measurements do not reproduce the private consumer's
full generation run or guarantee a production duration. See [ADR 017](docs/ADR-017-shacl-validation-union.md)
for methodology, parity boundaries and remaining work. To run the bounded public benchmark from
a development checkout:

```sh
pnpm build
pnpm benchmark:shacl
```

Current hydration progress reports phase boundaries. The validator performs synchronous work,
so an ordinary timer cannot provide an honest heartbeat while that work blocks Node's main
thread. Worker-based progress, validation-result reuse and incremental
validation remain separate T05 work; they do not delay the focused cold-validation release.

## Development

The development source is organized by responsibility; see
[toolkit modules and boundaries](docs/ADR-007-toolkit-modules.md). The two npm packages and
their public library entry points retain the same API under the new package names.
The module refactor was not part of the earlier Tently 0.1.0 release.

The toolkit requires Node.js 24 or newer; Node 24 is the validated runtime.
Use pnpm 10.18.2 for development. The neutral core package has no toolkit runtime dependencies
and retains its separate Node.js 20.11+ declaration.

```sh
git clone https://github.com/jchewitt/weftlet.git
cd weftlet
nvm install
nvm use
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm context-graph:publication-check
```

The `.nvmrc` selects Node 24. If you do not use nvm, install Node 24 through your usual
version manager. The project rejects unsupported Node versions during installation, and
CLI/MCP startup reports a version error before loading runtime dependencies.

The publication check packs and installs into a disposable consumer, indexes actual TypeScript
and exercises the installed toolkit. It does not publish. Core and toolkit retain separate
package boundaries; no product adapter is required.

## Independent repository

Copy `examples/generic-typescript` into a separate repository, or adapt its
`context-graph.config.json` beside your own sources. Paths resolve relative to that configuration.
Configure semantic source selection, TypeScript roots/indexer arguments, contract aliases,
evidence roots, runtime evidence, storage and optional adapter explicitly.
For tests excluded by the build config or workspace packages whose outputs are absent from
committed archives, configure an [explicit TypeScript source project](docs/ADR-010-committed-source-indexing.md)
with selected files and local package aliases.

Repository adapters using **0.4.0 or newer** should import `repositoryFileNode` from
`@weftlet/core` for physical-file nodes. It preserves canonical document IDs, spec/test Evidence
and production Component kinds, including test files containing mocked calls or decorators.
Keep business-concept nodes separate; see the [core API example](packages/core/README.md) and
[producer decision](docs/ADR-020-canonical-physical-file-producers.md). After upgrading, rebuild
the graph with compatible cached artifacts; historical snapshots remain queryable but cannot
satisfy current validation with old extraction versions. Consumer-owned adapters must be migrated
as well; the toolkit cannot correct nodes they still classify independently.

In a selected document such as `docs/intent.md`, link a responsibility to its sources:

```md
Committed snapshots stay queryable during edits. See [snapshot storage](../src/storage.ts)
and [lifecycle checks](../tests/storage.test.ts).
```

[Explicit document links](docs/ADR-011-explicit-document-links.md) resolve against the recorded
commit and retain source-line citations. Missing files produce diagnostics; directory mentions
are not expanded. A reference does not approve intent or establish that a linked test passed.

For a consumer that shares no typed symbol with its producer, opt into
[explicit routing declarations](docs/ADR-014-routing-declarations.md) using `routingSources`.
Each committed JSON record names a scoped binding and exact producer/consumer files. These
are cited candidate dependencies; they do not assert an approved policy or observed delivery.

Install the locally packed core and toolkit tarballs together. The installed commands are
`weftlet`, `weftlet-mcp`, and the compatible `context-graph` / `context-graph-mcp` aliases.
Use the [versioned installation examples](docs/RELEASING.md#inspecting-and-consuming-releases)
generated for this checkout/archive; then run `npx weftlet init`.

Pass `--config /absolute/path/context-graph.config.json`
to the CLI or set `CONTEXT_GRAPH_CONFIG` for MCP. No launcher rebuild is required for installed
packages. `node mcp-launcher.mjs` is for development in this repository.

```sh
context-graph hydrate --config context-graph.config.json --ref HEAD
context-graph impact scan --config context-graph.config.json --capability search --json
context-graph visualize --config context-graph.config.json --capability search --output graph.html
```

Semantic hydration requires a working configured provider. Direct RDF is the default;
Docker/openCAESAR is an optional explicit backend. Run `context-graph doctor` for setup diagnostics.
Committed indexing and ontology input use disposable archives, preserving the active checkout.
Saved-snapshot queries do not invoke either dependency or refresh automatically. Responses report
commit, configuration, source scope and excluded working changes. Use `hydrate` explicitly to
refresh evidence; `--snapshot` selects historical evidence. Working-change overlays are a separate
operation. `context-graph overlay --base-snapshot <id> --agent <name>` captures a bounded draft
implementation overlay; query its returned ID with `--snapshot`. Changed prose is invalidated
pending re-extraction. Queries compare captured file digests with current working bytes and
report subsequent edits separately from captured and excluded changes. Older overlays without
capture metadata have unknown freshness. Historical or draft evidence cannot validate a current diff.

Impact queries [rank nearby consumers and varied evidence sources](docs/ADR-012-impact-ranking.md)
ahead of repeated detail and shared-import context. Ranking changes ordering, not saved facts or
the reachable scope. Responses identify the ranking version; after a ranking upgrade, restart
scans whose old continuation tokens are rejected. No snapshot refresh is needed for new ordering.

This source includes a [coverage reporting correction](docs/ADR-024-implementation-coverage.md)
for the next release: code relationships displayed under contracts also count as implementation
evidence. New reports identify `coverage.scope: "returned-page"` and `countsAreNonExclusive: true`.
Counts can overlap and describe returned evidence; they are not completeness percentages or proof
that behavior is correct. Document/model claims and test-only evidence do not establish production
implementation. The reporting fix works with saved snapshots without another hydration.

[Relative import evidence](docs/ADR-013-relative-module-requests.md) now scopes module requests
to the importing directory. An explicit refresh applies this extraction fix; saved snapshots
keep their original facts. These requests remain unresolved evidence, while SCIP supplies
typed-symbol links. Matching queue topic strings alone does not establish a downstream route.

## Evidence limits

Approved owner documents govern intent. Code describes implementation; tests describe what
was checked; traces describe observed behavior for their deployment. Model assertions require
valid citations and remain inferred/unreviewed even when their source is explicitly approved.
Source approval is recorded separately from assertion review. Missing coverage is not a pass.

The current implementation supports TypeScript SCIP indexing, immutable JSON snapshot envelopes,
a lossless RDF/SPARQL query path, SHACL integrity checks, paginated `impact.scan` traversal and
HTML/DOT/SVG output. Active OWL reasoning and a complete interactive explorer are not claimed.
See `examples/pipeline` for a six-stage asynchronous flow and `docs/ADR-004-rdf-query-path.md`
for query bounds and authority configuration.

Never submit credentials, account data or private runtime payloads as semantic sources.
Live provider tests are separate from deterministic CI. The maintainer authorized the GitHub
export and migration from the published `@launch-echo` names to `@weftlet`. Registry publication requires
an authorized npm identity. Repository visibility changes require separate authorization.

For changes that should ship, run `pnpm changeset` and commit the generated release note.
The bot prepares a version PR; merging it publishes those committed versions and records release
tags. See [npm release instructions](docs/RELEASING.md) for checks, trust settings and recovery.

See [provider contract](docs/PROVIDERS.md) for bounded extraction and adapters, and
[architecture policy](docs/architecture-policy.md) for deterministic governance.

See the [bounded viewer guide](docs/VIEWER.md) and [cloud setup](docs/CLOUD-ENVIRONMENT.md).

For development, `pnpm evaluate:impact` measures bounded candidate-file retrieval on Weftlet's
own committed source without model calls. See the [evaluation protocol and baseline](docs/IMPACT-EVALUATION.md)
for observed gaps and the distinction between retrieval measurements and live semantic quality.

## License and provenance

Apache-2.0. See [LICENSE](LICENSE), [NOTICE](NOTICE), and the
[source inventory](docs/SOURCE-INVENTORY.md) for attribution and extraction history.
