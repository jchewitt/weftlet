# ADR 046: validate semantic physical-file identity before assembly

Status: implemented candidate for 0.9.0; private recovery and publication pending.

## Evidence and decision

The 0.8.1 consumer report identifies one `component:file:` node as both Evidence
and Component. Its semantic assertion is a Workflow `verifiedBy` that file.
The consumer confirms the public factory classifies the path as Component.
Source inspection shows two document-linker routes: containment copies a model
node; Markdown references construct a canonical file node. A conflicting model
kind therefore propagates into the linker as well as the semantic fact.

Keep `repositoryFileNode` canonical: documents are Document, test/spec files are
Evidence, other files Component. This describes a physical identity, not its role
in a cited assertion. `verifiedBy` is allowed to target a Component or Document;
it does not certify successful execution or override the physical kind. A separate
business-evidence concept can keep its own non-file ID, but the engine must not
invent that concept or an extra relationship to repair a provider response.

Reject noncanonical reserved file IDs/kinds during fresh semantic validation,
cache inspection and document-linker ingress. Check subjects and objects. Do not
change kind, discard facts, create alternative IDs to avoid joining, or select
a majority type from other graph facts. Keep the earlier explicit document-only
namespace normalization unchanged. Cite the assertion index/side and a node hash
in the low-level error without exposing paths, labels or private model output.
The existing hydration report retains its privacy-safe source ID, phase and
invalid-output classification.

`component:file:` explicitly identifies physical files. The `document:` namespace
also contains logical documents such as `document:classification`; only recognized
document paths participate in its established file policy. Do not reinterpret
logical document IDs as implementation files merely because the factory's fallback
kind is Component.

Clarify the Codex prompt with concrete production/test/document `verifiedBy`
examples. Runtime checks apply equally to module providers; schema-constrained
output is not trusted as proof of correctness. A provider that continues to emit
the invalid kind still fails. This is an integrity-contract repair, not proof that
every model will now produce valid output or that the failed consumer run recovers.

## Identity and recovery

Advance repository-node artifact policy **1 → 2** and graph assembly **12 → 13**.
Current keys cannot reuse policy-1 artifacts. Both valid and invalid historical
artifacts remain untouched; there is no automatic migration or cache rewrite.
Policy-2 artifacts are checked for canonical IDs/kinds even when their stored
output digest is valid. Within policy 2, ordinary unchanged reuse and operational
setting reuse retain their previous behavior. A fresh inconsistent result is
rejected before artifact publication; no automatic model retry is added.

Old snapshots remain queryable and report extraction incompatibility for new
acceptance. No RDF/SHACL constraint, physical storage encoding, static extractor,
authority rule or ranking policy changes. The document-linker emits the same
facts for valid inputs, so its producer identity remains 2.0.0; the new assembly
identity records the stricter ingress requirement.

Before consumer generation, run the no-model plan with the intended commit,
configuration and scope. Expect policy-1 artifacts to require extraction under
the new contract, and review the resulting model budget. Do not edit preserved
artifacts or patch an installed package. A model-generated `verifiedBy` assertion
retains its citation, confidence and inferred/unreviewed authority after acceptance.
Correct file typing does not establish semantic correctness or owner approval.

## Qualification

`tests/canonical-semantic-files.test.ts` covers production/test/spec/namespace
mismatches on fresh output, non-mutating rejection, digest-valid malformed caches,
linker ingress, independent business IDs and existing document migration. Its
public two-document fixture uses a deterministic provider, real TypeScript SCIP,
strict SHACL, immutable publication/reload and unchanged artifact reuse. A later
invalid forced extraction must leave the prior head, snapshot and artifacts intact.

Existing document-identity, static producer composition, cache adoption, operational
reuse, preview, overlay and routing checks retain their semantics with explicit
new identity expectations. The source facts in this public test are not private
consumer data, and the provider is not a live model-quality test. Supported-host,
release and consumer evidence must be reported separately.
