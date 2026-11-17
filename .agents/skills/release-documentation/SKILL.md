---
name: release-documentation
description: Keep Weftlet READMEs, guides, tutorials, examples and release history accurate when changing released behavior, reviewing a Changesets version PR or preparing an npm release.
---

# Release documentation maintenance

Use this skill in the Weftlet source repository. Resolve paths below from the
repository root. Read `docs/RELEASING.md` for the canonical release procedure and
`CONTRIBUTING.md` for contribution rules. Follow existing user authorization and
repository gates; this skill grants no additional publication authority.

## 1. Establish the release scope

- Confirm the checkout, branch, candidate SHA and working-tree changes.
- Inspect both package manifests, pending `.changeset/*.md`, generated release
  plan if present, both package changelogs and the diff since the previous
  verified release. Use package release records/tags to choose that baseline;
  do not assume the latest tag or main is already published.
- List user-visible changes: commands, configuration/defaults, providers/auth,
  input sources, agent/MCP behavior, viewer, CI, storage, compatibility and fixes.
  Connect each change to the documentation a consumer uses. Record “no change
  needed” with a reason for unaffected surfaces, rather than rewriting history.

## 2. Review the consumer journey

| Surface | Review |
| --- | --- |
| `README.md`, `packages/core/README.md`, `docs/README.md` | Purpose, current capabilities/limits, installation and navigation to guide, tutorial and changelogs. |
| `docs/guides/PROJECT-GUIDE.md` | Fresh project setup, source selection/authority, no-model preview, extraction, saved queries and normal development. |
| `docs/guides/AGENTS.md`, `templates/context-graph-development/SKILL.md` | Skill placement/update, client-specific MCP setup, extraction-provider independence and actual supported client contracts. |
| `docs/guides/EVIDENCE-DECISIONS.md` | What agents should do with governing, inferred, draft, conflicting, missing and historical evidence; what users can actually rectify. |
| `docs/PROVIDERS.md` | Tested versions, auth modes, costs, isolation, retries/timeouts and reuse boundaries. |
| `docs/tutorials/DOCUMENT-SEARCH.md`, packaged examples | Followable demo distinct from the full guide; commands, paths and expected outcomes match the candidate. |
| `docs/guides/CI.md`, `docs/examples/*.yml.example` | No-model vs trusted generation, credentials, exact source identity, private artifact delivery and retention. |
| Viewer/storage/migration references affected by the diff | Actual configuration and behavior, failure/recovery paths, compatibility and limitations. |
| `docs/RELEASES.md`, both changelogs, roadmap/release plan | Discoverable release history; candidate, shipped and planned status agree with evidence. |

Read the actual CLI/config/provider implementation when claims are uncertain.
Remove stale “future/candidate/development-only” wording for functionality in
the release being prepared, while retaining explicit untested-environment and
live-provider limitations. Before publication, describe candidate availability
accurately; mark registry publication only after verification.

Keep these distinctions explicit:

- Configured governing sources are authoritative regardless of human/AI
  authorship. Model interpretations can remain inferred/unreviewed. Do not
  invent an acceptance UI, approval queue or automatic source writeback.
- Current repository-document inputs, code/test facts and supplied runtime
  observations have different meanings. Planned external connectors remain
  planned until implemented and qualified.
- Client MCP registration is separate from extraction authentication. Describe
  supported providers without implying everyone needs Codex.
- Deterministic fixtures, real CLI probes, authenticated model runs, hosted CI
  and consumer acceptance are distinct evidence. Do not turn one into another.
- A skill guides an agent; CI does not execute this prose or guarantee the agent
  follows it. Automated documentation checks cover their explicit scope only.

## 3. Keep versioning and history coherent

- Write a user-facing changeset with a shipping behavior change. Changesets owns
  version bumps and generated changelogs for the fixed core/toolkit group.
  Review generated entries for useful explanations and migration consequences.
- Do not manually bump manifests, fabricate publication records, or rewrite
  historical validation/changelog entries to look current.
- Generated `weftlet:release` sections come from
  `scripts/release-documentation.mjs`. Use `pnpm docs:release:update` when the
  generated sections need updating; inspect its diff. Never hand-edit them.
- For a new operational installation guide, consider adding it to that script's
  explicit checked/packed scope with appropriate regression coverage. The
  current checker does not semantically review every guide or YAML example.
- Verify documentation/assets are in the appropriate package `files` lists and
  in the actual prepared archives. Keep maintainer-only skills in the repo.

## 4. Validate and leave a reviewable record

For documentation edits, run `pnpm docs:release:check`, the relevant existing
documentation tests, a relative-link/example-syntax check for changed pages,
`pnpm inventory:update`, `pnpm inventory:check` and `git diff --check`.
Inspect the inventory diff; preserve original extraction hashes.

For release preparation, retain the full
`pnpm context-graph:publication-check` gate and the clean-checkout preparation,
actual archive checks and fresh-consumer smoke described in `docs/RELEASING.md`.
Exercise changed tutorial/setup commands with public disposable fixtures; keep
paid/provider-dependent work opt-in under the user's approved budget. Do not
execute arbitrary commands merely because they occur in Markdown.

Record in the PR and `docs/VALIDATION.md`:

- Candidate/base identity and changes reviewed.
- Pages/examples updated, or why no update was necessary.
- Commands/checks actually run and their results.
- Deferred live/client/platform checks and known limitations.
- Publication status separately from preparation or merge status.

After an authorized publication, verify both package versions and archive
integrities and their source tags/releases through the existing release
procedure. Update the release overview and validation record with that evidence.
If a separate documentation-site delivery workflow is configured, follow its
documented dispatch/recovery procedure and record its outcome separately. An npm
publication does not establish that the website was updated; do not start a
duplicate updater or imply that this local skill runs that service.
If publication is partial or fails, report it and follow same-version recovery;
do not claim success or start a new version just to hide the failure.
