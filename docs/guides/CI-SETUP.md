# Set up GitHub workflows

[Documentation home](../README.md) · [CI scenarios and delivery](CI.md)

Included in the **0.10.0 release scope**; check [release status](../RELEASES.md)
and install the matching toolkit as a project dependency. Existing 0.9
installations can use the [copyable examples](CI.md).

## Add ordinary PR checks

With a committed Weftlet config and root npm or pnpm lockfile:

```sh
npx weftlet setup ci --checks --test-script test --dry-run
npx weftlet setup ci --checks --test-script test --apply --expect-plan <plan-id>
```

The preview shows the full proposed YAML. Applying creates
`.github/workflows/weftlet-check.yml`; commit it to run on pull requests or manual
dispatch. The job installs locked dependencies, validates configuration and previews
committed hydration inputs. It then runs the existing package scripts you selected.
A passing hydration plan confirms scope/budget readiness; generation and strict
graph validation are separate operations.

`--checks` is the default when generation is not selected. Add a build and your
existing approved architecture policy when applicable:

```sh
npx weftlet setup ci --checks --build-script build --test-script test --architecture-policy architecture.policy.json --dry-run
```

Build runs before Weftlet checks, which supports compiled project adapters. Repeat
`--test-script` for several scripts; setup checks their names but never runs their
contents. Architecture analysis uses the selected canonical policy and requires
its normal analysis dependencies in the project. The helper creates no policy,
marks no rule approved, and accepts no new debt baseline.

## Workspaces and existing CI

Use `--directory <repository>` from another cwd. The selected config's
`repositoryRoot` must match that directory. Use `--working-directory` for a nested
package that declares the toolkit dependency and owns the selected scripts:

```sh
npx weftlet setup ci --checks --working-directory tools/context-graph --config tools/context-graph/context-graph.config.json --build-script build --dry-run
```

Frozen installation runs at the repository root; the build, tests and Weftlet
commands run in the selected package. Config/policy paths are repository-relative.
CLI resolution supports npm hoisting and pnpm package links, without downloading
an executable at workflow runtime.

The helper detects existing `.github/workflows/*.yml`/`*.yaml`, package scripts,
root lockfiles and package-manager metadata. It adds standalone Weftlet workflows
and preserves other files, triggers, permissions and jobs byte for byte. This is
also useful when existing CI is complex: review the new job separately, or copy its
steps into your own workflow deliberately. Optional model-assisted integration
is available through [assisted setup](ASSISTED-SETUP.md), which can add a
separate check job while preserving existing jobs.

Supported installs are `npm ci` and `pnpm install --frozen-lockfile`. pnpm requires
an exact root `packageManager` version; an explicit npm version is also honored.
Both lockfiles together, a conflicting manager pin, or another package manager
require manual resolution. Node is 24; referenced GitHub actions are pinned by SHA.
The generated check job uses an ephemeral Ubuntu runner and read-only repository
permissions. It receives no Weftlet provider credentials.

## Optional trusted generation

Select generation separately. It writes
`.github/workflows/weftlet-generate.yml`, which runs only through manual dispatch
on the default branch with `allow_model` explicitly checked. It checks out the
exact event SHA, runs the selected checks, hydrates with the committed limits,
and runs the exact-commit invariant check after strict validation/publication.

The configuration selects the extraction provider and authentication. Setup
leaves both unchanged. You must supply a reviewed CLI version, a GitHub environment
name, and a runner choice. Set explicit `semantic.maxDocuments` and
`semantic.maxSourceBytes` in the config first; review timeout/concurrency/retry
and model choices there as well.

For a configuration already using API-key authentication:

```sh
npx weftlet setup ci --generate --runner hosted --environment weftlet-generation --provider-version 0.153.4 --dry-run
```

