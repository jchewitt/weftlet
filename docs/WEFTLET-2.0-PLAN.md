# Weftlet 2.0 product plan

Status: proposed direction captured at the maintainer's request on 2026-10-26.
Planning baseline: published `@weftlet/core` and `@weftlet/toolkit` **0.2.0**. The consumer
identity fix has since shipped in **0.2.1**, with release evidence in
[VALIDATION.md](VALIDATION.md). **“2.0” names this product plan; it does not announce npm
version 2.0.0, a delivery date, or a single large release.** Changes should ship through small,
reviewed milestones using the existing Changesets workflow.

The maintainer supports developing this direction. Detailed schemas, hosting, commercial
terms and policy choices below remain proposals to resolve before their dependent work.
This planning increment implements no features, changes no license and provisions no services.

## Product outcome

Help teams establish and maintain an agreed set of product rules, connect those rules to
implementation and evidence, and make the relevant rules available to development agents.

A team should be able to adopt Weftlet in a poorly documented project, generate a bounded set
of cited proposals, approve or correct them, publish documentation through its chosen source
adapter, and see subsequent disagreements between intent, code and other documents.
An owner can confirm that the current implementation expresses the intended business rules
and establish an initial documentation baseline through explicit review.

The first complete demonstration is: a repository with sparse documentation produces useful
candidate rules; a reviewer resolves a real disagreement; a documentation PR is merged; an
agent retrieves the approved, scoped decision through MCP and identifies any remaining code gap.

## Current capabilities and gaps

| Area | Available in 0.2.0 | Work proposed here |
| --- | --- | --- |
| No documentation | TypeScript/code relationships, configured contracts, tests and supplied runtime/routing evidence; semantic sources may be empty | Cited implementation summaries and candidate business rules derived from code |
| Partial documentation | Selected committed Markdown/text extraction, document links, scoped coverage/gap reports | Cross-source reconciliation, amendment proposals and approval workflow |
| Evidence authority | Implementation, tests, observations, inferred/draft facts; source approval separated from model assertion review | Durable derivation history and approvals bound to specific claims/content revisions |
| Agent decisions | Task/checklist text helps querying and source selection | Capture explicit accepted decisions as durable evidence before polished docs exist |
| Queries | Local saved snapshots, RDF/SPARQL/SHACL, impact scans, continuation, CLI/MCP and draft overlays | Domain-scoped approved rules, exceptions and unresolved conflicts available to agents |
| Providers | Codex CLI with ChatGPT or explicit API-key mode; tested module extension contract | Tested direct API adapters and an optional Weftlet-managed inference service |
| Setup and UI | CLI init/config/doctor; bounded HTML/DOT/SVG viewer | Assisted setup and optional hosted review/management application |
| Source adapters | Repository evidence plus extractor/invariant extension points | Explicit proposal/publication capabilities; GitHub Markdown first, other sources later |

Current approval uses document paths/globs. Generated text written under an approved path could
appear to come from a declared source, even though model-extracted assertions remain unreviewed.
That is a prerequisite to address before automatic documentation backfill. Current citations
also do not preserve a complete code → generated document → re-extracted assertion lineage.
Existing gap reports do not establish completeness of a project's business requirements.

## Immediate priority: consumer integration findings

The maintainer supplied a consumer integration report on 2026-10-26. The
[consumer hardening and 1.0 task list](RELEASE-1.0-PLAN.md) records its seven items and acceptance
criteria. The repository-document identity/kind patch shipped in 0.2.1 and passes upstream
regressions; genuine consumer acceptance remains pending. Work through the other improvements
toward an official 1.0 independently of the companion platform described here.

| Intake item | Status | Next action |
| --- | --- | --- |
| Consumer integration report | Received; task list recorded | Preserve private evidence with the consumer and use public-safe upstream reproductions |
| Reproduction and severity | Reported identity/kind blocker has a passing upstream regression | Obtain the genuine consumer re-run; keep validation latency a separate investigation |
| Fix/release mapping | T01 upstream patch published in 0.2.1; T02–T07 remain open | Complete bounded follow-ups and genuine consumer acceptance before official 1.0 |

For each finding, retain toolkit/version, repository SHA, relevant configuration and scope,
exact command or MCP request, expected/actual behavior, logs/exit status, snapshot identity,
dirty-worktree state and provider details where relevant. Distinguish infrastructure failure,
configuration error, extraction gap, incorrect relationship, policy violation and usability issue.
Use the [consumer trial](CONSUMER-TRIAL.md) for evidence collection. Private application code,
logs and product documents stay with the consumer; publish only reviewed reproductions and summaries.
Consumer findings do not authorize modifying the original source application from this repository.

## Proposed product boundaries

- **Local toolkit:** indexing, immutable evidence, generation orchestration, local review data,
  queries and MCP continue to work in a repository. Saved queries remain available when a
  model, website or network is unavailable, with explicit version/freshness limitations.
