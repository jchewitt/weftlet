# CI scenarios and evidence delivery

[Documentation home](../README.md) · [Project guide](PROJECT-GUIDE.md) ·
[Agent setup](AGENTS.md)

A typical project builds a committed graph in trusted CI, retains a private
snapshot and lets local agents/viewers query it. CI does not automatically update
desktop MCP processes or local heads. An HTML report is also not a snapshot store.

## Scenario A: ordinary pull requests, no model credentials

Adapt [weftlet-check.yml.example](../examples/weftlet-check.yml.example) for your
repository. It assumes toolkit is a locked dev dependency and the config is
committed. It runs config validation and the no-model hydration plan alongside
your normal project tests. A plan failure can expose invalid or over-budget
selection; a successful plan does not validate the graph or the changed product.

Use your package manager's frozen install (`npm ci` in this example). Change both
install/cache settings for pnpm or another manager. Install/build your own adapter
explicitly if one is configured. The examples invoke the installed consumer CLI;
Weftlet's own `action/action.yml` checks the toolkit repository and is not a generic
consumer hydration action.

Run deterministic approved architectural policy through `weftlet govern` only
when that policy and the needed analysis tools have been configured. Model
uncertainty must not become a hard violation; absent evidence must not become a
pass. Keep extraction gaps, rule violations and infrastructure errors distinct.

## Scenario B: opt-in semantic generation on a trusted branch

Adapt [weftlet-generate.yml.example](../examples/weftlet-generate.yml.example).
It deliberately has only `workflow_dispatch`, restricts execution to the default
branch and checks out that event's exact SHA. It uses default RDF, not Docker.
Before enabling it:

1. Review/commit bounded source selection, explicit API authentication and limits.
   This example uses `codex-cli` with `semantic.auth.mode: "api-key"` and
   `apiKeyEnv: "CODEX_API_KEY"`. Ambient API keys do not switch ChatGPT-login mode.
2. Keep workspace storage at `.context-graph` and ignore generated output. The
   upload paths assume that layout. Do not restore an entire historical cache
   into this fresh example job.
3. Configure a GitHub environment named `weftlet-generation`, put the key there,
   and select appropriate reviewers/branch restrictions. Creating the YAML does
   not create or protect that environment. Review generation cost before dispatch.
4. Review the pinned extraction CLI version/model access. The example pins the
   recorded Codex version; confirm compatibility for your provider before rollout.
5. Review artifact visibility. Snapshots include product/code evidence and source
   citations. On a public repository, do not assume workflow artifacts provide
   adequate confidentiality. Replace upload with your approved private store or
   disable delivery until access has been reviewed.

Never attach these credentials to `pull_request_target` while checking out or
running contributor code. A fork PR can run config/test checks without keys;
trusted generation needs a separate reviewed path. Provider secrets are scoped to
the model step, not dependency installation, planning or artifact upload.

The example records a build receipt, producing config, installed package versions
and checksums, plus snapshots/heads for querying. It deliberately excludes semantic
raw-output caches, SCIP indexes, compiler scratch and credentials. This is a
**query-only delivery**, not a complete exact-rehydration archive. Archive/restore
and global cache retention remain separate planned capabilities. Short GitHub
artifact retention does not implement a local cache cap.

Reuse of semantic artifacts can save future model work, but requires a separate
private cache design keyed by source/model/extractor identity and validated on
read. Do not upload all user caches or make caches from untrusted jobs authoritative.
The initial example makes no cross-run semantic reuse promise.

Claude/OpenCode generation can use the candidate provider contracts once released
and qualified for your environment. Preserve the same trust boundaries and select
the matching CLI/auth settings; do not rename the executable in this Codex example.
Codex account login remains an option on an appropriately managed trusted runner;
Weftlet does not automatically log a GitHub-hosted runner into a ChatGPT account.

## Scenario C: acquire evidence locally and reconnect the agent

Download the exact successful run's artifact into a **new staging directory**.
Use your normal authenticated GitHub UI or CLI, then on Linux/WSL:

```sh
cd /path/to/downloaded/weftlet-artifact
sha256sum --check SHA256SUMS
```

Check the trusted run/commit, build receipt, package pair and producing config.
Checksums detect byte changes; an untrusted producer can also generate matching
checksums. Do not execute downloaded scripts or configure a downloaded adapter
before review. Retain the selected commit and snapshot ID from the receipt.

Query staging evidence with a reviewed local copy of the producing config and an
explicit storage location. For example, copy your reviewed project config to a
local ignored file, set `repositoryRoot` to the actual local repository and
`storageScope: "workspace"`, and set `storagePath` to the absolute staging
directory containing `snapshots` and `heads`. Use `--config` with that file and
`--snapshot` with the receipt ID:

```sh
npx weftlet graph catalog --config /absolute/local-reader.json --snapshot SNAPSHOT_ID --view intent --max-nodes 20 --json
npx weftlet viewer serve --config /absolute/local-reader.json --snapshot SNAPSHOT_ID
```

Changing the reader's config/storage path changes its configuration digest, so
saved query evidence may report a configuration mismatch. A historical commit
may also report staleness. Neither should be hidden or relabeled current. Final
validation requires evidence matching the actual producing configuration and
current committed inputs through the project's reviewed normal storage setup.
Do not overwrite a working local store/head just to suppress these indicators.

Point MCP's `CONTEXT_GRAPH_CONFIG` to the reviewed reader config and reconnect the
client. Verify the returned snapshot ID and commit in a fresh call. An already
running desktop server has not necessarily reloaded after a download or upgrade.
Missing historical snapshots must report absence; never silently substitute newer
evidence for a selected ID.

## Scenario D: publish a focused viewer report

Use `viewer export` with selected exact roots and bounded depth/fact/node/byte
limits. Deploy the generated directory to your chosen static host, with access
appropriate for its contents. The portable app needs no database or API and
reports its frontier; it cannot fetch omitted full-graph neighborhoods. The local
explorer queries the full saved snapshot through its loopback service.

Public Pages is appropriate only for public-safe evidence. Private product graphs
need a reviewed private delivery/authentication arrangement. Hosted API bundles,
database connectors and the 2.0 review website remain separate milestones;
Docker is not a prerequisite for these local/static instructions.

## Qualification

These are copyable consumer examples, not workflows automatically installed or
executed by toolkit setup. Their config/preview commands and the tutorial's
code-only flow are checked locally. Workflow structure and client profiles are
reviewed examples; actual hosted dispatch, secrets, provider authentication,
private delivery and client UI acceptance require validation in the target project.
The toolkit's own hosted tests do not prove a consumer workflow ran.
