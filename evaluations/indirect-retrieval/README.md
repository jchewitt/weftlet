# Indirect local retrieval comparison

Measured 2026-11-03 on the same saved, strictly validated public TypeScript snapshot.
See the frozen [protocol](protocol.md), [v2 baseline](baseline.json),
[v3 candidate](candidate.json) and [decision](../../docs/ADR-042-indirect-local-relationships.md).

| Measurement | 0.7.2 / v2 | Candidate / v3 |
| --- | ---: | ---: |
| Stored facts / reachable assertions | 9,038 / 9,038 | 9,038 / 9,038 |
| Direct anchor matches | 150 | 150 |
| Returned assertions (depth 3, three pages of 60) | 180 | 180 |
| Exact second-hop targets retrieved | 0/2 | 2/2 |
| Symbol `references` rank | 3,704 | 17 |
| Legacy file `consumes` rank | 1,760 | 15 |
| Returned provenance files | 178 | 71 |

Both assertions are reached in round two. No saved call's target-occurrence proof cites the
reference. File discovery or worker setup is not counted as relationship success. These are
static references/consumers, not proof of runtime invocation. The source-diversity reduction is
reported explicitly; every reachable assertion remains eligible for later pages.

Fixture digest: `32cdfd16ab5335e5473124a82d92896c18b89da70b4b507285102f74c8d29c44`.
Snapshot content digest: `686f82b214bc99e5042ce7d29c70596694901858c04a9343db19cc3616a6303e`.
Full snapshot identity and exact target facts are in both reports. The frozen baseline was
captured before changing ranking. Comparison reuses that saved evidence, without hydration or
model calls. The candidate checks all four evidence-file byte digests before/after querying and
records their aggregate digest. It verifies the full reachable ID set is retained, all 180 actual
service results match calculated ordering including full provenance/authority, and the two exact
target assertions are unchanged. Later ranks are calculated, not obtained with bigger pages.

To reproduce with fresh public extraction and strict publication (no model/provider):

```sh
pnpm evaluate:indirect /tmp/indirect-report.json --retain
```

The sibling `.fixture-root` file identifies the retained public repository. To compare a new
query implementation against those immutable inputs without extraction:

```sh
pnpm evaluate:indirect /tmp/indirect-repeat.json --saved-public-root <retained-public-root>
```

The runner rejects changed fixture source bytes. Fresh extraction may have environment-specific
SCIP artifact identity; use the same saved graph for a policy comparison. The baseline's report
format includes its full manifest and original page metadata; the candidate includes a fixture digest
and preservation summary. Both use the same budgets, target IDs and evidence, not a reduced sample.

The earlier call-backed 36-relationship test remains a separate regression. This focused public
case is smaller than the consumer graph and cannot close private acceptance. TradePilot must
retry its original fixed-budget queries on the same saved snapshot with fresh pagination.
