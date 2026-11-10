# Contributing

Keep changes within one roadmap milestone and record validation in `docs/VALIDATION.md`.
Run the build, deterministic tests and packaging smoke check for runtime changes.
Keep neutral contracts free of repository dependencies. Add product conventions through an
adapter rather than hard-coding paths or deployment assumptions into the toolkit.

Preserve evidence authority and source citations. Tests must distinguish missing evidence,
uncertainty, infrastructure failure and proven rule violations. Do not add paid provider
calls to ordinary or untrusted CI.

Preserve the Apache-2.0 notices and extraction manifest. Update modified-file notices when
adapting imported source. Never include secrets, private documents or graph snapshots in a PR.

Releases use Changesets and GitHub trusted publishing; see
[release instructions](docs/RELEASING.md). For changes to released behavior and
for every release review, use the
[release-documentation skill](.agents/skills/release-documentation/SKILL.md).
It covers the README, multi-page guides, separate tutorial, examples and release
history alongside the automated version/archive checks. Record which docs
changed, checks run and remaining validation limits in the PR.
