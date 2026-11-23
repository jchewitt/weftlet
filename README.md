# Weftlet — Context Graph Toolkit

**[Documentation](https://weftlet.crowdpigeon.org/) · [Get started](https://weftlet.crowdpigeon.org/get-started/quickstart/) · [Tutorial](https://weftlet.crowdpigeon.org/tutorial/) · [API reference](https://weftlet.crowdpigeon.org/api/) · [Changelog](CHANGELOG.md)**

Weftlet helps AI development agents connect **why your product works a certain
way** with **the code, contracts and downstream consumers affected by a change**.
It combines product documents and TypeScript code relationships into a cited graph
that agents can query through MCP and developers can explore in the browser.

If you plan features with Codex or Claude and keep the resulting requirements in
Markdown, Weftlet makes that intent available across later development sessions.
It also works with existing specifications, owner documents and repository READMEs.
You choose which documents govern the product through configuration.

- **Trace impact:** follow intent, shared contracts, implementations, tests and
  documented dependencies across features, services and asynchronous boundaries.
- **Give agents useful context:** install project skills and register MCP for
  Codex, Claude Code or OpenCode.
- **Explore saved evidence:** start from product intent, drill into relationships,
  inspect citations, or export a focused portable report.
- **Keep evidence accountable:** sources, assertion review, commit identity,
  coverage and freshness remain visible in query results.

## Get started

Use **Node.js 24+** in an existing Git repository. Install the toolkit locally so
its CLI and generated MCP launchers use the project's dependency:

```sh
npm install --save-dev @weftlet/toolkit
npx weftlet init
npx weftlet config validate
npx weftlet doctor
```

<!-- weftlet:release:start -->
Package versions in this checkout/archive: `@weftlet/toolkit@0.15.0` and `@weftlet/core@0.15.0`.
<!-- weftlet:release:end -->

`init` creates `context-graph.config.json`, offers source/provider/client choices,
installs the selected project skills and adds graph output to `.gitignore`.
It preserves existing configuration. Setup itself makes no model request.
`@weftlet/core` is installed automatically as the toolkit's dependency.

Choose **Codex, Claude Code or OpenCode** for semantic extraction; using Claude or
OpenCode does not require Codex. Configure the chosen provider's authentication
using the [provider guide](docs/PROVIDERS.md). Your development client and extraction
provider can differ.

### Select your sources

In the generated JSON configuration, `semanticSources` selects committed product
documents and `approvedIntentSources` identifies your authoritative files or glob
patterns. Existing approved plans can be designated in bulk; no per-document
acceptance ceremony is required. The source remains authoritative even when an
extracted interpretation is labeled inferred/unreviewed.

Documents can live anywhere in the repository. Built-in prose extraction reads
`.md`, `.mdx` and `.txt`; code indexing supports TypeScript. Code-only projects can
start with code evidence. Figma, Trello and GitHub Projects connectors are planned;
custom repository fact/check adapters are already supported. See the
[full project guide](docs/guides/PROJECT-GUIDE.md) for configuration and source roles.

Commit the inputs you want indexed, then inspect the no-model preview before
building a snapshot:

```sh
npx weftlet hydrate --plan --ref HEAD
npx weftlet hydrate --ref HEAD
```

Hydration with selected semantic documents uses your configured model and may incur
provider charges. The default RDF backend runs without Docker. Subsequent saved
queries need no model call or rebuild:

```sh
# Replace src/search.ts with a file from your project.
npx weftlet impact scan --changed-file src/search.ts --json
```

### Connect your agent

Preview project MCP registration, then apply the reviewed plan. Replace `<plan-id>`
with the ID returned by the preview; use `claude` or `opencode` instead of `codex`
for another client:

```sh
npx weftlet setup --client codex --mcp --dry-run
npx weftlet setup --client codex --mcp --apply --expect-plan "<plan-id>" --verify
```

Restart your client and complete its normal project/server trust prompts. Ask the
agent to use `impact.scan` before a change, follow relevant relationships and check
cited intent, coverage and freshness. The installed skill explains that workflow.
See [agent integration](docs/guides/AGENTS.md) for client details and existing setups.

### Browse the graph

Use the snapshot ID returned by hydration:

```sh
npx weftlet viewer serve --snapshot "<snapshot-id>"
```

The local explorer supports intent-first navigation, drag/pan/zoom and cited
relationship drill-down. See the [viewer guide](docs/VIEWER.md) for portable reports.

## Go deeper

The [documentation website](https://weftlet.crowdpigeon.org/) provides the searchable
guide, tutorial and API reference. Detailed Markdown remains in this repository as
source material for documentation updates:

- [End-to-end project guide](docs/guides/PROJECT-GUIDE.md) and [public demo tutorial](docs/tutorials/DOCUMENT-SEARCH.md).
- [Skills and MCP](docs/guides/AGENTS.md), [assisted setup](docs/guides/ASSISTED-SETUP.md), and [GitHub Actions/CI](docs/guides/CI.md).
- [Evidence and authority decisions](docs/guides/EVIDENCE-DECISIONS.md), [snapshot delivery](docs/guides/SNAPSHOT-DELIVERY.md), and [retention reviews](docs/guides/CACHE-RETENTION.md).
- [All repository documentation](docs/README.md), [release history](docs/RELEASES.md), [validation](docs/VALIDATION.md), and [roadmap](docs/ROADMAP.md).

## Contribute

Use Node 24 and pnpm 10.18.2 in a checkout of this repository:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution rules,
[module boundaries](docs/ADR-007-toolkit-modules.md) for the code layout, and
[release instructions](docs/RELEASING.md) for the full packaging check and Changesets.

## License

Apache-2.0. See [LICENSE](LICENSE), [NOTICE](NOTICE) and the
[source inventory](docs/SOURCE-INVENTORY.md) for attribution.