- **Optional companion service:** project connections, review queues, decisions, publication
  jobs, history, synchronization status and organization management. Customers choose which
  proposals and source excerpts leave their machine; whole-repository upload is not a prerequisite.
- **Source adapters:** read versioned evidence, prepare a target-specific proposal, and apply it
  through explicitly supported operations. Read access does not imply write capability.
- **Model providers:** perform bounded extraction/generation under the same structured-output,
  citation, timeout, cancellation and cache contracts. Provider output cannot grant approval.

Initially, published documentation on the selected GitHub branch is the authoritative document
destination. The companion tracks proposals and decisions without silently becoming a competing
source of truth. Review decisions and their provenance must be exportable in a versioned format
usable by the toolkit; access to existing evidence cannot depend on continued subscription.

## Evidence and decision semantics

Define these records before the website depends on them; exact field names remain an ADR task:

| Record | Required meaning |
| --- | --- |
| Evidence | Source identity, revision/commit, digest, citation span, extraction method and scope |
| Proposed claim | Stable identity and revision; kind (implementation description or proposed requirement); statement, conditions, domain and exceptions; supporting/contradicting evidence; inference and uncertainty |
| Derivation | Links from source evidence through model output, generated documents and subsequent extraction; provider/model/prompt identities |
| Decision | Authorized actor, exact claim/content revision, scope, explicit meaning (accuracy review or adoption as intent), action, timestamp/reason and any superseded decision |
| Publication | Destination identity/base revision, proposed diff, idempotency identity, PR/write result and published revision |
| Reconciliation | Applicable rule versions, compared source revisions, potential conflict or implementation gap, and resolution status |

Preserve these distinctions throughout extraction, RDF, queries, visualization and write-back:

1. Code supports statements about implementation. Tests support what was checked; a test-file
   link does not prove execution. Runtime traces describe observations for their recorded scope.
   Owners can explicitly adopt a proposed rule as intent; model confidence cannot do that.
2. Source approval and approval of an extracted assertion are separate. Approval is scoped to
   content/claim revisions and authorized actors, not inherited merely from a file location.
3. Re-ingesting generated text preserves its derivation and does not create independent
   corroboration or automatically increase confidence or authority.
4. Code changes can stale supporting evidence or implementation summaries. They do not revoke
   or rewrite approved business intent. Superseding intent requires a recorded decision.
5. Decision status, publication status, graph freshness and implementation compliance are
   separate. Approval, opening a PR, merging it and refreshing a graph are distinct events.
6. Scope includes domain, conditions, applicable population/version and exceptions. Fourteen-day
   and thirty-day rules may legitimately coexist in different scopes. A newer document does
   not automatically override another domain or a shared contract's owner.
7. Model-identified conflicts remain potential conflicts until reviewed or deterministically
   established. Only explicit approved deterministic rules become hard CI gates. Missing required
   evidence remains unknown/incomplete, not a pass.
8. Source text is evidence input. It cannot authorize writes, impersonate an approver or instruct
   the extraction process to alter its permissions. Approval records need a verifiable trust basis.

## Delivery sequence

M0 consumer hardening is in progress; M1–M7 remain proposed work. Each should be split into
independently testable PRs and retain saved-snapshot compatibility; schema changes need an
explicit migration ADR.

| Milestone | Depends on | Deliverable and completion evidence |
| --- | --- | --- |
| **M0 — Consumer hardening** | Identity patch 0.2.1 shipped; [1.0 task list](RELEASE-1.0-PLAN.md) | Complete bounded setup/reuse/diagnostics/coverage improvements and genuine consumer acceptance. Release independently of the companion platform. |
| **M1 — Claims, lineage and approvals** | M0 triage | Versioned records, durable derivation, revision-scoped approvals, actor trust and explicit legacy handling. Prove generated documents cannot acquire approval through paths or repeated extraction. Verify persistence/RDF/projection/query equivalence and old-snapshot readability. |
| **M2 — Code-derived drafts** | M1 | Opt-in generation for selected TypeScript modules using existing local Codex first; structured candidate claims and Markdown rendered from those claims. Demonstrate no-doc and partial-doc fixtures with citations, unknown rationale, bounded cost, cache reuse and rename/delete invalidation. |
| **M3 — Decisions and reconciliation** | M1–M2 | Capture explicit accepted requirements/decisions, compare changes from code and documents, distinguish scope differences from conflicts, and propose focused amendments. Demonstrate a resolved documentation disagreement with a remaining implementation gap. |
| **M4 — Review website and GitHub publication** | M1–M3 | Thin optional application using local generation, review bundles, scoped approvals, GitHub Markdown PRs and publication/refresh tracking. Demonstrate the entire review → merge → MCP workflow, including stale revisions, human edits and failed/retried publication. |
| **M5 — Managed inference and usage** | Stable extraction contract; M4 project identity | One tested hosted provider behind a Weftlet project key; usage ledger, budgets, metering and billing/recovery semantics. Preserve local Codex; add direct BYOK adapters individually. Prove isolation, bounded spending, cancellation and retry accounting before a paid pilot. |
| **M6 — Guided onboarding** | M0 findings; relevant M2/M4/M5 capabilities | Repository discovery, concrete config recommendations, execution-mode choice, upload/cost preview, small initial run and actionable diagnostics. Prove setup in independent supported projects without overwriting existing integration or approving intent. Deterministic setup improvements can ship earlier. |
| **M7 — Further adapters and offerings** | Evidence from the first complete workflow | Evaluate Figma, Trello, GitHub Projects, Canva or other requested sources one at a time. Document supported reads/writes and validate one adapter before expanding. Consider enterprise/self-hosted service requirements after the hosted pilot. |

