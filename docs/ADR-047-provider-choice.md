# ADR 047: Independent extraction provider choice

Status: implemented for Claude in the 0.10 development candidate; OpenCode is next.

The maintainer requires Claude users to extract with Claude as well as develop
with Claude, without installing Codex. MCP client registration alone does not
meet that requirement. OpenCode needs the same independence through a supported
configured backend. Codex remains supported with its existing account-login and
explicit API-key options.

## Decision

Use provider-specific adapters behind the existing structured semantic contract.
Keep provider selection independent of the development/MCP client. Built-in
Claude extraction and optional mapping proposals use Claude Code, including its
account login; API use is explicitly configured and never an automatic fallback.
Do not make every model SDK/CLI a mandatory toolkit dependency.

Share evidence instructions, citation/schema and canonical identity validation,
process cancellation, bounded output capture and Windows executable discovery.
Keep authentication and result-envelope handling provider-specific. The existing
Codex prompt bytes and provider identity remain unchanged. Claude has its own
versioned identity and cannot reuse Codex artifacts. Historical snapshots and
failed-run artifacts are never deleted to switch providers.

Claude Code 2.1.321 was inspected from its integrity-verified official npm binary.
Its `--safe-mode`, empty tools/settings, strict empty MCP configuration, disabled
skills and nonpersistent JSON output support the required isolation contract.
API mode additionally uses `--bare`, which does not read saved OAuth credentials.
Account mode requires a first-party `claude.ai` status; it does not inherit API
keys or alternate backends. Earlier CLI versions are rejected because this
customization-isolation contract has not been qualified on them. Major version 3
requires a new compatibility check rather than silent acceptance.

The CLI still runs under the operator's OS account and managed CLI policy. These
settings are not an OS sandbox or proof of remote-provider privacy. Requests use
only explicitly selected source text. No model call is made during init, doctor,
planning or saved querying. Version/login probes are read-only and separately
bounded; no account details are reported.

## Qualification and limits

Deterministic tests cover a Claude-only fresh consumer through actual subprocess
dispatch, real SCIP, strict SHACL, snapshot reload, unchanged semantic reuse and
preserved last-valid bytes after malformed output. They also cover separate
authentication choices, output limits, cancellation, Windows launcher discovery,
mapping routing and provider-specific cache identity. A fixture is not a live
Claude model test. Authenticated account/API inference and semantic quality remain
pending; no paid or private-source inference was run for this increment.

OpenCode requires its own verified output, tool-permission, authentication and
cache contracts. It is not enabled by renaming the Claude/Codex executable.
Client registration, shared skill setup and CI examples remain in the
[0.10 task list](RELEASE-09-10-PLAN.md). Architecture-only packaging follows the
separate [architecture plan](ARCHITECTURE-TOOLING-PLAN.md).
