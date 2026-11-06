# Exact-owner intent retrieval investigation

Status: candidate fixes implemented; Linux tests, browser and packed-install checks
passed. Hosted checks, private acceptance and publication remain separate.
[ADR 045](ADR-045-owner-intent-retrieval.md) records
both fixes and their unchanged-budget acceptance. Two public behaviors were reproduced against the **published
0.8.0 toolkit** at release commit `c3b450e71542476bbca9c69263f428c71f70bda5`.
The consumer has now supplied a sanitized, read-only full-snapshot audit and
original query structure. It confirms owner-intent evidence in the same saved
snapshot but absent from the primary returned page. Upstream has not loaded or
replayed the private graph. Anchor matching versus later ordering remains to be
attributed; neither public result alone establishes the consumer's root cause.

Retain **both public findings** independently of that attribution, as explicitly
requested by the maintainer on 2026-11-06:

- **OI-1: intent coverage reporting.** Returned owner-sourced business contracts
  can coexist with a zero product-intent counter and a missing-intent diagnostic.
- **OI-2: exact-owner first-page retrieval.** An available, direct owner-cited
  product-flow assertion can lose its place to same-source contract competition.

Both remediation criteria are implemented in the candidate; the original released
behavior and consumer evidence below remain the comparison baseline. The consumer audit
is additional evidence for the same owner-intent ticket, not a new extraction or
graph-capacity defect.

## Consumer evidence received on 2026-11-06

The reported installed/resolved CLI is **0.7.5** for toolkit and core. This does
not establish the version of an already-running MCP process. A complete streaming
parse of a **1,116,685,237-byte** saved snapshot visited **573,347 facts** using
the installed classifier; it found **1,196 product-intent facts** overall.

- Manifest content digest:
  `2fe11730912019700e7038edd48ad90b2ad80581055cc42dcae93ed54b0e55af`.
- Whole snapshot-file SHA-256:
  `0cac5d5e6c6c31ef597337860d06d81ccc719b6df5e1e85ca383f934bbc8c531`.
- These identify different representations and are not expected to match.

Exactly **165** facts cite the supplied owner after normalizing slash direction:
**80 productIntent**, **83 contractsAndInvariants**, and **2
implementationAndConsumers** primary-category assignments. The last number is
not the nonexclusive implementation-evidence count. Of the 80 intent facts,
**65** come from document-linker 2.0.0 and **15** from the configured semantic
extractor 1.2.0. All have declared source authority, inferred assertion authority,
and absent `sourceRole`; 73 remain unreviewed and 7 have deterministic review
status. Intent predicates include containment/references and semantic ownership,
implementation, emission, consumption and sourcing relationships. These counts
do not establish their truth or relevance to a particular task item.

| Report | Snapshot/query relationship | Returned page coverage: intent / contracts / implementation / validation | Reachable facts |
| --- | --- | --- | ---: |
| A: primary first page | Original owner + task + 3 checklist items + 8 changed files; depth 3, 60 facts, no continuation input | 0 / 11 / 27 / 25 | 459,338 |
| B: focused first page | Different query on the same snapshot/digest | 1 / 20 / 36 / 19 | 400,173 |
| C: earlier page | Different snapshot; keep separate from A/B | 0 / 10 / 30 / 26 | Not supplied |

A and B each return 60 facts, report truncation and a reached depth limit, and
provide continuation. Their coverage counts overlap and must not be summed as
distinct facts. B's one owner-cited intent assertion is semantic, inferred and
unreviewed. It is a positive same-snapshot witness, **not an unchanged-query fix**.
The reported file modification times identify artifacts, not execution logs.
No query replay, hydration, model call, install, review or graph write occurred
during the consumer audit.

This establishes **returned-page/query-selection absence despite saved owner
intent**, rather than snapshot-wide owner-intent absence. Category reporting
alone cannot explain A: the same classifier identifies 80 owner-intent facts in
the saved data. It does not yet establish that all 80 entered A's reachable set.
The remaining small check is whether the original parsed owner argument, without
slash normalization, directly matches those 80 facts (15 semantic / 65 linker)
under the installed matcher. If all match, they are direct seeds and the missing
page results belong to subsequent ordering/pagination. If they do not, inspect
argument parsing/path matching before assigning that cause. The released matcher
lowercases but does not normalize slashes.

## Confirmed public behavior

The diagnostic used synthetic public saved facts, strict RDF/SHACL validation,
the released `SnapshotImpactQueryService` and `SnapshotGraphDiscoveryService`.
Both queries supplied the exact repository-relative owner path, depth 3 and a
60-fact page. No extraction, model request, private repository access or graph
write occurred. These probes exercise queries; they do not evaluate extraction quality.

