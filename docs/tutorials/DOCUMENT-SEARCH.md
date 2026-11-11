# Tutorial: understand and change Document Search

[Documentation home](../README.md) · [Project guide](../guides/PROJECT-GUIDE.md)

Use the packaged `examples/generic-typescript` project in a new disposable Git
repository. It has one product document, a search service, a repository interface
and a test. You will preview selected inputs, build evidence, inspect intent/code
links, connect an agent and verify a small change.

Node 24+, npm and Git are required. The semantic branch needs a supported model
provider and explicitly approved model work. Output assertions vary with the
model: the tutorial does not promise a fixed fact count or automatic function-level
rule mapping.

## 1. Create the independent project

In a new empty directory:

```sh
npm init -y
npm install --save-dev @weftlet/toolkit
```

Copy the public example without copying Weftlet's Git history:

```sh
node --input-type=module -e "import {cpSync} from 'node:fs'; cpSync('node_modules/@weftlet/toolkit/examples/generic-typescript', 'search-demo', {recursive:true});"
cd search-demo
npm install --save-dev @weftlet/toolkit typescript@5.5.4 vitest@3.2.4
```

The second install makes `search-demo` self-contained, with its own lockfile and
CLI. Inspect `docs/search-capability.md`, `src/search.ts` and `test/search.test.ts`.
The code trims a query then delegates to `DocumentRepository.search`. The owner
text declares a capability, query service, repository/search contracts and test
evidence. It does not specify every edge case of trimming.

`docs/` is this demo's layout, not a required Weftlet convention. In a real
project, select existing specifications wherever they live. The [source guide](../guides/PROJECT-GUIDE.md#what-counts-as-a-source-today)
explains supported inputs, what intent documents represent and planned external
connectors. The demo's explicit graph IDs are illustrative, not a required authoring schema.

The included config already selects `docs`, `src` and `test`, declares the public
owner document and uses RDF. Do not run `init` over it. This tutorial treats that
public document as the example's declared source; do not copy its approval policy
into your own product without review.

```sh
node -e "require('node:fs').writeFileSync('.gitignore', 'node_modules/\n.context-graph/\nweftlet-*.json\n');"
git init
npx weftlet config validate
```

Commit the example and lockfile using your normal Git identity. Then run
`npx vitest run` to check the original example.

## 2. Choose the model or take a code-only first pass

The example defaults to Codex / ChatGPT login. Install/login to Codex through its
normal setup, or select a supported provider as described in
[provider instructions](../PROVIDERS.md). Claude/OpenCode extraction requires the
0.10 candidate until it is published; a Claude/OpenCode MCP client can query the
released graph independently of how it was extracted.

For a no-model first pass, edit `semanticSources` to `[]` before committing.
Hydration will index real code and deterministic evidence with no selected prose
extraction. Expect no semantic product-intent assertions; this is not completion
of the intent-to-code portion. Restore `semanticSources: ["docs"]`, commit and
approve semantic work when ready to continue that branch.

## 3. Preview and hydrate

After committing the selected configuration:

```sh
npx weftlet doctor
npx weftlet hydrate --plan --ref HEAD --json
```

With prose enabled, expect the selected `docs/search-capability.md` and its byte
budget/cache status. On a fresh project its semantic artifact should be a miss.
With prose disabled, expect zero selected semantic documents. Review the plan;
only then explicitly authorize/run the model-backed build:

```sh
npx weftlet hydrate --ref HEAD > weftlet-first.json
```

Record the exact `snapshotId` from that receipt as `SNAPSHOT_ID` in the commands
below. The graph must publish only after strict validation succeeds.

## 4. Inspect intent and code together

```sh
npx weftlet graph catalog --snapshot SNAPSHOT_ID --view intent --max-nodes 20 --json
npx weftlet impact scan --snapshot SNAPSHOT_ID --owner-doc docs/search-capability.md --changed-file src/search.ts --task "Review query normalization and downstream effects" --max-facts 60 --max-depth 3 --json
npx weftlet graph coverage --snapshot SNAPSHOT_ID --max-items 20 --json
npx weftlet viewer serve --snapshot SNAPSHOT_ID --port 4317
```

In the viewer, start with intent and inspect the owner-cited assertions. Follow
relationships to contracts, implementation and tests. Compare citations with the
actual files. Check which TypeScript files were indexed. Semantic IDs such as
`component:query-service` are business concepts, not guaranteed exact code-symbol
bindings. If no explicit binding exists, keep that gap visible rather than
assuming it refers to a particular method.

For focused CLI exploration, take an exact node ID returned by the catalog:

```sh
npx weftlet graph neighbors --snapshot SNAPSHOT_ID --node EXACT_NODE_ID --direction both --max-facts 30 --json
```

Use exact assertion IDs with `graph fact`. For a portable report, run `viewer
export --snapshot SNAPSHOT_ID --node EXACT_NODE_ID --output ./search-report`.
Open it using the [portable hosting instructions](../PORTABLE-EXPLORER.md), not
an assumed `file://` browser flow. It covers the exported neighborhood, not the
entire saved graph.

## 5. Connect an agent

Follow [agent setup](../guides/AGENTS.md) inside `search-demo`. Use its absolute
config and installed MCP entry. Copy the packaged skill to your client's project
skill directory. Reconnect and confirm the advertised tools.

With the unreleased 0.10 candidate installed, replace those manual steps with
[automatic project setup](../guides/MCP-SETUP.md):

```sh
npx weftlet setup --client codex --mcp --dry-run
npx weftlet setup --client codex --mcp --apply --expect-plan <plan-id> --verify --snapshot <saved-id>
```

Select your development client, use the snapshot ID from hydration, then restart
that client and confirm its tools. The verification probe reads existing evidence;
it makes no model request.

Give the agent this task:

> Use context-graph-development and the saved graph before editing. The owner is
> docs/search-capability.md; the candidate file is src/search.ts. Explain how the
> service delegates to its repository, which tests cover the behavior, and what
> the owner does not specify. Then add a test showing that leading/trailing
> whitespace is removed before delegation. Preserve the service's behavior.

Inspect the actual `impact.scan` call and the cited evidence. The new test checks
implementation behavior; it must not silently become an approved business rule.
If you want trimming to be an approved requirement, update/review the owner
source explicitly as a separate product decision.

## 6. Validate, repeat and assess limits

Run `npx vitest run`, review the diff and commit the change. Then:

```sh
npx weftlet hydrate --plan --ref HEAD --json
npx weftlet hydrate --ref HEAD > weftlet-after.json
npx weftlet invariant check --ref HEAD
```

The unchanged owner document should reuse its compatible semantic artifact even
though code/test assembly reflects the new commit. Repeat hydration without
changes and compare receipt snapshot ID/content digest and extracted/reused counts:

```sh
npx weftlet hydrate --ref HEAD > weftlet-repeat.json
```

The unchanged repeat should extract zero and reuse the selected artifact, with
stable snapshot identity/digest. A code-only run should extract/reuse zero.
Investigate disagreement before accepting the trial; do not edit the cache.
Graph conformance, passing tests and reuse are distinct checks.

Move to [CI and evidence delivery](../guides/CI.md) for a credential-free PR
workflow and opt-in trusted generation. For a richer asynchronous flow, inspect
`examples/pipeline` (discovery → analysis → admission → planning → execution →
outcomes); its broader linkage remains bounded by actual extracted evidence.
