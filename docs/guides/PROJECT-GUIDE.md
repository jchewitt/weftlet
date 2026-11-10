# Use Weftlet in a project

[Documentation home](../README.md) · [Demo tutorial](../tutorials/DOCUMENT-SEARCH.md) ·
[Agent setup](AGENTS.md) · [CI and evidence delivery](CI.md)

This guide takes an existing TypeScript Git repository from installation to an
agent-assisted change. The released baseline is 0.9.0. The 0.10 development
branch adds Claude/OpenCode extraction; those options are explicitly marked below.
Use a reviewed published version or reviewed release archives, not an assumed
future npm version. See the [release history](../RELEASES.md).

## 1. Understand what you are building

Weftlet builds saved evidence connecting product intent → contracts → code and
consumers → tests and runtime observations. An agent can follow business links
that cross a queue, database or service boundary even when there is no direct
function call. Such links must actually be present in the selected evidence;
Weftlet does not automatically understand every business workflow.

There are two separate activities:

| Activity | What happens | Model required? |
| --- | --- | --- |
| Plan | Inspect committed inputs, coverage, budgets and reusable semantic artifacts | No |
| Hydrate | Extract selected prose, index TypeScript, assemble facts, validate and publish a snapshot | For uncached semantic documents |
| Query / browse | Read an existing snapshot through CLI, MCP or the viewer | No |
| Develop | An agent combines cited graph evidence with direct source reads and tests | Your development agent |

Approved documents express declared intent. Extracted assertions remain
inferred/unreviewed unless independently reviewed. Code is implementation; tests
show what was checked; runtime traces show observed behavior. A static reference
or path is not proof of execution. A graph cannot fill undocumented intent with
approved assumptions. Code-derived drafts and approval/backfill are future
[2.0 work](../WEFTLET-2.0-PLAN.md).

### What counts as a source today

“Evidence” is the umbrella term for these distinct inputs:

| Input | Current built-in behavior |
| --- | --- |
| Product/architecture prose | Model extraction from selected committed `.md`, `.mdx`, `.txt` files, with source-line citations and validated structured assertions |
| Document links/declarations | Deterministic links and supported declarations; opt-in Markdown traversal follows configured entry points |
| Code | TypeScript SCIP indexing plus deterministic file, symbol, reference and supported static-call extraction |
| Shared contracts | Configured repository contract extraction and consumer relationships |
| Tests/validation | Test-file/code relationships and selected validation records; indexing does not execute tests or prove a passing result |
| Runtime | Explicitly supplied supported OTLP JSON trace evidence with configured mappings/eligibility; no automatic production observation |
| Repository extensions | Trusted `adapter` modules contributing fact extractors and invariant evaluators |

The built-in semantic source reader reads Git bytes at the requested commit,
not a live website, Figma canvas, ticket API, PDF, Word document or agent chat.
MDX is read as text, not executed. Direct `semanticSources` selection accepts
repository file/directory paths, not a universal URL or connector specification.
For example, an existing `PRODUCT.md`, `specs/search.md` or
`planning/approved-rules.txt` can be selected; no `docs/` directory is required:

```json
{
  "semanticSources": ["PRODUCT.md", "specs/search.md", "planning/approved-rules.txt"],
  "approvedIntentSources": ["specs/search.md"]
}
```

This is a partial configuration fragment, not a complete config. Use your real
paths and approve only reviewed owner sources. Selection means “read this”; it
does not mean “this is authoritative.” Source approval does not independently
approve each extracted assertion.

### What should product documents say?

Use existing human-readable source-of-truth material. No special prose template
or graph vocabulary is mandatory. Useful documents explain:

- The feature's purpose, scope and responsible owner.
- Required behavior, business rules, constraints, exceptions and terms.
- Shared contracts and dependencies on other domains/services, including queues,
  events, stored data and downstream consumers.
- Which rules are current, proposed, superseded or unresolved, with links to the
  governing owner document and relevant validation records.

For example, a reviewed requirement might state: “Only published documents may
enter search results. The indexing worker and query service use the same
publication-status contract.” That states intent across an asynchronous boundary.
Links to the actual contract, implementation and tests make it easier to connect
the statement to evidence. It does not prove either service satisfies the rule.

Implementation notes, old tickets, plans and test reports can be useful sources,
but should retain their own role and authority. An old ticket is not necessarily
a current requirement; a completed checklist is not a product rule. Keep validation
records separately classified. Explicit code links/annotations can establish more
precise bindings, but ordinary prose does not guarantee a rule-to-function mapping.
See the README's document-binding examples when that precision is needed.

Optional `semantic-id:` lines provide stable document identity. They are not
approval markers. The demo uses explicit concept IDs for clarity, but ordinary
project docs do not need to imitate its list of graph identifiers. Approval comes
from your reviewed source policy, not Markdown formatting, file location or the
model. Weftlet does not currently author or keep your intent documents up to date.

