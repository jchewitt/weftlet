# ADR 042: indirect local relationships under broad anchors

Status: query-only patch. Qualification and consumer status are recorded in VALIDATION.md.
Supersedes ADR 041's impact ordering; its shortest-first path search is unchanged.

## Evidence

The 0.7.2 private replay closes the direct-path report and confirms improved file discovery
and library share. It does **not** close relationship recall: two exact second-hop assertions
remain outside the original 180-fact budget despite zero hub penalty. One is a symbol reference
without a saved call proof; the other is a legacy file consumer. No extraction loss is reported.

The frozen [public regression](../evaluations/indirect-retrieval/protocol.md) independently
reproduces this shape with actual extraction, broad catalog anchors and 192 competing local
setup files. Both assertions exist and are reachable in round two. The baseline returns
178 provenance files but misses both assertions. Per-source diversity alone is insufficient.

## Decision

Use `local-relationship-waves-v3` ordering over the **unchanged reachable set**:

- Retain weighted graph distance and explicit-anchor exceptions from ADR 041. A saved cross-file
  reference with an indexed definition receives the relationship category even without native
  call proof. Do not change its predicate, confidence, authority or citations.
- Separate relationships by weighted distance (0, 1, 2, 3, 4–7, 8+) and predicate family
  (`calls`, `references`, `consumes`, other). Each wave takes two assertions from each populated
  code-relationship bucket and one from each other-relationship bucket. Distances 0–3 each get
  turns so broad near-anchor competition cannot consume every turn before indirect evidence.
- Round-robin provenance sources **within** each bucket. Order each source by focus match,
  distance and stable semantic tie key. Remove the unbounded per-source ordinal added to graph
  distance in v2. All saved facts remain eligible, including repeated-source assertions.
- Local symbol occurrence/definition and project/file membership detail get a separate single
  slot per wave. Unindexed-symbol and generic module-import context follow local evidence unless
  explicitly queried. These are retrieval signals, not proof that an unindexed symbol is external.
- Give every assertion in a wave the same ordering score, then retain the query facade's existing
  evidence-lane balancing. The score is now a wave number, not a distance-plus-diversity value.
  Version continuation tokens and reject prior policies with instructions to restart the scan.

There are no consumer names, target IDs or corpus-specific file selectors in the scorer.
The fixed bucket proportions are a retrieval heuristic, not a universal relevance guarantee.
Larger or equally competitive buckets can still displace relevant assertions. Intent, contracts
and validation retain their evidence lanes; the returned page is not complete product coverage.

## Tradeoffs and boundaries

The same 9,038-fact saved public graph now returns the exact reference at position 17 and consumer
at 15. All 180 output slots remain in the denominator. Source diversity falls from 178 to 71 files;
that is an explicit tradeoff for relationship recall, not lost reachable evidence. Both facts
remain as originally stored, including omitted authority fields on the legacy consumer. The
reference still has no saved call proof; do not describe it as proven invocation or execution.

The existing 36-target call-backed regression and direct-path acceptance remain separate checks.
The private two-target ranking ticket stays open until the original queries are replayed at their
original budgets. Public success cannot establish the private result positions.

No extractor, assembly, semantic-cache, snapshot, persistence, RDF or strict-validation identity
changes. Existing snapshots can be queried immediately without hydration or model calls. The
0.7.1 capacity fix remains intact. The MCP path description is corrected to shortest-first with
exact-target priority, retaining its static-path/non-causality warning.
