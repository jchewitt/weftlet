# Business-context baseline before 1.0

Status: added at the maintainer's request on 2026-10-28 after publication of the 0.6.0
candidate. This extends the original T01–T10 task list; its completion did not establish
automatic rule-to-function discovery or complete agent exploration. The candidate remains
available for TradePilot acceptance while the work below is assessed. No new release is
announced by this plan.

Consumer update: the physical artifact filename blocker shipped in **0.6.1**, with native
Windows traversal → unchanged repeat → clean comparison passing. Use 0.6.1 for the private
rerun; [validation](VALIDATION.md) records the public release evidence. This storage fix does
not close any of B1–B6 below. Resume B1 and the bounded B2 evaluation after the blocker release.

The maintainer now considers this the main reported consumer blocker and requests the next live
TradePilot test after a new candidate. [The implementation queue](1.0-WORK-QUEUE.md) breaks B1–B6
into bounded increments; B1a exact-node neighborhoods and B1b bounded paths are implemented for the next candidate. This schedules acceptance;
it does not claim an additional private run or a full product-usefulness pass.

The product goal is to let an agent starting with a task or code change retrieve the relevant
product obligations, understand their connections across domains and asynchronous service
boundaries, and inspect the implementations, contracts and evidence behind those connections.
The agent must be able to investigate further without confusing a bounded response with
complete coverage. A functioning extraction/publication pipeline is necessary but insufficient.

## What we checked now

Runtime source baseline: `9b4acffe1c4d35f9fd2f91132c576f8934658677`, the documentation follow-up
to release source `b4c808b9221c5c82f9f7326a310e966d1fee2888`. Both package versions are 0.6.0.
New acceptance tests use that unchanged runtime. Results and commands are recorded in
[the assessment](assessments/pre-1.0-2026-10-28.json) and [validation](VALIDATION.md).

| Acceptance case | Current result | What remains unproven or missing |
| --- | --- | --- |
| **A1 — Business context across an asynchronous or stored-data boundary** | **Bounded mechanism PASS.** An upstream file has no code/symbol connection to the downstream service in the control. Adding a cited workflow handoff makes execution, notifications, mobile and a test reachable. Both producer and consumer freshness obligations survive with their citations and unreviewed assertion authority. An unrelated domain with the same rule label stays excluded. | This is extraction from a deterministic public prose grammar. No live semantic comprehension, actual database/BullMQ delivery, automatic business compatibility verdict or private consumer acceptance is established. |
| **A2 — Progressive agent exploration** | **Existing operations PASS; requested experience PARTIAL.** Small pages through the actual MCP facade exhaust to exactly the larger scan without duplicates. A focused follow-up retrieves the downstream rule. Depth exhaustion is explicit; changing the query rejects an old continuation. | No dedicated exact-node neighbor/path MCP operation with relation/direction filters or explicit unexplored neighbor inventory. Scripted facade requests are not an autonomous-agent usefulness study or a new transport test. |
| **A3 — Multiple services and client packages in one monorepo** | **Configured public fixture PASS.** Real SCIP resolves a re-exported workspace contract used by API and TSX client code. Document relationships connect separately located API, execution and notification services and the client. Repeat hydration reuses all five documents with unchanged snapshot identity/content. | A synthetic pnpm workspace uses explicit source includes/aliases in one indexing program. This is not a full pnpm installation, multiple service builds, Expo validation, automatic workspace discovery or a run against TradePilot. Per-service coverage and real package resolution still need consumer evidence. |

The [three new tests](../tests/business-context-acceptance.test.ts) hydrate an independent Git
repository through the real application, semantic-provider contract, SCIP, document linker,
RDF/SHACL, saved storage and query path. The fixture provider parses only its documented small
grammar; it makes no model request and does not inspect implementation bodies. The control
already includes both sides' documents. The only added source evidence is the collection-to-
execution handoff. It re-extracts one document and reuses four; the next unchanged hydration
extracts zero and reuses five. Prior snapshots remain intact. No facts are manually spliced into
the assembled graph to obtain the positive result.

The two freshness limits (600 seconds at collection, 60 seconds at execution) are deliberately
different. They can be compatible when the consumer checks freshness. The test asserts retrieval
of both obligations and **does not assert a conflict or compliance verdict**. Runtime evidence
and evaluated business invariants are empty. Source approval never approves the model assertion.

Existing routing, query, RDF and workspace-indexing tests were also rerun: **24 passed**, followed
by **3 new acceptance tests passed**. Existing routing negatives reject false same-channel joins
and ambiguous/missing endpoints. Existing indexing checks cover dirty inputs, renames and deletes.
These results supplement, and do not replace, the published release's validation record.

Reproduce the focused assessment from a configured development checkout:

```sh
pnpm exec vitest run tests/business-context-acceptance.test.ts tests/rdf.test.ts tests/routing.test.ts src/extraction/routing.test.ts src/extraction/scip-project.test.ts src/graph/query.test.ts
```

