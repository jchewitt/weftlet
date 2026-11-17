# ADR 048: Managed project skills with previewed updates

Status: implemented for review as S1; publication remains on hold.

## Decision

Install the existing packaged development skill as part of `init`. Default to the
selected extraction provider's client, allow explicit/repeated `--client`, and
offer `--no-skill`. Interactive setup presents source candidates, asks for bulk
governing-source patterns, lists selected instruction files and confirms the
combined operation. Source detection does not establish authority.

Existing projects use `setup`, whose default is read-only preview. `--apply`
recomputes the plan and writes selected skills. An optional `--expect-plan`
binds application to the reviewed root, clients, package/template identity,
update choice and exact current content digests. Changed inputs require a new
preview. The executable always generates content from its installed assets;
there is no arbitrary patch-file execution interface.

Skill installation and MCP registration are different operations. S1 installs
the skill for Codex, Claude Code and OpenCode using their documented project
directories. S2 will handle client-specific server configuration. Neither step
needs a model call; S5 will add an optional setup-planning contract for adaptations.

## Ownership and updates

A trailing `weftlet-managed-skill` JSON comment records schema version 1, toolkit
package version and SHA-256 of the LF-normalized original template body. It is
ownership/update metadata, not a cryptographic signature or an authority grant.
Keep the template's skill frontmatter and original notices intact.

An identical installed copy is a no-op. An unchanged older managed copy requires
`--update`; a customized/unmanaged copy is a conflict even with that flag. The
JSON plan includes before/after text for local review. It can contain private
project instructions and should be reviewed before external sharing. CRLF
checkout conversion preserves eligibility and newline style. Existing project
instructions and custom architecture/business policy are not overwritten.

The first increment uses whole-file ownership to make this decision predictable.
Partial managed sections or automatic three-way merges would need a separate
conflict model. A manually copied legacy skill stays user-owned; users can merge
the proposed version deliberately rather than silently enroll it in updates.

## File lifecycle

The shared writer checks in-project path components with lstat, refuses symlinks,
junctions and shared hard-linked targets, and coordinates toolkit writers with
an exclusive project lock. It checks all expected input bytes before edits and
again before each publication. Temporary complete files are published by an
exclusive hard link for creation or atomic rename for update. It never truncates
an existing target in place. Windows replacement uses the existing bounded
atomic-rename retry helper.

Ordinary failures clean the lock and operation-owned temporary files. A killed
process can leave a lock/temp link for explicit inspection; file age alone does
not authorize cleanup. Completed files survive and are recognized on repeat.
Multiple skill files and init's config/ignore writes are not one transaction.
Unrelated editors do not honor the toolkit lock; avoid concurrent editing during
apply. Hostile filesystem races are not a new isolation guarantee.

## Qualification

Tests cover preview/no writes, multi-client install, repeated runs, changed-plan
refusal, managed update, custom-file preservation, CRLF, directory junctions,
concurrent setup, configuration-path collisions, interactive confirmation and
cancellation, and CLI invocation from another cwd with spaces. The npm/npx smoke
uses prepared archives to verify default init installation and explicit setup
preview/apply without credentials or models. Windows CI includes the focused
suite; actual hosted results and client-session discovery remain separately
recorded in [validation](VALIDATION.md).

User workflow: [project setup](guides/PROJECT-SETUP.md).