That version is the recorded Codex example, not an automatic choice. Use the
version for the configured provider. Claude's current contract accepts 2.1.321+
within major 2; OpenCode's current adapter is pinned to 1.19.5. The helper installs
only that provider on hosted runners and verifies its CLI version. Module
providers need a reviewed manual workflow.

For existing account login on your managed runner:

```sh
npx weftlet setup ci --generate --runner self-hosted --environment weftlet-generation --provider-version 0.153.4 --dry-run
```

Provision a dedicated trusted **Linux** runner with labels `self-hosted`, `linux`
and `weftlet-generation`. Install the selected provider/version on its PATH after
Node setup and maintain its login there. This supports configured Codex ChatGPT
or Claude login and OpenCode's supported saved API credentials. It does not add
OpenCode subscription/OAuth support. The generated job verifies the existing CLI;
it does not install/replace the provider or log in. Account login does not require
switching the config to API mode. Use self-hosted runners only for trusted code:
package installation, builds and adapters execute code with that machine's access.

For API mode, put the configured `apiKeyEnv` secret in the selected GitHub
environment. Defaults are `CODEX_API_KEY`, `ANTHROPIC_API_KEY` and
`WEFTLET_OPENCODE_API_KEY`, according to provider. YAML references the secret only
on the hydration step; it contains no credential value. Common launcher/runner control variables, such as `PATH` and `NODE_OPTIONS`,
are refused as API credential names. Setup reads no credential stores.

**Configure the environment's reviewers and branch restrictions before dispatch.**
Writing a YAML `environment` reference does not establish those protections.
Review provider access, billing and model budgets before allowing generation.
Setup and workflow preview make no model request and dispatch nothing.

Combine `--checks --generate` to add both workflows. Generation never runs on PRs,
uses no `pull_request_target`, and has a 30-minute job limit. Generation uses your configured ontology backend; new `init` configs select RDF. If you select optional openCAESAR, provision Docker
and the configured compiler project/image through your normal runner setup.

## Evidence delivery

This initial scaffold validates generation without uploading graph/cache data.
On GitHub-hosted runners the resulting snapshot is temporary unless you add
reviewed private delivery. On self-hosted runners, generation uses your existing storage location; this
setup increment adds no cache retention policy.

Use the [delivery guide](CI.md#scenario-c-acquire-evidence-locally-and-reconnect-the-agent)
for delivery choices. The [snapshot export/import](SNAPSHOT-DELIVERY.md)
provides a verified selected-snapshot bundle with explicit local activation.
Choose a trusted artifact channel and access policy before adding an upload step;
this scaffolder leaves that project-specific choice to you.

## Managed updates and recovery

`--json` reports proposed YAML, input hashes, existing workflow paths, available
script names and required follow-up. It omits existing workflow contents, script
bodies, npm credentials and raw graph configuration. A comment in each generated
file records its template digest and toolkit version. It is update metadata, not
a signature or approval of product intent.

Repeat setup leaves matching files unchanged. Use `--update` for an unchanged
managed older workflow; customized or unmarked targets report a conflict and stay
intact. Merge desired steps manually if you maintain your own workflow. There is
no force overwrite or automatic workflow deletion.

`--expect-plan` binds application to the current inputs and generated files.
Changed config, lockfile, scripts or inspected workflow bytes require another
preview. The shared setup writer coordinates toolkit processes and rechecks input
bytes. It rejects symlinks/junctions/shared hardlinks; lockfiles are bounded to
16 MiB, other inspected files to 256 KiB, and workflow discovery to 128 files.
Multiple writes are recoverable rather than transactional; see
[setup recovery](PROJECT-SETUP.md#recovery-and-verification).

## Validation boundaries

Public fixtures check YAML, preservation, authentication separation and generated
no-model commands against an independently installed package, including a nested
npm package with hoisted dependencies. Hosted execution of a generated consumer
workflow, actual provider authentication/model calls and self-hosted provisioning
remain target-project qualification. Weftlet's own GitHub CI is a separate test.
