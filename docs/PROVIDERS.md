# Semantic provider contract

Codex CLI is the released built-in adapter through 0.9.0. The 0.10 development
candidate adds Claude Code and OpenCode CLI extraction and optional mapping proposals. Its
deterministic orchestration is tested; authenticated model execution remains
unvalidated. OpenCode initially supports API credentials; subscription/OAuth support is separate. The module extension
contract remains available; an arbitrary executable is not compatible merely
because it accepts stdin.

For contributors, [provider dispatch](../src/extraction/providers.ts) enforces this contract.
[Codex discovery](../src/extraction/codex-command.ts), [authentication](../src/extraction/codex-auth.ts)
and [semantic hydration](../src/extraction/semantic.ts) implement the shipped adapter;
[setup diagnostics](../src/interfaces/doctor.ts) probe its readiness. These source references
identify the implementation, not an approval of every extracted assertion or a live test result.

`SemanticExtractor` has a stable `identity` and
`extract(source, context, {signal, timeoutMs}) -> {parsed, rawModelOutput}`.
The exported `SemanticOutput`, `semanticOutputSchema` and `assertSemanticOutput` define structured
assertions, node kinds, predicates, inclusive source citations, finite confidence and diagnostics.
Every provider passes the same runtime checks before artifacts are saved. Deterministic OML is
rendered from accepted assertions; model-proposed OML never becomes executable ontology.
Evidence authority is assigned by source approval policy, never by the provider.

Codex receives a single numbered public or explicitly selected local document in an isolated
temporary directory. Shell tooling, user config and rules are disabled; authentication remains
managed by the installed CLI, with the explicit authentication selection below. The child
inherits only the explicit environment allowlist and, in API mode, the selected API key.
Prompts, provider stderr and credentials are never printed by progress/error handling.
Artifact storage contains model output and must remain private with the source repository.

## Codex authentication

Status: included in `@weftlet/toolkit@0.1.0`; live validation is **tentative and non-blocking for
release**, as accepted by the maintainer. Follow-up is planned in a consumer project using an
existing ChatGPT login; API-key testing may remain deferred.
The earlier `@launch-echo/tently@0.1.0` release does not contain this option. Both modes still use Codex CLI;
this is not a direct OpenAI API provider or a fix for the managed-cloud filesystem issue.

Merge one of these fragments into your existing `context-graph.config.json`:

```json
{ "semantic": { "provider": "codex-cli", "auth": { "mode": "chatgpt" } } }
```

Omitting `auth` also selects `chatgpt`; `init` writes it explicitly. Sign in using `codex login`
and select ChatGPT. Weftlet checks `codex login status` before an uncached extraction and requires
it to report ChatGPT login. A missing, unrecognized or API-key login fails before model execution.
There is no automatic API fallback. Existing saved API logins are not changed or logged out by
Weftlet. The status probe has a maximum five-second timeout in addition to the extraction timeout.
This mode uses your plan's Codex allowance and limits.

```json
{
  "semantic": {
    "provider": "codex-cli",
    "auth": { "mode": "api-key", "apiKeyEnv": "WEFTLET_CODEX_API_KEY" }
  }
}
```

API mode uses separately billed API access. Supply the named variable through your local secret
manager or trusted automation environment. `apiKeyEnv` defaults to `CODEX_API_KEY` when omitted.
Weftlet passes only the selected key as `CODEX_API_KEY` to `codex exec`, which supports per-invocation
API authentication without an interactive login. Missing or blank keys fail without falling back
to saved authentication. A key's presence does not establish validity, model access or available
quota. Authentication failures do not trigger a switch to the other mode.

Never put a key value in JSON. Unknown `auth` fields are rejected, and each built-in provider accepts only its documented login mode or `api-key`. Ambient `OPENAI_API_KEY`, `CODEX_API_KEY` and `OPENAI_BASE_URL` are not inherited
implicitly. To use `OPENAI_API_KEY`, explicitly name it in `apiKeyEnv` in API mode. Custom API
endpoints are not part of this change. Proxy and CA settings remain supported.

`doctor` reports the selected mode, ChatGPT login status, or API key presence. API mode reports
`key-present-unverified` and `codexAuthenticated: null`; it never makes a paid authentication probe.
Status output and credential values are not logged. Authentication does not change built-in
semantic artifact identity, so selecting another mode or rotating a key does not force extraction
of unchanged documents. Querying saved snapshots does not require authentication.