| Case | Saved facts | First-page result | Intent catalog |
| --- | ---: | --- | --- |
| Two business contracts extracted from an approved intent source, plus implementation and validation | 4 | `productIntent: 0`, contracts: 2, implementation: 1, validation: 1; all four facts returned | Finds 2 intent-source facts / 3 navigation nodes |
| 150 same-owner contracts competing with one owner-cited product-flow relationship, plus implementation and validation | 153 | `productIntent: 0`, contracts: 58, implementation: 1, validation: 1; the exact product-flow assertion is absent | Finds 151 intent-source facts / 152 navigation nodes |

In the second case the `routesThrough` assertion connects reservation and
fulfillment workflows. It is a direct owner-path match and reachable before
pagination, but ranks **153** (page 3 at 60). Later public pages were inspected
only to diagnose its position, not counted as first-page acceptance. Every fact
remained retrievable exactly once. Repeated first pages were deterministic;
strict validation passed and snapshot data stayed unchanged in both cases.
The approved sources' extracted assertions remained **inferred/unreviewed**.

A further public replay removed `sourceRole` from owner facts, matching the
consumer's legacy metadata. Both first-page results stayed unchanged and strict
validation still passed. In this variant the 0.8.0 catalog found the single
product-flow fact through its two workflow nodes; the contract-only case had
zero intent catalog nodes. This confirms the distinction between existing intent
classification and the newer overlapping source-role facet. It is not a private
query replay, and does not justify rewriting saved source roles.

## Released mechanisms and viewer correlation

1. [Coverage classification](../src/graph/coverage-facts.ts) assigns contracts,
   invariants and `governedBy` relationships to the contracts category before
   considering product intent. Thus `productIntent: 0` does not establish zero
   owner-sourced business rules. The current missing-intent diagnostic uses that
   category count, even when such rules are already on the returned page.
2. [Impact ordering](../src/graph/impact-order.ts) queues facts by distance and
   relationship family. Intent and contract relationships can compete in the
   same `other` queue. [Lane balancing](../src/graph/query.ts) occurs only within
   each already-selected ordering wave; it cannot rescue a later intent fact.
   Supplying `ownerDocument` anchors traversal but does not guarantee that an
   available owner-intent assertion reaches the first page.
3. The [legacy viewer](../src/visualization/visualization.ts) renders that same
   bounded Context Pack and category assignment. Both mechanisms can therefore
   explain an empty intent column without proving missing extraction.
4. The 0.8.0 [intent catalog](../src/graph/discovery-projection.ts) searches the
   whole saved snapshot and allows intent-source evidence to overlap the
   contracts facet. It found the intent-source evidence in both public cases.
   This improves discovery; the release did not change impact ranking or
   regenerate missing evidence. The consumer's absent `sourceRole` does not
   disqualify its already classified product-intent facts from this catalog;
   concept/document endpoints remain eligible. Contract-only evidence without
   `sourceRole: intent` does not gain an overlapping intent facet automatically.
   An actual 0.8.0 consumer catalog check remains separate from this code analysis.

## Next diagnosis and acceptance

- Consumer version, sanitized query structure, immutable identifiers and
  owner-cited classification counts are now recorded above. Complete the direct
  matcher check without replaying or rebuilding the private graph. No private
  source text, node labels, model prompts or raw task values are needed.
- Distinguish source selection/extraction, linkage/reachability, page ranking and
  reporting classification. An empty display category alone cannot choose among
  them. Source ownership metadata is also distinct from an assertion's cited path.
- Preserve both OI-1 and OI-2 public cases as separate regression criteria. Extend
  retrieval coverage to owner + multiple changed-file anchors, task/checklist
  competition, absent legacy source roles, and semantic assertions alongside
  document-linker facts. Returning only containment links is not semantic recall.
  Define any first-page allocation change explicitly, retaining the original
  budget and testing existing consumer-retrieval controls. Do not claim every
  owner assertion is relevant or all can fit in 60 slots.
- Report intent evidence independently of exclusive display categories, retaining
  source approval versus assertion review. Never manufacture intent or promote
  model extraction to an approved rule to make a counter nonzero.
- Preserve facts, provenance, authority, strict validation, snapshot/cache bytes,
  deterministic continuation and truthful limits. Version changed query ordering
  if a fix changes continuation offsets; no rehydration is justified by these
  public query-only findings.

This ticket is separate from the previously reported indirect worker relationship
ranking case. [Validation](VALIDATION.md#exact-owner-intent-evidence-candidate-2026-11-06)
records the completed local checks; hosted qualification, private
acceptance and publication remain separate. A deployable hosting artifact would
not resolve either query issue.
