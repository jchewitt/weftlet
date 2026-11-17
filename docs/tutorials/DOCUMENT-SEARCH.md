# Tutorial: set up, query and change Document Search

[Documentation home](../README.md) · [Project guide](../guides/PROJECT-GUIDE.md) ·
[Qualification record](../ONBOARDING-QUALIFICATION.md)

**This walkthrough covers the 0.10.0 release scope.** Check
[release status](../RELEASES.md) and use the matching verified registry package or
reviewed archives. Existing 0.9 installations can follow
[manual client setup](../guides/AGENTS.md#manual-registration-and-customization);
the automatic setup/delivery steps below require 0.10.0.

You will install Weftlet in a disposable project, connect a development client,
preview and build evidence, make a test change, and deliver the graph to another
checkout. The public demo contains a product document, `SearchService`, a
`DocumentRepository` interface and a test. Node 24+, npm and Git are required.

There are two paths through the same steps:

- **Code-only first pass:** zero model requests. Learn setup, indexing, queries,
  MCP, CI configuration and delivery with missing product intent visible.
- **Intent + code:** select the demo owner document and use your chosen extraction
  provider. Review the no-model preview before authorizing extraction. Model output
  varies; expect cited assertions, not a fixed fact count or guaranteed method binding.

The automated packaged walkthrough follows the first path. Separate deterministic
fixtures exercise semantic extraction contracts and cache reuse; live provider
quality/authentication and actual development-client loading have their own checks.

## 1. Install in a new empty project

Create an empty directory named `search-demo`, open a terminal there, and run:

```sh
npm init -y
```

For a verified registry release containing the 0.10.0 functionality:

```sh
npm install --save-dev @weftlet/toolkit typescript@5.5.4 vitest@3.2.4
```

Core is installed with toolkit; ordinary registry consumers need only toolkit.
For prepublication testing, instead install the reviewed pair from
[release preparation](../RELEASING.md), replacing these paths:

```sh
npm install --save-dev "/path/to/reviewed-core.tgz" "/path/to/reviewed-toolkit.tgz" typescript@5.5.4 vitest@3.2.4
```

Keep your generated lockfile and verify that the installed package version matches
the release or archive pair you selected.

Copy the packaged public example into this empty project, preserving the
package.json that records your installed dependencies:

```sh
node --input-type=module -e "import {cpSync,readdirSync} from 'node:fs'; import {join} from 'node:path'; const example='node_modules/@weftlet/toolkit/examples/generic-typescript'; for (const name of readdirSync(example)) if(name!=='package.json') cpSync(join(example,name),name,{recursive:true,force:false,errorOnExist:true});"
npm pkg set type=module "scripts.test=vitest run" "scripts.typecheck=tsc --noEmit"
node -e "require('node:fs').writeFileSync('.gitignore','node_modules/\n.context-graph/\nweftlet-*.json\n.tutorial-artifacts/\n');"
git init
npx --no-install weftlet config validate
```

This is a new-project copy recipe, not an updater for existing repositories. It
refuses to overwrite example destinations. No Git history is copied. The demo
already includes graph configuration, so use `setup`, not `init`, from here.
An existing real project follows the [project guide](../guides/PROJECT-GUIDE.md).

Read `docs/search-capability.md`, `src/search.ts` and `test/search.test.ts`. The
service trims a query and delegates to its repository. The owner describes the
capability/contracts and test evidence, but does not specify every trimming edge
case. Its explicit concept IDs illustrate the model; ordinary docs need no such
schema or mandatory `docs/` folder. The demo's `types: []` keeps unrelated tooling
ambient declarations out of this standard-library-only TypeScript project; use
the appropriate types for your own application's runtime.

## 2. Select sources and one extraction provider

For the **code-only path**, change `semanticSources` to `[]` in
`context-graph.config.json`. Keep `codeRoots: ["src"]` and `evidenceRoots: ["test"]`.
An approved-source pattern does not select documents by itself, so no semantic
product-intent assertions are expected on this path.

For the **intent + code path**, retain `semanticSources: ["docs"]`. The demo
config designates `docs/search-capability.md` as governing via
`approvedIntentSources`. Review that choice for this example. In your own repo,
select existing governing requirements in bulk through configuration; there is
no separate per-document acceptance screen. See [evidence decisions](../guides/EVIDENCE-DECISIONS.md).

Choose Codex, Claude Code or API-based OpenCode using the
[provider guide](../PROVIDERS.md). Use that provider's normal login/API credentials;
Claude/OpenCode extraction does not require Codex. The development client chosen
next can be different. Setup and saved queries need no model login.

## 3. Install the skill, MCP registration and CI checks

The commands below choose Codex as the **development client**. Substitute
`--client claude` or `--client opencode`, or repeat the flag for multiple clients:

```sh
npx --no-install weftlet setup --client codex --mcp --dry-run --json
npx --no-install weftlet setup --client codex --mcp --apply --expect-plan PLAN_ID --verify --json
```

Replace `PLAN_ID` with `planId` from the preview, keeping the same client/options.
Inspect the skill, launcher and registration paths. Verification starts the
installed MCP server and checks its version/tools. Before hydration, omit
`--snapshot`: you are checking the connection, not claiming evidence exists.
Restart your client, review its project trust prompt, then confirm it discovers
the skill and Weftlet tools. [Agent setup](../guides/AGENTS.md) covers client-side checks.

Scaffold credential-free PR checks before the initial commit:

```sh
npx --no-install weftlet setup ci --checks --test-script test --build-script typecheck --dry-run --json
npx --no-install weftlet setup ci --checks --test-script test --build-script typecheck --apply --expect-plan CI_PLAN_ID --json
```

Use the CI preview's own `planId` for `CI_PLAN_ID`. This adds a standalone workflow
and preserves any existing workflows. It runs configured project tests/type checks
and a no-model hydration plan; it does not build a graph in ordinary PRs.
Trusted model-backed generation and artifact delivery are separate choices in the
[CI guide](../guides/CI-SETUP.md). Setup never dispatches a GitHub workflow.

Commit the example, config, lockfile, skill/launcher/client settings and workflow
using your normal Git identity. Then prove the lockfile reproduces installation:

```sh
npm ci
npm test
npm run typecheck
```

## 4. Preview and build committed evidence

```sh
npx --no-install weftlet hydrate --plan --ref HEAD --json
```

Code-only: expect zero selected semantic documents and zero planned extractions.
Intent + code: expect the owner document, its source authority, byte budget and
cache status. Resolve selection/budget problems before proceeding. Once you have
approved the selected model work (if any):

```sh
npx --no-install weftlet hydrate --ref HEAD --json --quiet > weftlet-first.json
```

Record the receipt's `snapshotId` as `SNAPSHOT_ID` below. Publication follows
identity and strict graph validation. The receipt is metadata, not the graph file.

## 5. Query and inspect the saved graph

```sh
npx --no-install weftlet graph catalog --snapshot SNAPSHOT_ID --view intent --max-nodes 20 --json
npx --no-install weftlet impact scan --snapshot SNAPSHOT_ID --owner-doc docs/search-capability.md --changed-file src/search.ts --task "Review query normalization and downstream effects" --max-facts 60 --max-depth 3 --json
npx --no-install weftlet graph coverage --snapshot SNAPSHOT_ID --max-items 20 --json
npx --no-install weftlet setup --client codex --mcp --verify --snapshot SNAPSHOT_ID --json
npx --no-install weftlet viewer serve --snapshot SNAPSHOT_ID --port 4317
```

Check the snapshot commit, indexed files, citations, authority and truncation.
The code-only path has implementation evidence and an intent gap. On the semantic
path, compare owner-cited assertions against the original text. A business concept
such as `component:query-service` is not automatically an exact method binding.

Open the URL printed by the viewer. Start from an intent or implementation node,
expand its neighborhood and follow relevant contracts/tests. For the same saved
relationships in the CLI:

```sh
npx --no-install weftlet graph neighbors --snapshot SNAPSHOT_ID --node EXACT_NODE_ID --direction both --max-facts 30 --json
```

Use an exact node ID from the catalog/result, and `graph fact` for an exact
assertion ID. Continue bounded queries with identical arguments and the returned
continuation token. For a portable neighborhood report, use `viewer export
--snapshot SNAPSHOT_ID --node EXACT_NODE_ID --output .tutorial-artifacts/report`;
see the [portable report instructions](../PORTABLE-EXPLORER.md) for hosting it.

## 6. Make a small agent-assisted change

Ask your client:

> Use context-graph-development and Weftlet before editing. The owner is
> docs/search-capability.md; the candidate file is src/search.ts. Report the saved
> commit, intent coverage, repository delegation, relevant tests and unresolved
> requirements. Follow relevant exact relationships and read the cited source.
> Add a test that confirms the trimmed query reaches the repository exactly once.
> Preserve service behavior and owner documentation. Do not hydrate or call an
> extraction model without my approval.

The existing test checks a returned trimmed value. This new test inspects the
actual repository argument and invocation count. If you are doing the tutorial
without a development client, append this to `test/search.test.ts` yourself:

```ts
it('passes the trimmed query to the repository exactly once', async () => {
  const calls: string[] = [];
  const service = new SearchService({ search: async query => { calls.push(query); return []; } });
  await service.search('\t context \n');
  expect(calls).toEqual(['context']);
});
```

Inspect the agent's actual `impact.scan`/follow-up tool calls, not just its statement
that it used the graph. In the code-only path it should report absent semantic
intent and read the owner directly. The test documents implementation behavior;
turning trimming into an approved product requirement would require a separate
reviewed owner-source change.

Before committing, query `SNAPSHOT_ID` again. The old graph stays readable and
reports excluded working changes; it cannot validate your draft. Run `npm test`
and `npm run typecheck`, review the diff, then commit.

## 7. Refresh the final commit and check reuse

```sh
npx --no-install weftlet hydrate --plan --ref HEAD --json
npx --no-install weftlet hydrate --ref HEAD --json --quiet > weftlet-after.json
npx --no-install weftlet invariant check --ref HEAD
npx --no-install weftlet hydrate --ref HEAD --json --quiet > weftlet-repeat.json
```

Use the new receipt's snapshot ID for subsequent queries. The unchanged repeat
should retain snapshot ID/content digest and extract zero. Code-only runs also
reuse zero semantic artifacts. On the semantic path, unchanged compatible owner
artifacts should be reused. Investigate unexpected extraction before authorizing
more model work. Strict graph conformance, configured invariant checks, project
tests and human product review answer different questions.

## 8. Deliver the graph to another checkout

Using the final receipt's `snapshotId`:

```sh
npx --no-install weftlet snapshot export --snapshot FINAL_SNAPSHOT_ID --output .tutorial-artifacts/bundle > weftlet-delivery.json
```

The receipt contains `manifestSha256`. Download/copy the bundle through your
trusted private delivery channel, retaining the successful run/commit and hash.
In another checkout of the same committed project, run `npm ci`, then:

```sh
npx --no-install weftlet snapshot import --input /path/to/bundle --expect-digest TRUSTED_MANIFEST_SHA256 --dry-run
npx --no-install weftlet snapshot import --input /path/to/bundle --expect-digest TRUSTED_MANIFEST_SHA256 --activate --expect-head none
npx --no-install weftlet setup --client codex --mcp --verify --snapshot FINAL_SNAPSHOT_ID --json
```

`none` is for a receiving store without a head. For an existing head, inspect it
and use its exact ID; see [snapshot delivery](../guides/SNAPSHOT-DELIVERY.md).
Activation requires compatible config/scope/extractors. Imported historical
evidence retains its original commit and authority. Transfer never extracts
prose or certifies the current diff. Optional semantic artifacts require explicit
`--include-semantic` at both ends and additional source/contract verification.

Reconnect the receiving client and repeat the saved query. CI can use the same
export/import boundary after trusted generation. For an existing project's layout
or workflows, [assisted setup](../guides/ASSISTED-SETUP.md) can propose reviewed
integration changes through your selected provider; its no-model preview is
`weftlet setup assist --input package.json --input docs/search-capability.md --dry-run`.

You now have the complete local development/delivery loop. For broader async and
cross-service examples, explore `examples/pipeline`. Before adopting Weftlet as a
project gate, follow the [consumer acceptance checklist](../CONSUMER-TRIAL.md) and
retain the actual versions, commits, checks and unresolved evidence gaps.
