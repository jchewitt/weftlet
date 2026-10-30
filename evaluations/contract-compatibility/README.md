# Public selected-constraint acceptance

Protocol declared with the B4b implementation before running its acceptance tests. This is a
deterministic mechanism check, not an autonomous-agent usefulness study or model-quality score.
All source material is public authored fixture data; no consumer data or paid provider is used.

Sources and expected outcomes are in
[`compatibility-cases.ts`](../../tests/fixtures/compatibility-cases.ts). Each case has separate
producer/consumer documents containing explicit declarations. The harness commits them in an
independent Git repository, hydrates through the real declaration extractor, real TypeScript
SCIP indexing and RDF/SHACL, then selects original fact IDs. An empty semantic provider prevents
model-generated edges from satisfying the check. Cases do not inject positive graph facts.

| Source case | Expected selected-pair result |
| --- | --- |
| Queue, same stage, producer ≤20 seconds / consumer ≤60 | Compatible constraints |
| Same stage, producer ≤600 / consumer ≤60 | Insufficient guarantee, not contradiction |
| Same stage, producer ≥120 / consumer ≤60 | Disjoint constraints |
| Stored-data, collection ≤600 / execution ≤60, required revalidation | Conditional revalidation, no direct same-stage comparison |
| Different stages, no explicit revalidation | Unknown |
| Missing unit | Unknown |
| Seconds versus minutes | Unknown; no conversion |
| Both versions absent | Unknown; no version equivalence |
| Missing consumer endpoint | Extraction gap and absent assertion, unknown |
| Same contract label in unrelated sensor/billing scopes | Unknown; no contract identity join |
| Additional conflicting producer declaration | Unknown; retain competing evidence |

Retrieval task: starting at `services/collector.ts`, retrieve the stored-data declaration,
select the exact consumer assertion at the shared contract, assess it, then explore the consumer
file's exact `execute` definition and its test references. Bounds: one impact request (200 facts),
one contract neighborhood (2 facts), one compatibility request (2 exact IDs), and two endpoint/
symbol neighborhoods (200 facts each). Assert that the contract page is complete. Path display
parity uses the existing search bounds with up to 20 results and exposes original declaration
text. Query counts are scripted; no autonomous follow-up success rate is claimed.

The fixture's consumer check is also executed at 60 and 61 seconds. That is separate test
evidence; graph results must retain `fulfillment: not-evaluated` and `gateEligible: false`.
Tests assert source approval remains separate from inferred assessment authority, exact retained
fact/provenance equality, RDF projection, full hydration validation, and identical transport JSON.
An unchanged repeat reuses all 23 semantic artifacts with identical snapshot identity/content.
Dirty provider/indexer-unavailable queries preserve saved evidence; draft edits, document renames
and deletions replace or invalidate declarations without advancing the committed snapshot head.

Adversarial tests separately modify in-memory snapshots to test corrupt provenance/authority,
missing storage, relevant gaps and 25 competing assertions with explicit 20-ID output truncation.
These are robustness negatives, not evidence of successful real extraction. The arithmetic test
uses an independent finite-set oracle over 81 operator/boundary combinations and exterior tails.

Run `pnpm exec vitest run tests/contract-compatibility.test.ts src/graph/constraint-comparison.test.ts src/interfaces/graph-compatibility.test.ts`.
Results and supported platform gates are recorded in [VALIDATION.md](../../docs/VALIDATION.md)
and the change PR. This protocol does not replace B6's frozen end-to-end agent tasks, live
consumer rerun, missed-dependency review or official 1.0 decision.
