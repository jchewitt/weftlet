# ADR-025: Document roles, ownership and deterministic evidence

Status: T07b merged in PR 42; local and hosted checks and independent review passed.
No npm publication or consumer acceptance is claimed. See [validation](VALIDATION.md) for
completed checks and the [1.0 plan](RELEASE-1.0-PLAN.md) for the remaining boundary.

## Decision

Classify document sources separately from source approval, assertion review and canonical node
identity. The public classifier accepts explicit role/owner mappings; the standalone deterministic
extractor retains document presence and canonical references without semantic artifacts. T07b does
not register that extractor with hydration or overlays. T07c will connect selection, classification,
validation-document separation and artifact reuse to execution.

`documents plan --document-policy <json-file>` accepts an optional operation-time JSON sidecar,
resolved from the current working directory and bounded to 65,536 bytes. It is not a hydration
configuration field. The API equivalent is `DocumentCoverageOptions.documentPolicy`. Documents
come from the chosen commit; policy and existing configuration are current operation inputs.
The report records their digests and makes no model/provider request or graph write.

## Roles and owner mappings

Source roles are `intent`, `plan`, `validation`, `reference` and `unclassified`. Explicit role
mappings override configured defaults. Without a matching role mapping, evidence roots imply
`validation`, approved intent sources imply `intent`, and other sources remain `unclassified`.
Different matching explicit roles produce an ambiguity; rule order never chooses a winner.
Approval still comes only from `approvedIntentSources`, independently of the selected role.

Ownership requires an explicit mapping to a canonical document path. One available, approved
owner with an unambiguous `intent` role resolves ownership. Multiple distinct owners are
`ambiguous`; an unread or outside-coverage owner is `unavailable`; an unapproved owner is
`unapproved`; an approved owner with another or ambiguous role is `ineligible`. With no mapping,
ownership is `missing` for intent/plan/unclassified sources and `not-required` for validation/reference.
Approval does not imply self-ownership; a self-owner must also be mapped explicitly.

An owner mapping never approves its child document or an extracted assertion, and produces no
inferred owner edge. Missing/ambiguous roles and ownership are source-level evidence gaps, not
proven business-rule violations. The normalized policy digest includes role/owner mappings and
the approval/evidence-root policy; it does not depend on rule order or document availability.

## Evidence records and querying

Optional per-fact `sourceRole`, `sourceOwnership` and `sourcePolicyDigest` preserve classification
without attaching conflicting roles to a shared canonical Document node. RDF exposes the role,
ownership status, owner paths, mapping IDs and policy digest while retaining exact record projection.
Metadata-targeted SHACL constraints validate new fields; historical facts without them retain
their existing behavior. Document IDs/kinds and the existing assembly/cache identities stay intact.

`extractDocumentEvidence` uses the committed traversal and classifier. For each successfully read
document it emits a Project `contains` Document fact, including empty documents and documents
without outgoing links. It emits `references` facts only for resolved canonical file/document
links, retaining exact declaration/use citations, source digests and commit SHA. Unresolved links
and incomplete traversal remain explicit reports/diagnostics; no missing relationship is invented.
The new `document-evidence-extractor:1.0.0` identity and classification metadata enter fact IDs.

These structural facts have inferred authority and deterministic extraction review. Their source
approval remains separate. Presence, a reference or a validation role does not claim that a test
ran/passed or a product rule was approved. Explicit validation roles use validation coverage;
plan/reference/unclassified roles cannot establish product intent. Query and viewer details expose
the same role/ownership metadata; existing facts without roles retain legacy interpretation.

## Readiness and delivery boundary

The prospective plan's top-level `ready` remains traversal completeness plus budget readiness.
`classification.complete` independently describes role/ownership gaps and must be inspected
separately. Neither flag proves complete product coverage, approved assertions or hydration
readiness. A resolved owner can remain outside a future extraction selection; T07c must enforce
the execution contract rather than infer it from a preview.

Current direct-source hydration, `hydrate --plan`, configuration/cache identity and saved snapshots
remain unchanged. In particular, existing hydration still semantically extracts selected validation
documents. T07b supplies the separate evidence path needed before T07c can exclude those documents
from product-intent extraction without dropping their presence or citations.

Validation covers role conflicts and defaults, owner eligibility and non-transfer of authority,
actual committed presence/references, exact RDF/SHACL projection, query/viewer agreement and
legacy behavior. Full gate and review outcomes belong in the validation record; this decision
does not claim those gates have completed or that traversal already drives hydration.
