# Install project agent skills

Status: unreleased 0.10 candidate. These commands are available in this candidate;
published 0.9 uses the [manual copy workflow](AGENTS.md#3-install-the-packaged-workflow-skill).
Publication is on hold at the maintainer's request.

## New projects

Run `npx weftlet init` in the project. Interactive setup offers document paths,
bulk governing-source patterns and development clients, then lists the skill
files before confirmation. It creates configuration and the selected clients'
project skills from assets bundled with the installed toolkit.

For automation:

```sh
npx weftlet init --yes --provider claude-cli --client claude --semantic-source docs/product --approved-intent-source 'docs/product/**'
```

`--client` accepts `codex`, `claude` or `opencode`, and can be repeated. Without
it, init installs for the selected extraction provider's client (Codex by
default). The development client can differ from the extraction provider.
Use `--no-skill` to keep instruction installation manual. Setup makes no model
requests and needs no provider login.

`--approved-intent-source` can be repeated for existing governing files/globs.
The user designates authority; source detection does not approve documents.
`--semantic-source` selects document paths independently. Init preserves an
existing configuration; use the next section to add skills to that project.

## Existing projects and additional clients

```sh
npx weftlet setup --client codex --client claude --dry-run
npx weftlet setup --client codex --client claude --apply --expect-plan <plan-id>
```

Preview is the default. Copy the exact plan ID from the preview and keep the same
options when applying. `--expect-plan` refuses changed inputs or a changed
installed template. `--apply` without an expected ID applies a newly calculated
plan directly. `--directory <project>` works from another cwd, including paths
with spaces. This command can install skills before graph configuration exists;
it leaves existing graph configuration and other project instructions intact.

| Client | Installed file |
| --- | --- |
| Codex | `.agents/skills/context-graph-development/SKILL.md` |
| Claude Code | `.claude/skills/context-graph-development/SKILL.md` |
| OpenCode | `.opencode/skills/context-graph-development/SKILL.md` |

Commit the selected instruction files with the project. The installed skill
describes when to query, follow citations/relationships, report gaps and check
freshness. [Register MCP](AGENTS.md#2-register-your-client) and reload the
client as needed to make the graph tools available. This increment installs
skills; automatic MCP registration is the next task.

## Updates and project customizations

Repeat setup leaves an identical skill unchanged. A small trailing ownership
receipt records the toolkit version and template digest. After upgrading:

```sh
npx weftlet setup --client codex --update --json
npx weftlet setup --client codex --update --apply --expect-plan <plan-id>
```

`--json` includes before/after text for local review. It may include your custom
project instructions; review it before sharing. An unchanged managed older copy
shows `update-available` until `--update` is supplied. CRLF checkout conversion
is supported and its newline style is retained.

A modified or manually copied skill reports `conflict`. Setup preserves it,
even with `--update`; compare the proposed text and merge desired guidance
yourself. There is no force-overwrite option. Keep project-specific policy in
your normal governing files and instruction files rather than modifying the
managed skill when possible. Missing/altered ownership receipts also require
manual review.

## Recovery and verification

Before writing, setup checks all selected skill files and refuses stale plans,
symlinks/junctions and shared hard-linked files. A project lock coordinates
Weftlet setup processes. File creation/update publishes complete contents;
multiple files and init's configuration writes are not one transaction.
If interrupted after some files complete, preview again and finish with `setup`;
completed matching skills are recognized. If init's configuration already exists,
keep it and use `setup` rather than deleting it to rerun init.

If `.weftlet-setup.lock` remains after a killed process, confirm that process has
stopped, remove only that lock, and preview again. Ordinary failures release the
lock and operation-owned temporary files. A process killed during file publication
may leave a `.tmp` sibling; if setup reports a shared hard-linked target, inspect
that interrupted operation before removing its temporary link. Setup preserves
these ambiguous files for manual recovery. Avoid editing a target while applying; content is rechecked immediately
before publication, but unrelated editors do not participate in the setup lock.

Finally inspect the installed skill in the client's project skill list and make
a [first saved-graph query](AGENTS.md#4-verify-the-connection-and-usage). File installation
and CLI checks establish the local setup; the client controls skill discovery,
trust prompts and reload behavior.