### M2: bootstrap without manufacturing intent

Begin from the existing implementation graph and selected code/tests. Produce cited implementation
summaries, candidate rules, conditions/exceptions and questions requiring an owner. Render drafts
from the same structured claims used by the graph, avoiding a mandatory prose-generation then
prose-re-extraction round trip. Generated descriptions remain useful and queryable before approval,
with their status visible. Commit-only generation remains the initial reproducible baseline;
support for working changes must be explicit and retain draft identities.

Test dead or conditional code, ambiguous names, unsupported interpretations and behavior that could
be a bug. Selecting a module does not establish exhaustive coverage of its business rules.
Changed inputs invalidate affected generated claims; unchanged artifacts can be reused. Keep the
last valid snapshot/proposals when generation fails. No automatic generation during ordinary queries.

### M3: intent created during development

Capture concise, explicitly accepted decisions with their source instruction and acceptance event.
The actual owner instruction can be recorded before a formal document exists; an agent's proposed
interpretation retains proposal status. Do not treat every prompt, task argument, plan or completed
code change as approved intent. Review any generated paraphrase independently of the original source.

Compare code → documents, documents → code, and documents → documents. Group evidence by domain
and shared contract, retain contradictions and require explicit resolution of competing claims.
If a reviewer approves a thirty-day refund policy while code enforces fourteen days, publish the
decision/documentation and keep the implementation gap open. Confidence or recency alone cannot
select the authoritative rule. Capture new discoveries separately from frozen evaluation expectations.

### M4: review, publication and agent access

Review coherent batches by capability/workflow, emphasizing consequential changes and unresolved
questions. Show the proposed statement, citations/source revisions, existing rules, related code/tests
and exact destination diff. Offer approve, edit, reject and request-clarification actions. If bulk
approval is supported, bind it to an explicit immutable set of claims and revisions.
Make approval meaning explicit: confirming an implementation description's accuracy records that
review; adopting a requirement as product intent is a separate decision.

Use GitHub Markdown and PR creation as the first source-write workflow. Preserve human edits;
generated sections can refresh under an explicitly configured policy. Check destination revisions
before applying updates, use idempotent operations, and show conflicts/failures rather than overwrite.
Opening a PR does not mark documentation published. For the initial integration, publication on the
configured branch establishes the effective documentation revision; any earlier effective-decision
policy must be explicitly designed and displayed.

MCP should return relevant approved rules and exceptions, their revisions and provenance, unresolved
conflicts, implementation gaps and synchronization/freshness status. Cloud and local views must agree
on the underlying facts. Historical or draft evidence remains usable with labels and cannot silently
satisfy current-diff validation. MCP access improves consistency but does not prove model compliance.

Before a shared hosted pilot, validate project/tenant isolation, authenticated review permissions,
export/deletion/retention behavior, browser interaction and accessibility, and failure recovery.
Choose the hosting stack and operating budget in a separate design decision.

### M5–M6: execution choices and setup experience

| Execution choice | Intended behavior |
| --- | --- |
| Local Codex | Preserve the existing developer login and configured local CLI. No mandatory API billing or hosted generation. |
| Customer provider | Add supported direct API adapters with credentials on the chosen execution side. Decide explicitly whether any hosted BYOK mode stores customer secrets. |
| Weftlet-managed AI | Local tooling sends selected extraction/generation inputs to a hosted API using a project-scoped Weftlet key; the service invokes a supported provider and returns validated, cited results. |

Separate project/service authorization from upstream model credentials and business-rule approval.
Individual ChatGPT/Codex login sessions stay on the developer's machine. Managed inference must use
provider accounts and terms suitable for the offered service. Never silently fall back from local or
customer-paid execution to Weftlet-billed inference, or change models during recovery without policy.

