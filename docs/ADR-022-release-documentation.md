# ADR-022: Versioned installation documentation checked against release archives

Status: implemented for T06 after 0.5.0; validation is recorded separately in
[validation](VALIDATION.md). This changes release tooling and packaged documentation, not graph semantics.

## Decision

The two package manifests own the version of the current checkout/archive. Marked sections in
the toolkit README, core README and release guide are generated from those manifests. They do
not claim a version is already published: a Changesets version PR can precede registry availability.
Publication evidence remains in the validation record and package-specific releases.

`scripts/release-documentation.mjs` uses Node built-ins. It is usable by the publish job, which
installs no project dependencies. Versioning regenerates the marked sections after Changesets
updates the manifests and before the extraction inventory is refreshed. Missing, duplicate or
malformed markers fail rather than causing unrelated prose to be overwritten.

Source checks compare the complete generated sections and check explicit package pins and
Weftlet archive names in active installation examples. The maintained scope is the two READMEs,
`docs/RELEASING.md`, `docs/MIGRATING-TO-WEFTLET.md` and `docs/CONSUMER-TRIAL.md`.
Feature introductions, earlier release records and historical inspection commands remain intact.
Historical installation fences require an explicit `weftlet-history` classification; this is a
reviewed documentation exception, not an automatic exemption based on an old version number.

Packed checks read the actual two tarballs. Package names, versions, archive filenames and the
toolkit's core dependency must match the release group. Required operational documents must be
present and match the reviewed source, allowing equivalent LF/CRLF checkout representations.
The same documentation checks run on those packed documents. Both archives are checked before
any publish operation, including when publication resumes from prepared artifacts.

The fresh-consumer smoke uses constrained argument arrays obtained from the checked current
examples. It installs the documented archive pair and runs the documented pinned setup and
configuration-validation commands against a disposable registry serving those archives. It
never evaluates arbitrary Markdown as shell code and makes no model requests.

## Boundaries

This is a release-documentation check, not a natural-language verifier or general shell parser.
New current version statements belong in the generated sections. New installation guides must
be added to the explicit operational-document scope to receive the same checks. Historical
validation records, changelogs, feature-introduction versions and private consumer documentation
are not automatically rewritten. Existing immutable npm archives are unchanged.

T07 document selection/authority and broader T05 validation progress/reuse remain separate.
