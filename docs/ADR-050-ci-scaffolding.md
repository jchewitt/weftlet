# ADR 050: Standalone, managed CI workflows

Status: implemented for review as S3. Publication remains on hold.

## Decision

Add `setup ci` as a deterministic preview/apply command independent of skill/client
selection. Generate standalone GitHub workflow files. Inspect existing workflow
paths and bind their content hashes without rewriting their jobs, triggers or
permissions. Narrow modifications inside existing jobs belong to S5's separately
reviewed assisted integration; users can also merge generated steps manually.

Detect npm/pnpm from one root lockfile, validate explicit manager pins, and support
a selected nested package. Dependency install stays at the workspace root; selected
build/test scripts and the installed ESM CLI resolve from the package. Configuration
and policy paths remain repository-relative. Never install a guessed toolkit or
invent project scripts, architecture policy or approved product intent.

PR checks have read-only permissions and no injected model credentials. Trusted
generation is opt-in: manual dispatch, default branch, explicit model checkbox,
selected GitHub environment, source/byte budgets and pinned provider CLI. Hosted
runners use the config's explicit API mode. Self-hosted Linux runners preserve
configured account/saved API authentication and must be provisioned separately.
The helper changes no auth config and does not log in, call a model or dispatch CI.
Environment protection is a required operator step, not a property of YAML alone.

## Evidence and ownership

Generated YAML is serialized and round-trip validated with the established `yaml`
parser. Existing workflow/config contents and credentials do not appear in plans;
only generated YAML, file paths and hashes do. A normalized body digest identifies
unchanged managed files; customized targets require manual review. Use S1's locked
compare-and-swap writer with bounded larger read-only lockfile guards. Preserve
existing file permissions and the same explicit interrupted-write recovery rules.

The generated generation workflow performs actual hydration/strict validation
and an exact-commit invariant check. It does not upload snapshots/caches. S6 owns
verified snapshot delivery; R1–R5 own retention/budgets. This avoids selecting an
artifact confidentiality policy while scaffolding a job. The guide explains that
hosted output is temporary until reviewed delivery is configured.

## Qualification

Test provider-specific YAML, credentials only at hydration, account-mode retention,
root/nested package layouts, existing workflow preservation, stale plans, managed
updates/customizations, linked paths and real generated no-model CLI execution.
Record actual hosted consumer dispatch and live provider checks separately. See
[CI setup](guides/CI-SETUP.md) and [validation](VALIDATION.md).
