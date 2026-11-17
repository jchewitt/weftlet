# ADR 049: Managed MCP registration and bounded verification

Status: implemented for review as S2/S4; publication remains on hold.

## Decision

Extend S1 `setup` with opt-in `--mcp` and read-only `--verify`. Keep init's skill
behavior stable: run setup after init to register servers. Use Codex project TOML,
Claude project JSON and OpenCode 1.x project JSON/JSONC. Use established parsers
(`smol-toml`, `jsonc-parser`) instead of implementing config grammars. Detect
ambiguous OpenCode files and v2 schema; require review rather than guessing.

Default registrations invoke a generated project launcher from the client cwd or
an ancestor. This supports checkout relocation and subdirectory launch without
checking personal absolute paths into shared configs. A selected absolute mode
supports clients whose cwd is elsewhere. Launchers resolve the project-installed
package, so startup cannot silently fetch a different npm version. Node 24+ and a
local package installation are prerequisites. Same-ID nested projects select the
nearest generated launcher; distinct projects should have distinct repository IDs.

## Preservation and ownership

JSONC edits change only the Weftlet entry and retain comments. TOML appends or
replaces a bounded managed block; parsed before/after comparisons verify unrelated
settings are unchanged. Existing entries that differ from the desired/recorded
managed entry are conflicts. Updates require `--update` and matching receipts;
customized launchers remain untouched. New files are owner-readable/writable;
replacement does not widen existing POSIX permission bits for files containing secrets.

Public MCP plans carry content hashes, generated entries and actions, never whole
existing client settings. Raw bytes stay internal to the S1 compare-and-swap writer.
Combined skill/MCP plans preflight conflicts before writing and bind the exact
config bytes. Receipts are operational ownership metadata, not trusted signatures.
Crash recovery remains explicit; no destructive cleanup or global client edits.

## Verification

A read-only verifier checks skill/registration state before starting only the
expected launcher. It checks real MCP initialization, installed package version
and tool discovery, with an optional one-node read of an explicit saved snapshot.
Server identity now loads installed package metadata rather than hardcoded 0.1.0.
A 15-second deadline and SDK subprocess termination bound the probe. Stderr and
query payloads are not echoed; privacy-safe statuses direct local diagnosis.

This starts the configured project adapter, which is trusted executable code.
It requests no model, indexer or hydration. Protocol success does not establish
client trust/discovery or current-diff evidence acceptance. Actual client loading,
provider authentication and Windows execution remain separately reported.

## Scope

CI scaffolding is S3, followed by optional assisted integration S5 and explicit
snapshot delivery S6. This increment creates no hosted service, provider fallback,
client trust override or npm publication. See [setup guide](guides/MCP-SETUP.md).