## Subsequent task list

These are bounded pre-1.0 investigations and implementation tasks, not a claim that the features
are delivered. Record decisions and exact acceptance evidence per task. Any deferral must be
explicitly reviewed with the maintainer; do not convert missing evidence into a pass. TradePilot
blockers take priority when its report arrives. Do not modify or audit its application here.

| ID | Task / next action | Acceptance boundary |
| --- | --- | --- |
| **B1** | **Exact graph exploration.** Specify and add bounded node lookup/neighbor expansion and dependency-path exploration through MCP and the shared query layer. | An agent can start from a returned stable node ID, select relation/direction and inspect another business area. Return citations, authority, snapshot identity, incomplete scope, pagination and remaining frontier. Test branches, cycles, ambiguous labels, deleted nodes and stale/mismatched continuations. Keep CLI/MCP/viewer on the same facts; preserve existing `impact.scan`. |
| **B2** | **Evaluate Graphify and current SCIP representation.** Run the fixed public comparison in [the research note](GRAPHIFY-EVALUATION.md) before choosing a code extraction backend or symbol schema. | Compare the current projection, richer use of raw SCIP and pinned Graphify on identical committed inputs. Measure correct/missing/false links, provenance, identity stability, costs and packaging. Produce a keep/improve/replace decision with evidence. Parallel use during evaluation does not mandate shipping two indexers. |
| **B3** | **Resolve business-to-implementation links at symbol/function level.** After B2, define canonical scoped code identities and resolve explicit document paths/symbol references to exact code entities. Evaluate a separate bounded inference pass only where explicit evidence is insufficient. | Named functions, methods, aliases, overloads, same-name symbols and renamed/deleted targets resolve correctly or remain unresolved. Separate a cited declared mapping, a proposed inferred mapping and evidence of actual behavior. Record both document and code revisions/spans for derived links. A reviewer can follow a rule to its implementation and back. Code inference never supplies approval; full automatic documentation generation remains 2.0. |
| **B4** | **Cross-boundary obligations.** Represent and retrieve producer guarantees and consumer requirements through explicit data/event contracts, including applicable stage, domain, units, freshness and version where sources provide them. | Public cases cover a queue handoff, a write/read handoff, compatible differing limits with revalidation, a real documented incompatibility, missing links and same-name unrelated domains. Retrieve both sides and the implementation evidence. Potential model findings remain uncertain; hard failures require explicit approved deterministic rules. A graph link or SHACL pass is not a compatibility verdict. General reconciliation/approval UI remains 2.0. |
| **B5** | **Monorepo selection and coverage.** Assess diagnostics for selected services, client, shared packages, source aliases and excluded/unresolved code; improve the gaps found. | A configured multi-package TypeScript/TSX fixture and the consumer report identify which projects were selected, indexed and actually connected. Test barrel exports, independent service code, external unresolved dependencies and omitted projects. Missing resolution cannot be reported as zero impact or complete coverage. Cross-repository federation is a separate scope decision. |
| **B6** | **End-to-end product acceptance and release decision.** Combine the public evidence, B1–B5 decisions and TradePilot's next candidate report; ship bounded candidate changes as needed. | Predeclare tasks, correct downstream business obligations/implementations, known unrelated matches and query budgets before measuring. Retain actual requests, follow-up decisions and citations. Assess helpfulness and misses separately from hydration success. Complete full hydration/repeat and supported release checks; review any remaining limitations before a versioned 1.0 publication. |

Order: retain this A1–A3 baseline; triage incoming consumer blockers; specify B1 and run the
bounded B2 comparison; use that decision for B3; implement B4/B5 in independently testable
increments; close B6. Each implementation can ship in a minor candidate before 1.0. Changes to
retrieval semantics, extraction/cache identity or snapshot compatibility need explicit decisions
and regression evidence; no silent migration or history rewrite.

## Consumer report to reconcile when available

Retain the private configuration, documents, snapshots and transcripts with TradePilot. Share
only a sanitized report identifying package versions, source/adapter SHA, indexing/document
scope, phase timings, full validation/publication, unchanged reuse and query coverage.

For A1, choose one actual upstream-to-downstream queue or stored-data change and record how the
graph witnesses the handoff, each side's obligations and the associated implementations. Note
whether a relationship came from prose, an explicit mapping, code or an observed trace. For A2,
retain the initial request, follow-up choices and all truncation/continuation states. For A3,
record the expected service/client projects and which were indexed, reached or missing. Have a
human assess business usefulness; an automated pass here is not a replacement.

## Boundary with 2.0

The [2.0 plan](WEFTLET-2.0-PLAN.md) still owns bulk code-derived documentation, durable approval
workflows, cross-source reconciliation management, source-document backfill, the companion
website, hosted AI/billing and unrelated source adapters. This baseline concerns connecting and
exploring local evidence accurately. No service, provider billing, new dependency, source adapter,
automatic write-back, package publication or product-policy change is introduced by this assessment.