Ordinary deterministic CI needs neither mode. Keep live semantic CI opt-in and restricted to
trusted inputs, with narrowly scoped secret exposure and small document budgets. OpenAI's
[automation documentation](https://developers.openai.com/codex/noninteractive/) describes
`CODEX_API_KEY` and recommends its Codex GitHub Action for protected API authentication in Actions.
Compatibility with that action's proxy is not validated here. Trusted persistent runners can
continue using their ChatGPT login; this change does not provision or copy account sessions.

## Claude Code

Status: implemented in the 0.10 development candidate, **not yet published**.
No Codex executable, Codex login or OpenAI API key is required. Claude Code is
installed and authenticated separately by the operator. The adapter currently
requires Claude Code **2.1.321 or later within major version 2**: the contract was
inspected on 2.1.321, including customization isolation and structured-output
flags. This is not a claim that every later CLI version has been tested.

For a fresh project using this candidate:

```sh
weftlet init --provider claude-cli --yes --semantic-source docs/product --model sonnet
claude auth login
weftlet doctor
weftlet hydrate --ref HEAD --plan --json
```

Review and commit configuration/source inputs before hydration. `sonnet` is an
upstream alias; choose an explicit supported model ID and advance the extraction
version deliberately when reproducibility requires pinning a model revision.
MCP client choice is independent of extraction choice.

In an existing config, replace provider/model/authentication together:

```json
{
  "semantic": {
    "provider": "claude-cli",
    "model": "sonnet",
    "reasoningEffort": "medium",
    "auth": { "mode": "claude-login" }
  }
}
```

This fragment preserves the other required semantic settings. Omitting `auth`
selects `claude-login` for this provider. Weftlet requires the read-only Claude
status probe to confirm a first-party `claude.ai` login. Ambient API keys, OAuth
tokens and third-party provider switches are not forwarded. CLI account access,
quota and supported models depend on the user's Claude plan; Weftlet does not
copy or provision sessions. `CLAUDE_CONFIG_DIR` is supported for an operator-owned
CLI profile. A failed probe does not fall back to API billing or Codex.

For explicit API use, replace `auth` with:

```json
{ "mode": "api-key", "apiKeyEnv": "WEFTLET_CLAUDE_API_KEY" }
```

Supply that variable through a secret manager or trusted runner. The default
variable name is `ANTHROPIC_API_KEY`. Only the selected value is forwarded as
`ANTHROPIC_API_KEY`; CLI `--bare` disables saved OAuth/keychain authentication
for that request. Missing keys fail before execution. `doctor` reports presence
as `key-present-unverified`, without testing billing, quota or model access.
Third-party gateways/Bedrock/Vertex and OAuth-token CI setup are not qualified
by this adapter. No credentials belong in JSON or public CI artifacts.

Each request runs in a disposable directory with the numbered source supplied
through stdin. Safe mode, empty tool/setting sources, strict empty MCP config,
disabled skills/Chrome and no session persistence prevent project customization
from becoming extraction instructions. Enterprise-managed CLI policy still
applies; this is not an OS sandbox. Weftlet makes no permission-bypass request.
The CLI must return a successful JSON result with `structured_output`; plain text,
error results and malformed schema/citations/canonical file kinds fail. The same
shared runtime validator and authority rules used by Codex apply. Only structured
model output is retained, not CLI session/account metadata.

Weftlet caps captured stdout at 2 MiB for extraction and 128 KiB for mapping
proposals, suppresses provider stderr, and terminates the process tree on timeout,
cancellation or excess output. The configured deadline is per extraction attempt;
authentication and version probes are separately bounded to five seconds each.
The CLI may perform internal requests within that deadline; document/byte/time
limits are not token or dollar caps. Weftlet retries only explicitly retryable
exit status 75 up to `semantic.retries`; malformed output and ambiguous errors
are not retried. Mapping proposals use one invocation with no Weftlet retry.

Claude cache identity includes provider/model/effort/prompt/auth mode and adapter
contract, plus shared source and validation-policy inputs. It never reuses Codex
artifacts. Operational timeout/retry/concurrency/budget changes reuse compatible
artifacts; key values are never hashed or stored in identity. Switching auth mode
is conservative and changes Claude identity. Old snapshots/artifacts remain intact.
Saved querying needs neither CLI nor credentials.

Validation: a deterministic executable fixture exercises init/doctor, the actual
provider dispatch and process boundary, real TypeScript SCIP, strict SHACL,
persist/read, unchanged repeat and failure preservation. Windows launcher arguments
are checked with fixtures; hosted Windows execution is recorded separately. The
real 2.1.321 binary's help/version and unauthenticated status contract were inspected
without an inference call. **Live Claude login/API extraction and semantic quality
remain pending**; no model call or paid authentication probe was made.

## Limits and reuse

Defaults are at most 8 documents per hydration, 64 KiB per source, a 120-second timeout per
built-in CLI attempt (or module execution), no retries, and the configured concurrency (validated at 1–4). Source budgets are checked
before any model call. `maxDocuments`, `maxSourceBytes`, `timeoutMs`, and `retries` may be configured
within validated limits. Review scope and cost before raising them; these byte/document limits
are not dollar or token estimates. Ask the operator before substantial paid runs.
Starting with 0.5.0, `semantic.timeoutMs` accepts integer values from 1 through **600000**
(ten minutes); 0.4.0 and earlier reject values above 300000. The default remains 120000.
For the approved ten-minute retry, set `"timeoutMs": 600000` inside the existing `semantic`
configuration, preview reuse with `hydrate --plan`, then rerun hydration without forcing
re-extraction. The limit applies to each built-in CLI attempt, or the whole module execution, rather
than the entire hydration. Built-in CLI authentication/discovery checks retain their separate five-second
bounds. This setting does not raise a CI job's overall timeout or change retry policy.
Only explicit transient exit status 75 is retryable, at most twice; authentication, invalid
output, cancellation and ambiguous failures are not retried. Ctrl-C cancels live CLI extraction.
Indexing cancellation is checked between phases, not inside the indexer process.

Cache identity includes provider/model/reasoning effort, prompt and contract versions, source
digest/stable ID, extractor/adapter/ontology versions, confidence threshold and unresolved policy.
Unchanged artifacts are reused; forced revisions are separate. Failures never replace a valid
snapshot. Progress shows phase and counts on stderr, with no document text or paths.

Starting with 0.4.0, T04 adds opaque source IDs, source elapsed times and structured semantic
failure reports. With that version or newer installed, retain the same committed ref and any
agent scope options as the failed run:

```sh
pnpm exec weftlet hydrate --config /path/to/project/context-graph.config.json --ref <commit> --plan --json
pnpm exec weftlet hydrate --config /path/to/project/context-graph.config.json --ref <commit> --json --quiet
```

The first command makes no model calls and maps each `sourceId` to its local document path. Review
that preview before sharing it. The second performs hydration: semantic failures exit nonzero,
leave stdout empty and emit JSON on stderr. Omit `--quiet` for progress; omit `--json` for a safe
human failure summary. Successful hydration still prints its result on stdout. JSON failure
reporting covers semantic processing, not every configuration/indexing/validation failure.

Reports distinguish timeout, cancellation, unavailable infrastructure, provider failure, invalid
output, unresolved mappings, low confidence and cache problems. Completed/extracted/reused counts include active writes that finished
before workers settled. `remaining` includes failed, cancelled and not-started sources; consult
preview for future extraction estimates. Cancellation between sources has no failed `sourceId`.
Source elapsed time includes cache checks and retries and may exceed the per-attempt limit;
module timeout includes import/factory/extraction. No defaults or retry rules change.

For a timeout, review `semantic.timeoutMs` and preview again before retrying without
`--force-semantic`. Completed forced revisions remain stored but are not automatically reused by
an ordinary rerun or a new forced run. Custom provider configuration changes remain conservative.
See [ADR 019](ADR-019-semantic-failure-diagnostics.md) for reporting and privacy boundaries.

Starting with 0.4.0, built-in Codex semantic artifacts are separate from user
snapshot profiles. Changing `timeoutMs`, `retries`, `concurrency`, `maxDocuments` or
`maxSourceBytes` can reuse completed artifacts; selection budgets are still enforced. Snapshot
configuration digests remain complete and saved snapshots are not accepted as current merely
because their artifacts were reused. Workspace cache paths and custom-provider identities remain
unchanged in direct mode. See [ADR 018](ADR-018-operational-semantic-cache.md) for exact isolation and recovery rules.

If an older user-cache run was interrupted and its configuration has already changed, retain an
exact copy of the previous configuration in its original directory. Its original `repositoryRoot`
must still resolve to the same checkout; editing that field changes the old profile identity.
With 0.4.0 or newer installed:

```sh
pnpm exec weftlet cache adopt --config /path/to/project/context-graph.config.json --from-config /path/to/project/previous-context-graph.config.json --ref HEAD --dry-run
pnpm exec weftlet cache adopt --config /path/to/project/context-graph.config.json --from-config /path/to/project/previous-context-graph.config.json --ref HEAD
```

For an agent-scoped run, supply the same `--owner-doc`, `--task` or `--capability` selection used
for hydration. The JSON report shows what was retained and what still needs extraction. Adoption
makes no model calls and changes no snapshots or source files. Incompatible configurations are
refused; unrelated cache profiles are never scanned. Corrupt/conflicting artifacts are reported
and retained. This command is not present in published 0.3.0.

For a trusted local provider module, set `provider: "module"`, `providerModule` to a local path
(relative to the repository root) or installed package, and `providerIdentity` to its exact
declared version. Packages resolve from the consumer repository using ESM import conditions.
Export `createSemanticExtractor(config, {signal, timeoutMs})`; the optional second argument passes
cancellation through asynchronous initialization. One deadline covers module import, factory
initialization and extraction. Cancelled initialization cannot populate the extractor cache or
start extraction later. All semantic configuration contributes
to this adapter's cache identity. Loading happens only during extraction, so a missing module does
not disable queries. Implement cancellation and cleanup when the supplied signal aborts; the
wrapper limits waiting but cannot forcibly terminate arbitrary in-process code. Use subprocesses
with bounded execution when strong process termination is necessary.

`context-graph doctor --config context-graph.config.json` reads configuration, Git availability,
Codex presence/login status, optional Docker readiness and saved default evidence. A login status
is not proof that extraction can run. In this cloud environment, Codex 0.163.0 reported logged in
but its tiny public-example invocation exited immediately with a read-only filesystem error.
Live extraction is therefore unverified here; deterministic adapter, timeout, retry, citation,
budget and cache tests pass. No private source was submitted in that check.

HDesk subsequently reported a live end-to-end pass at commit
`6710e9391a6a01345dab5f5be4ae0656e1c9d1ae` on Windows, Node 24.2.0, Codex 0.153.4,
`gpt-6-astra`/`medium`, using the unchanged adapter and public example. Citation/schema
validation, real SCIP, RDF/SHACL, snapshot publication/querying and repeat artifact reuse passed.
See [validation](VALIDATION.md#hdesk-validation-of-6710e9391a6a01345dab5f5be4ae0656e1c9d1ae)
for counts and scope. The public-example pass does not establish broader semantic quality. Windows launcher coverage
is recorded separately below.

Provider-dependent tests must remain opt-in, use tiny public fixtures, avoid credentials in
untrusted CI, and record model/version/date separately from deterministic test results.

## Windows launchers

Diagnostics, login checks and extraction share Codex discovery. On Windows, each nonempty PATH
directory is searched in order for `codex.exe`, then a standard npm `codex.cmd` launcher. Supported
npm layouts are a global prefix with `node_modules/@openai/codex` and a project-local
`node_modules/.bin`. The resolver verifies the package name, JavaScript bin entry and npm shim
reference, then runs that entry with the current Node executable. It never invokes cmd.exe or
PowerShell, so spaces and shell metacharacters stay literal. Arbitrary wrappers and alternative
package-manager layouts are not advertised as supported. An unsupported earlier launcher fails
instead of silently selecting a different installation later on PATH.

Discovery is bounded to five seconds (or the shorter requested timeout) and honors cancellation.
Extraction cancellation/timeout terminates the launcher process tree with Windows taskkill;
on POSIX the existing process-group termination remains in use. Authentication selection, secret
filtering, source isolation and semantic cache identities are unchanged. Saved-evidence queries
still do not discover or start Codex.

Deterministic tests install a public synthetic CLI with npm locally and globally, then exercise
doctor, login probing and isolated extraction without contacting a model or using real credentials.
These prove launcher plumbing, not live Codex authentication or semantic quality. Browser and live
authentication follow-up remain deferred at the maintainer's request.


Traversal hydration in the next minor candidate keeps the built-in Codex source/prompt contract
unchanged. Its validated `documentTraversal` controls are excluded from the Codex artifact pool
partition; classification is attached during assembly. Validation documents are excluded from
semantic calls and counted only against traversal read limits. Module providers use a separate
full-config namespace in traversal mode, including workspace storage. Modules with mutable
external inputs must version their declared identity or force extraction; unchanged source/config
reuse does not discover those external dependencies. See [ADR 026](ADR-026-traversal-hydration.md).


## OpenCode

The **unpublished 0.10 candidate** supports OpenCode **1.19.5**, using an explicit
`provider/model` and either its selected saved API credential or an environment
variable. Codex and Claude are not required. No provider is chosen automatically.
The maintainer approved API credentials first; subscription/OAuth refresh is a
separate increment. Saved OAuth entries fail clearly, without changing tokens or
falling back to API billing. This is independent of Claude's own login support.

Install OpenCode using its official instructions, then configure the project:

```sh
weftlet init --yes --provider opencode-cli --model anthropic/claude-sonnet-4-5 --semantic-source docs/product
weftlet doctor
weftlet hydrate --plan --json
```

The model is an example, not an availability/access guarantee. Choose an actual
provider/model available to your account. `init` defaults to `opencode-auth`:
Weftlet reads only the selected provider's `type: "api"` entry from OpenCode's
`auth.json` in `$XDG_DATA_HOME/opencode`, or `~/.local/share/opencode` by default.
It does not alter that file, copy other providers' entries or load custom OpenCode
provider configurations. For CI or an explicit key, edit the generated semantic
configuration (retain its other required fields):

```json
{
  "semantic": {
    "provider": "opencode-cli",
    "model": "anthropic/claude-sonnet-4-5",
    "reasoningEffort": "default",
    "auth": { "mode": "api-key", "apiKeyEnv": "WEFTLET_OPENCODE_API_KEY" }
  }
}
```

Supply the key through a secure environment. `default` omits `--variant`; other
values pass the explicitly selected provider's variant. API key presence is not
proof of authentication: `doctor` makes no model request. Missing keys, unsupported
CLI versions and unsupported auth fail without provider/login fallback. Alternate
endpoints, custom provider plugins, cloud credential chains and every OpenCode
backend are **not** claimed as supported by this first adapter.

Each request uses a disposable directory for OpenCode configuration, data,
sessions, logs, cache and state. The pinned CLI's `OPENCODE_TEST_HOME` override
isolates home-directory discovery without changing `HOME`; project config,
external/default plugins, skills, MCP, tools, sharing, snapshots, model-list
updates and auxiliary title/summary/compaction agents are disabled. Only the
selected API entry is forwarded in memory. These are CLI controls, not an OS
sandbox. The executable still runs as the operator, and selected source text goes
to the configured model provider. Interrupted process trees are stopped before
operation-owned temporary output is removed; abrupt machine/process termination
can leave temporary directories (global storage/crash cleanup is separate work).

`run --format json` emits events, not schema-constrained output. Weftlet supplies
the schema in the prompt, accepts one complete successful assistant message,
then applies the same schema, citation and physical-file identity validation as
other providers. Invalid output does not enter the reusable cache. Response bytes,
source bytes, timeout, cancellation and explicit retries are bounded. Optional
mapping proposals use the same provider/auth selection with one request and no
automatic retry.

Cache identity includes provider/model/variant/prompt/auth mode and the pinned
CLI adapter contract. Timeout/concurrency changes keep reusable artifacts; a
provider/model/contract change does not borrow another provider's artifacts.
Existing snapshots remain readable without OpenCode. CLI updates require an
explicit compatibility review rather than silently accepting new behavior.

Qualification: deterministic subprocess fixture → actual TypeScript SCIP →
strict SHACL → publish/read → unchanged reuse and malformed-output preservation.
A real integrity-verified Linux OpenCode 1.19.5 binary also passed a loopback HTTP
protocol test with **one request and zero tools**. That is not a live backend,
API-authentication, model-quality or native Windows binary claim. To rerun the
optional public protocol test with an already installed binary:

```sh
WEFTLET_TEST_OPENCODE_BINARY=/absolute/path/to/opencode pnpm exec vitest run tests/opencode-cli.integration.test.ts
```

The test sends no remote model request and uses no account credentials. It is
skipped by default. Client registration and shared skill setup remain in the
[0.10 onboarding plan](RELEASE-09-10-PLAN.md).
