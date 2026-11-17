# Assisted project integration

Included in the **0.10.0 release scope**; see [release status](../RELEASES.md).
`weftlet setup assist` uses your configured Codex, Claude, or OpenCode
CLI to propose a project-specific setup, then shows a reviewable change plan.
Basic [skill](PROJECT-SETUP.md), [MCP](MCP-SETUP.md), and [CI setup](CI-SETUP.md)
remain available without a model.

The assistant can select documentation, propose source-authority configuration,
install the packaged development skill/MCP entry for selected clients, and add
an isolated Weftlet check job to an existing GitHub workflow. This is useful when
a project already has its own documentation layout and CI jobs.

## 1. Choose the files the assistant may read

Start with an existing Weftlet configuration created by `weftlet init`. Set
`semantic.provider`, model and authentication for the CLI you actually use.
Claude users can use Claude login; Codex users can use ChatGPT login. API-key
modes and OpenCode's supported saved API credentials use the same setup as
[semantic extraction](../PROVIDERS.md). No second provider is required.

From the repository root:

```sh
npx --no-install weftlet setup assist \
  --input package.json \
  --input docs/product-plan.md \
  --input .github/workflows/ci.yml \
  --dry-run
```

Select files that exist in your project. Repeat `--input` for other documents or
nested `package.json` files. Use `--directory` for the repository root and
`--config` for a nondefault configuration. The root must match the configured
repository root. No automatic repository crawl occurs.

The preview reports paths, digests, provider/model/authentication mode, selected
payload bytes, request limit, timeout and an `inputId`. It makes no model request.
Review the selected files locally before consenting to send them to that
provider. Paths and document/workflow text may contain private project data.
Manifest input sends package metadata and script **names**, not script bodies;
configuration input sends document-selection fields, not credentials or the
complete config. Client settings and environment variables are never model input.

Allowed inputs are Markdown/MDX/text, package manifests and GitHub workflow YAML.
Credential/client/cache paths are excluded. Common credential-looking strings
are rejected; this heuristic is not a general secret scanner. Supply a sanitized
file if necessary. Limits are 24 files, 64 KiB per file and 128 KiB of serialized
selected input. Oversized selections fail explicitly, without silent truncation.
The fixed planning instructions and JSON schema add request overhead.

## 2. Request one proposal

Use the input ID from the preview and the same selection:

```sh
npx --no-install weftlet setup assist \
  --input package.json \
  --input docs/product-plan.md \
  --input .github/workflows/ci.yml \
  --allow-model --expect-input INPUT_ID \
  --output .weftlet/setup-plan.json
```

This makes one bounded provider request with no automatic retry or provider
fallback. It uses the configured timeout. Model tools are disabled and execution
uses an isolated temporary directory. No project scripts, hydration, installs,
login, workflow dispatch or business-document edits are performed. `--allow-model`
is consent to the selected provider's usage; byte/request limits do not promise
a fixed token bill. Live model quality and authentication qualification remain
separate from deterministic adapter tests.

The result is a private, create-only JSON proposal. Keep it out of public Git
history when its paths or explanations are sensitive; add your chosen proposal
path to `.gitignore` or remove it after use. The writer does not overwrite an
existing proposal. Its review fields show:

- before/after document selection and source-authority arrays;
- proposed skill contents and MCP entries, with private existing settings omitted;
- generated CI content or the exact additional job;
- file hashes, provider/input identity and an application `planId`.

The model returns a typed recommendation, not arbitrary file patches or shell
commands. The toolkit constructs the file changes from that recommendation.
Only existing source patterns or explicitly selected document paths can be
proposed. New wildcards cannot silently widen source scope. No document body,
model/provider, authentication, extraction budget or architecture policy is edited.

## 3. Review and apply without another model call

```sh
npx --no-install weftlet setup assist --plan .weftlet/setup-plan.json
npx --no-install weftlet setup assist --plan .weftlet/setup-plan.json \
  --apply --expect-plan PLAN_ID
```

The first command reconstructs and validates the saved proposal against the
current files and installed toolkit. The second applies that exact plan using
the same guarded writer as deterministic setup. Existing custom skills/MCP
entries remain conflicts for manual review. Changed input, lockfile, target or
installed-toolkit identity invalidates the plan before application. A competing
setup writer is refused. An interrupted multi-file application may require a
fresh proposal; already completed files are not silently rolled back over later
user edits. Replanning a completed, unchanged setup produces no file changes.

If `approvedIntentSources` changes, application also requires
`--accept-authority`. Review the before/after list first: this is the explicit
bulk decision that those paths describe approved product intent. A model's
suggestion alone grants no approval. Existing approved paths remain unchanged
when the proposal uses `null`; removing approval also requires acceptance.
See [evidence decisions](EVIDENCE-DECISIONS.md) for the distinction between source
authority and the review state of individual extracted assertions.

## Existing CI and monorepos

Include the relevant nested `package.json` and workflow as inputs. The assistant
may select its working directory and existing build/test script names. Apply
adds a `weftlet_checks` job using the deterministic CI renderer. Existing job
settings, triggers, permissions and comments are preserved; the added job uses
Ubuntu, a 20-minute timeout and `contents: read`. No selected script runs during
setup; it will run if you later commit and execute that workflow.

Only `push`, `pull_request`, and `workflow_dispatch` workflows are supported for
this additive integration. Workflows with nonempty workflow-level `env` require
a separate scaffold: GitHub would otherwise pass those variables, potentially
including credentials, to the added install/build/test job. Empty or absent
workflow environments are supported. Privileged/reusable triggers, YAML aliases
and a conflicting `weftlet_checks` job require manual integration. Existing jobs are
not rewritten or given new dependencies. General model-authored YAML surgery is
outside this contract. A separate managed no-model workflow is also available.

Trusted model generation uses the explicit [CI scaffolder](CI-SETUP.md), where
you select the runner, provider version and protected environment. The assistant
does not invent those security/billing choices. No graph artifact is uploaded
by assisted setup. Verified snapshot delivery is tracked separately in S6.

## Recovery and verification

- Changed inputs: preview again, then request a new proposal if assistance is still needed.
- Provider failure/timeout: no setup is applied; retry explicitly or use deterministic commands.
- Customized target: inspect the proposed operations and use the manual setup path.
- Wrong authority suggestion: reject the proposal; change source configuration directly or request a revised plan using clearer selected documentation.
- After application: inspect `git diff`, run `weftlet config validate`, then
  `weftlet setup --client YOUR_CLIENT --mcp --verify`. Restart/trust the project in
  your actual development client and confirm its Weftlet tools are available.

This helper is tested with public fixtures and mocked CLI process boundaries.
Those tests establish validation, provider selection and filesystem behavior;
real provider login/model usefulness and actual client reload are separately
recorded in [validation](../VALIDATION.md).
