# Connect an agent to Weftlet

[Documentation home](../README.md) · [Project guide](PROJECT-GUIDE.md)

MCP exposes saved evidence. A skill tells the agent when and how to use it.
Configure both, then verify them in a fresh client session. This is manual setup;
`weftlet init` does not register clients or install instruction files.

## 1. Choose a stable server command

Install toolkit in the project and resolve these absolute paths on the machine
where the client runs:

- Node executable (`node -p "process.execPath"`).
- MCP entry: `PROJECT/node_modules/@weftlet/toolkit/dist/mcp.js`.
- Config: `PROJECT/context-graph.config.json`.

Use those paths in the examples below. They avoid shell wrappers, package fetches
at agent startup and dependence on the client's current directory. On Windows,
use forward slashes such as `C:/work/project/...` in JSON/TOML strings, or escape
backslashes. WSL clients need WSL paths and Node; native clients need native paths.
The server speaks stdio JSON-RPC, not HTTP. Keep launcher logs off protocol stdout.

## 2. Register your client

Merge the relevant entry into existing configuration; do not replace unrelated
servers or settings. The examples use `/absolute/...` placeholders deliberately.
Client versions and managed settings can change their configuration behavior;
consult the linked client reference and inspect the client's server status.

### Codex

In `~/.codex/config.toml` (or the project configuration supported by your client):

```toml
[mcp_servers.weftlet]
command = "/absolute/path/to/node"
args = ["/absolute/project/node_modules/@weftlet/toolkit/dist/mcp.js"]
env = { CONTEXT_GRAPH_CONFIG = "/absolute/project/context-graph.config.json" }
```

Reference: [Codex MCP](https://developers.openai.com/codex/mcp/).

### Claude Code

In project `.mcp.json`:

```json
{
  "mcpServers": {
    "weftlet": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/project/node_modules/@weftlet/toolkit/dist/mcp.js"],
      "env": { "CONTEXT_GRAPH_CONFIG": "/absolute/project/context-graph.config.json" }
    }
  }
}
```

Accept the client's project-server trust prompt after reviewing the command.
Reference: [Claude Code MCP](https://code.claude.com/docs/en/mcp).

### OpenCode

In project `opencode.json`, merge a local server entry:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "weftlet": {
      "type": "local",
      "command": ["/absolute/path/to/node", "/absolute/project/node_modules/@weftlet/toolkit/dist/mcp.js"],
      "environment": { "CONTEXT_GRAPH_CONFIG": "/absolute/project/context-graph.config.json" },
      "enabled": true
    }
  }
}
```

Reference: [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/).
Other MCP clients can use the same command, arguments and environment in their
own configuration format. Tool-name prefixes may be added by the client.

## 3. Install the packaged workflow skill

Copy `node_modules/@weftlet/toolkit/templates/context-graph-development/SKILL.md`
to the appropriate project location. Use the same content for each client:

| Client | Project destination |
| --- | --- |
| Codex | `.agents/skills/context-graph-development/SKILL.md` |
| Claude Code | `.claude/skills/context-graph-development/SKILL.md` |
| OpenCode | `.opencode/skills/context-graph-development/SKILL.md` |

For example, from the project root on POSIX:

```sh
mkdir -p .agents/skills/context-graph-development
cp node_modules/@weftlet/toolkit/templates/context-graph-development/SKILL.md .agents/skills/context-graph-development/SKILL.md
```

Use your editor or PowerShell `New-Item`/`Copy-Item` on Windows. Review an existing
skill before updating it; preserve local product policy and track the toolkit
version that supplied the template. Multiple client copies should share the same
workflow, rather than drift into competing architectural/product rules.

References: [Codex skills](https://developers.openai.com/codex/skills/),
[Claude skills](https://code.claude.com/docs/en/skills),
[OpenCode skills](https://opencode.ai/docs/skills/).
The clients use `SKILL.md` with frontmatter, but their discovery locations and
MCP configuration are not universally interchangeable.

Add a short instruction to the project's existing `AGENTS.md` or `CLAUDE.md`:

> For nontrivial changes, use context-graph-development before planning or editing.
> Query Weftlet with the owner document, task/checklist and candidate files.
> Inspect citations, evidence state, coverage and relevant downstream relationships.
> Treat missing/stale evidence as a gap. Model extraction requires explicit scope
> and cost approval. Historical evidence cannot validate the current diff.

Keep canonical product policy in its owner documents. This instruction connects
the agent to the workflow; it does not establish new business or CI rules.

## 4. Verify the connection and usage

Restart/reconnect the client after changing config or upgrading the server. Ask it
to list the Weftlet tools. Expect `impact.scan`, `graph.catalog`, `graph.fact`,
`graph.neighbors`, `graph.paths`, `graph.coverage`, `graph.compatibility` and
mapping inspection tools on the current baseline. Client naming prefixes vary.

With a saved graph, ask for this first call (substitute real paths and task):

```json
{
  "ownerDocument": "docs/product/owner.md",
  "task": "Change query normalization",
  "checklistItems": ["Retain documented input behavior", "Check downstream consumers"],
  "changedFiles": ["src/search.ts"],
  "maxFacts": 60,
  "maxDepth": 3
}
```

That is `impact.scan` input, not an MCP registration file. Inspect the actual tool
call/result: snapshot ID/commit, evidence state, cited intent/contracts, code/tests,
gaps and continuation. Ask the agent to follow one exact relevant node with
`graph.neighbors` in the same snapshot and read the cited source before editing.
A skill appearing in a list does not prove the agent used it.

If the result reports a missing snapshot, build or acquire one explicitly. If it
is stale, it can inform investigation but cannot satisfy a final gate. If the
server is absent, check absolute paths, Node 24+, config validation and client
stderr; reproduce the query with the CLI. The server never hydrates implicitly.

## Extraction versus development support

A development client only needs saved querying. For new semantic extraction,
released 0.9 uses Codex or a configured module. The 0.10 candidate adds Claude's
own login/API path and OpenCode API credentials without Codex. See
[provider configuration and qualification](../PROVIDERS.md). Do not install a
second CLI just to query a graph. MCP uses no Weftlet cloud key.

The server's protocol behavior is tested through fresh CLI/MCP consumer checks.
These manual client profiles are configuration examples; actual authenticated
Claude/OpenCode development sessions are not established by those tests. Codex
reference pages were checked for this guide; Claude/OpenCode documentation sites
returned HTTP 403 in this environment, so their profiles still need a real-client
verification against the linked current documentation.
