# Register and verify project MCP tools

[Documentation home](../README.md) · [Project skills](PROJECT-SETUP.md)

Status: **unreleased 0.10 candidate**, implemented for review. Published 0.9 uses
[manual registration](AGENTS.md#2-register-your-client). Publication remains on hold.

## Connect an existing project

Install the candidate toolkit as a project dependency, and create or retain your
`context-graph.config.json`. Then preview registration and the project skill:

```sh
npx weftlet setup --client codex --mcp --dry-run
npx weftlet setup --client codex --mcp --apply --expect-plan <plan-id> --verify
```

Use `claude` or `opencode` for your client, or repeat `--client` to configure
several. Choose the development client independently from the extraction provider.
The commands use your installed toolkit; after release, use that released version.
Routine setup and verification need no model call, subscription or API key.

For a new project, run `npx weftlet init` first. Init creates the config and skill;
`setup --mcp` adds registration. `--no-skill` makes the setup operation MCP-only.
Use `--directory <project>` from another directory, and `--config <relative-file>`
for a nondefault config inside that project's configured repository root.

| Client profile | Project configuration | Registration |
| --- | --- | --- |
| Codex | `.codex/config.toml` | `mcp_servers.weftlet`; trusted projects only |
| Claude Code | `.mcp.json` | `mcpServers.weftlet`; client approval applies |
| OpenCode 1.x | Existing `opencode.jsonc`, otherwise `opencode.json` | `mcp.weftlet`, local command array |

The helper preserves other servers, settings and comments. OpenCode configurations
with both filenames require you to resolve precedence first. The developing v2
`mcp.servers` format is detected and requires manual registration; this profile
implements the released 1.x contract. Managed or organization settings may override
project settings, so finish with an in-client check.

## Portable launchers

The plan creates a small `.weftlet/mcp-<identity>.mjs` launcher and
`.weftlet/mcp-setup.json` update receipt. Commit these alongside the selected
project configuration and skill after reviewing any pre-existing credentials in
those client files. Generated entries contain no credentials. The entry runs Node directly; no shell,
package download or build happens at agent startup.

By default, the client must start at the project root or a subdirectory. A small
bootstrap finds that exact launcher by walking cwd ancestors. The launcher selects
its project config, switches to the project root and resolves the **project-installed**
`@weftlet/toolkit`. Moving the checkout preserves this registration. Node 24+ must
be on the client's PATH; an npx-only cache installation does not supply the project's
dependency. Nested projects with the same repository ID/config name select the
nearest matching launcher, so use distinct repository IDs for distinct projects.

For clients launched outside the checkout, select absolute paths explicitly:

```sh
npx weftlet setup --client claude --mcp --absolute-launcher --update --dry-run
npx weftlet setup --client claude --mcp --absolute-launcher --update --apply --expect-plan <plan-id> --verify
```

This records the current Node executable and launcher path. Treat those entries as
machine-specific and regenerate them after moving the checkout or Node installation.
Repeat `--absolute-launcher` and any custom `--config` when updating or verifying
that registration. Native Windows clients use native paths; WSL clients need a WSL installation/registration.

## Verification and saved evidence

```sh
npx weftlet setup --client codex --verify --json
npx weftlet setup --client codex --verify --snapshot <exact-saved-id> --json
```

Verification starts only a matching generated launcher, initializes fresh stdio
JSON-RPC, checks the installed package version and all nine expected tools, then
closes the process. An optional one-node `graph.catalog` call checks the exact saved
snapshot. The probe has a 15-second deadline plus bounded subprocess cleanup;
large snapshots may exceed it even when the MCP connection works. Use the normal
query CLI to investigate that case rather than rebuilding evidence automatically.

Reports separate skill state, registration, server readiness and snapshot access:

- `ready` / `readable`: the server and requested saved snapshot responded.
- `not-requested`: startup/tool discovery passed without testing saved evidence.
- `unavailable`: the server connected, but the requested snapshot could not be
  queried. Check its exact ID and storage configuration with `graph catalog`.
- `not-started`: apply or review missing/customized registration first.
- `startup-failed`, `timeout` or `protocol-mismatch`: inspect local Node, config
  and adapter diagnostics. MCP now reports its installed package version.

Startup loads your configured repository adapter. Run verification in a trusted
project, just as you would start its MCP server. Verification requests no hydration,
indexing or inference. Adapter output is drained without echoing it into the report.
For a custom skill, `customized-review` asks you to inspect it rather than claiming
that the packaged guidance is installed unchanged.

Restart the development client, approve/trust the project through its normal UI,
and check that `impact.scan` and `graph.catalog` appear. Then ask the agent to query
an explicit snapshot and inspect its citations, authority and freshness. A protocol
probe verifies the generated command, not the client's discovery, trust or behavior.

## Updates, conflicts and recovery

A repeat setup leaves matching entries unchanged. `--update` permits changes to
entries/launchers that still match their managed receipts. A customized `weftlet`
entry or launcher remains intact and reports a conflict. Merge it manually or
review and relocate your custom entry before regenerating; there is no force overwrite.
An already matching entry can be adopted without changing its command.

MCP plans expose generated entries and before/after hashes, not existing config
contents or credentials. Skill plans still include instruction text for review.
Receipts are local ownership metadata, not signatures or source-authority approvals.
Exact config bytes participate in the plan ID; intervening changes require a fresh
preview. New setup files use owner-only permissions; updates do not widen existing POSIX permissions.

The shared [setup recovery rules](PROJECT-SETUP.md#recovery-and-verification) apply:
linked/shared files are refused, a project lock coordinates toolkit writers, and
multi-file writes are recoverable rather than transactional. An interrupted first
install can be completed by previewing again. If an interrupted managed upgrade
leaves an old receipt alongside a partially updated file, review that conflict;
setup preserves it. Superseded generated launcher files are left for explicit
review instead of deleting potentially referenced files.

## Client references and qualification

Codex's [project MCP configuration](https://developers.openai.com/codex/mcp/) was
checked for this increment. OpenCode's released 1.x schema was checked against its
[versioned upstream guide](https://github.com/anomalyco/opencode/blob/dev/services/site/src/docs/v1/content/mcp-servers.mdx)
(latest release at inspection: v1.19.5). Claude's
[project MCP guide](https://code.claude.com/docs/en/mcp) was inaccessible from this
environment; the existing `.mcp.json` profile is retained and tested as a generated
launcher. Live client loading/login remains a separate qualification. See
[validation](../VALIDATION.md) for actual versus pending platform checks.