### External sources and custom adapters

The [2.0 source-adapter plan](../WEFTLET-2.0-PLAN.md) includes evaluating **Figma,
Trello, GitHub Projects, Canva and other sources** individually. The direction is
to read versioned product information where teams keep it, retain its identity,
citations and authority, and eventually support reviewed proposals/publication
where the source permits it. These connectors and automatic write-back are not
shipped. A GitHub repository checked out locally is supported today; live GitHub
Projects/issues ingestion is a different integration. GitHub Actions generation
also does not itself ingest project-board intent.

There are two different adapter concepts:

- **Available now:** a configured trusted repository `adapter` contributes
  `factExtractors` and `invariantEvaluators`. Custom code must use the public core
  contracts, canonical file identities, provenance and strict validation. This can
  add repository-specific evidence; it is not automatic remote ingestion.
- **Planned source connectors:** fetching external material, handling permissions,
  source revisions, citations, freshness, deletions and any reviewed write-back.
  A neutral `SemanticSourceProvider` interface exists, but the current CLI does
  not expose a generic remote-source registration setting. A model-provider
  adapter selects how inference runs; it does not supply Figma/Trello content.

If a team chooses an interim export, it can commit a reviewed text/Markdown
representation anywhere in Git and select it, retaining the external URL/revision
and ownership information. That is an optional manually maintained bridge, not a
required mirror or built-in synchronization promise. Alternatively, start with
code evidence and explicit intent gaps until the needed connector exists. Do not
invent approved requirements to make graph coverage look complete.

## 2. Install and initialize

Use Node 24+ and a Git repository. In the project root:

```sh
npm install --save-dev @weftlet/toolkit
npx weftlet init --yes --repository-id example/my-project --code-root src --semantic-source docs/product --evidence-root tests
npx weftlet config validate
```

Commit the lockfile so CI and teammates use the reviewed version. The toolkit
installs its matching neutral core dependency; most consumers need only toolkit.
`init` creates JSON configuration and an ignore rule. It never overwrites an
existing configuration, installs a skill, registers MCP or runs a model.

If the repository has no docs yet, omit `--semantic-source`: code indexing and
saved queries still work, but product-intent coverage will be absent. For partial
docs, select the trustworthy portion and keep the gaps visible. Do not approve
AI-written business documentation merely because it describes current code.

## 3. Review the configuration

Edit `context-graph.config.json`; there is no YAML config or automatic discovery
of product ownership. Keep generated version fields unless deliberately changing
the extraction contract. Common settings are:

| Setting | Decision |
| --- | --- |
| `repositoryRoot` | Repository root relative to the config file |
| `repositoryId`, `namespace` | Stable identity for this project |
| `codeRoots` | Code included in deterministic file selection |
| `semanticSources` | Exact repository files/directories selected for prose extraction |
| `approvedIntentSources` | Explicitly reviewed owner/SOT paths or globs; starts empty |
| `contractPatterns`, `contractConsumerRoots` | Shared contracts and their potential consumers |
| `evidenceRoots` | Test/validation locations |
| `semantic` | Provider, model, extraction limits and artifact identity |
| `scip` | TypeScript indexing selection; distinct from document selection |
| `ontology.backend` | `rdf` by default; optional `opencaesar` needs its own toolchain |
| `runtimeEvidence` | Optional trace inputs; empty means no runtime evidence |
| `storagePath`, `storageScope` | Local workspace storage or user storage |

Start with one owner document and one feature. For a monorepo, inspect
`graph coverage` after hydration: listing a package in `codeRoots` does not prove
SCIP indexed it. See the README's source-project configuration for explicit
TypeScript entries, test selection and workspace aliases.