Show selected source scope, model, estimated usage, budget cap and actual usage. Establish spend
reservations/limits, cancellation, timeouts, provider failure reporting, retry/idempotency behavior,
cache accounting and reconciliation of uncertain charges. Distinguish actual provider consumption
from an estimate; bytes/documents alone do not establish a price. Credentials stay out of configs,
source control and logs. Live tests require explicit bounded budgets; use deterministic fixtures in CI.

Guided setup should inspect the repository first, then suggest roots, documentation scope, TypeScript
projects/aliases and configuration. AI may help with ambiguous choices. Show concrete proposed
changes and data that would leave the machine before the first cloud operation. Make the first run
small, explain missing prerequisites, and preserve an existing setup. Do not advertise unsupported
languages, frameworks, providers or adapter write operations. The cloud dashboard can then show
project readiness, coverage, progress, review batches and usage.

## Evaluation and release criteria

Use public-safe fixtures covering no docs, partial docs, stale tickets, conflicting documentation,
same wording in different domains, changed requirements and asynchronous consumers. Freeze expected
findings before measurement, and supplement deterministic checks with separately reported, budgeted
live-model evaluations and a private real-project pilot.

Required cases include invalid/misattributed citations, generated-doc feedback loops, approval under
an approved directory without content review, stale/forged/unauthorized approvals, changes after
approval, rename/delete, supersession, conflicting effective scopes, concurrent reviewers, human edits,
duplicate/retried writes, partial publication failure, offline saved queries and stale MCP clients.
Hosted work adds tenant isolation, credential handling, cancellation and usage/billing recovery tests.

Record source/config/model revisions, expected relationships, retrieval within declared budgets,
missed consumers, incorrect claims, useful discoveries, review time, edits/rejections, query/generation
latency, cache reuse and cost. Approval rate alone is not accuracy. Set quality/performance targets
after obtaining the first baseline; do not invent pass thresholds or imply complete business coverage.

Keep deterministic tests, provider-dependent integration tests, browser tests and real-project
evaluation distinct. Existing browser/live-authentication, larger-graph and genuine fresh-cloud
restoration gaps remain tracked in [ROADMAP.md](ROADMAP.md) and
[ENVIRONMENT-VALIDATION.md](ENVIRONMENT-VALIDATION.md); this plan does not close them.
Only advertise capabilities after their relevant validation. Preserve the current core/toolkit
boundary, snapshot provenance, licenses and supported local installation through each increment.

## Commercial direction and decisions still open

The proposed commercial value is ongoing rule review, reconciliation and source synchronization.
Managed AI reduces setup friction and can be offered separately from the collaboration service.

| Offering | Proposed scope |
| --- | --- |
| Open-source toolkit | Local extraction/graphs/queries/MCP, portable decision records and file workflows |
| Hosted companion | Shared review queues, permissions/history, source synchronization, managed PRs and organization administration |
| Managed inference | Included usage or transparent metered credits with explicit budgets; customers can also choose local tools or supported BYOK |
| Enterprise options | Evaluate self-hosting, organizational controls, deployment needs and support from customer evidence |

No prices, margins, provider commitments or subscription terms are set. Keep workspace/team pricing
and AI consumption understandable and separable. Validate review burden, recurring usefulness and
actual model/hosting cost before choosing a pricing model.

The recommendation is to retain Apache-2.0 for the toolkit and evaluate the companion's commercial
license separately. The maintainer is open to future licensing changes, but no change is selected.
Existing Apache releases retain their granted permissions; future changes require the rights to
the affected code and preservation of applicable third-party licenses, notices and attribution.

Resolve these decisions in small ADRs as their milestones approach:

- Claim identity, derivation format, approval authenticity, revocation/supersession and legacy migration.
- Domain/shared-contract ownership, scope/exception resolution and when approved decisions take effect.
- Canonical source selection, review-record storage/export and local/cloud synchronization protocol.
- Companion repository/layout, hosting stack, identity/tenancy, retention and operating budget.
- First managed provider, direct versus hosted BYOK, supported models and provider commercial terms.
- Usage units, cache/retry/failed-job charges, budget enforcement, pricing and billing policy.
- Adapter-specific write capabilities, revision checks and failure recovery.
- License/product boundaries and any enterprise/self-hosting commitments.

## Next handoff

1. Obtain a genuine consumer re-run of the published 0.2.1 identity/kind patch under M0.
2. Complete the remaining [1.0 tasks](RELEASE-1.0-PLAN.md) and review acceptance without waiting for the website or managed AI.
3. Design M1's minimal records and compatibility rules, then implement M2 on bounded public fixtures.
4. Review real extraction/review results before committing to hosted scope, paid operation or more adapters.

Maintain this plan as milestones become concrete, linking implementation PRs, ADRs and validation
evidence. Keep [ROADMAP.md](ROADMAP.md) as the concise index of delivered capability and remaining work.