Direct selection does not recursively follow Markdown links. Opt-in
`documentTraversal` can follow configured SOT/roadmap entry points with roles,
ownership and explicit coverage/budget reporting. In traversal mode, validation
sources are excluded from model intent extraction by default. See
[document traversal configuration](../../README.md#preview-linked-document-coverage).
Do not silently drop linked dependencies to satisfy a document limit.

The document byte/count budgets do not bound graph size or total cache storage.
There is currently no enforced 10 GiB cache cap; see the
[storage plan](../CACHE-RETENTION-PLAN.md). Keep graph/cache outputs ignored.

## 4. Select extraction authentication

The development agent and extraction provider are independent. A Claude MCP
client can query a graph built with Codex, and a query-only client needs neither
extraction CLI nor model credentials.

| Extraction option | Status / authentication |
| --- | --- |
| `codex-cli` | Released; existing ChatGPT login by default, or explicitly selected API key |
| `claude-cli` | 0.10 candidate; Claude account login or explicit API key, without Codex |
| `opencode-cli` | 0.10 candidate; tested CLI 1.19.5, selected saved API key or explicit key, required `provider/model`; OAuth separate |
| `module` | Trusted custom adapter implementing the provider contract |

Choose the model you have access to. API billing is opt-in and is never a fallback
for a missing account login. Put credentials in secure environment settings,
never config files or Git. [Provider instructions](../PROVIDERS.md) include
complete auth settings, CLI requirements and tested versus tentative behavior.

```sh
npx weftlet doctor
```

Doctor checks local readiness without inference. A present key does not establish
that the remote provider accepts it. Saved queries remain available when a model
provider or optional Docker compiler is unavailable.

## 5. Commit, preview and build

Hydration reads an exact Git commit and excludes working changes. Commit the
selected sources and configuration first, then preview:

```sh
npx weftlet hydrate --plan --ref HEAD --json
```

Check selected documents, source approval, bytes, cache hits/misses, exclusions
and budget failures. This does not estimate dollars or authenticate the model.
Do not run extraction until the selected scope and possible charges are approved.
Then explicitly build:

```sh
npx weftlet hydrate --ref HEAD > weftlet-build.json
```

The output receipt includes `snapshotId`, `commitSha`, `contentDigest` and
extracted/reused counts. Progress goes to stderr. Successful publication follows
identity and strict SHACL validation; failure preserves the last valid snapshot.
Keep the receipt private if project identities are private. The receipt is not
the graph payload and does not itself prove current-diff or business acceptance.

## 6. Inspect the result before giving it to an agent

Replace `SNAPSHOT_ID` with the receipt's exact value:

```sh
npx weftlet graph catalog --snapshot SNAPSHOT_ID --view intent --max-nodes 20 --json
npx weftlet graph coverage --snapshot SNAPSHOT_ID --max-items 20 --json
npx weftlet impact scan --snapshot SNAPSHOT_ID --owner-doc docs/product/owner.md --changed-file src/service.ts --task "Review downstream effects" --max-facts 60 --max-depth 3 --json
npx weftlet viewer serve --snapshot SNAPSHOT_ID --port 4317
```

Use actual owner/code paths. Open the loopback URL printed by the viewer. Start
from intent, open a relationship neighborhood, follow exact nodes, and inspect
citations/authority. An empty intent catalog may mean absent selection, absent
extraction or classification gaps. An empty impact-page lane alone cannot prove
there is no intent elsewhere. Search the catalog and inspect source citations.

Follow pagination with identical arguments. `graph neighbors`, `graph fact` and
`graph paths` let you inspect exact stored relationships. Frontier/truncation and
coverage flags are part of the answer, not optional debugging information.
[Viewer instructions](../VIEWER.md) cover portable exports and full local browsing.

## 7. Connect your agent and do a change

Follow [agent setup](AGENTS.md) to register the stdio MCP server and install the
packaged workflow skill. These are two separate steps. Ask the agent to use the
skill explicitly for the first trial.

A useful task prompt is:

> Use the context-graph-development skill. Before editing, call impact.scan with
> ownerDocument docs/product/owner.md, my task/checklist and the candidate files.
> Report the snapshot commit, evidence state, cited intent/contracts, consumers,
> tests and unresolved gaps. Follow relevant neighborhoods before proposing the
> change. Do not hydrate or make model calls without my approved scope/budget.

Review the cited source alongside the result. Develop and run project tests as
usual. Saved snapshots stay queryable during edits, but excluded changes are not
validated by historical evidence. Optional overlays are draft evidence, not
approved intent or committed acceptance.

## 8. Refresh and validate the final commit

Use the new receipt’s snapshot ID for `SNAPSHOT_ID` below.
After review and commit, preview and hydrate that SHA with the same config and
owner/task scope used for development. Unchanged semantic inputs should be reused.
Record unexpected extraction before authorizing more model work.

```sh
npx weftlet hydrate --plan --ref HEAD --json
npx weftlet hydrate --ref HEAD
npx weftlet validate --snapshot SNAPSHOT_ID
npx weftlet invariant check --ref HEAD
```

`validate --snapshot` checks saved graph conformance; it does not bind validation
to HEAD. `invariant check --ref HEAD` and `clean-compare --ref HEAD` use final
evidence checks that reject dirty checkouts, stale commits, mismatched
configuration and incompatible extractors. Invariant checks cover configured deterministic rules,
not every product requirement. Missing required evidence is not a pass. Test and
runtime acceptance remain project responsibilities.

`clean-compare --ref HEAD` independently rebuilds and compares the digest. In the
current release it retains a full comparison snapshot/index; run deliberately
with adequate disk space, not on every edit. Temporary comparisons and retention
are tracked separately. Do not delete unknown cache objects as part of setup.

Continue with [CI scenarios and snapshot delivery](CI.md). For a trial, retain
bounded query receipts, exact versions, citations, limitations and human findings
using the [consumer evaluation guide](../CONSUMER-TRIAL.md).
