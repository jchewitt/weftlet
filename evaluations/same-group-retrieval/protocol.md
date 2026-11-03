# Same-group retrieval comparison

Frozen before changing production ranking, 2026-11-03 (America/Chicago).
Baseline: `35ac16ffff8be3847833b3880131d1f62d7909d4`, released 0.7.3.
The three `v3-*` study modules preserve that ordering for reproducible comparison;
production never imports them.

Use the actual TypeScript extractor, strict SHACL and persisted graph from
`tests/fixtures/same-group-project.ts`. No semantic provider calls. There are 136
worker files, eight repeated method uses per worker, 48 file-scope import controls,
12 test files and a broad producer file with 48 unrelated interfaces. The query is
`changedFiles: ['src/catalog.ts']`, depth 3, three pages of 60. All 180 returned
assertions count. Freeze exact targets by source/line/native symbol before ranking:
worker-077.ts, line 25, `score`, and its corresponding legacy file consumer.
Neither target has supporting saved call proof. Count all 136 same-line reference /
consumer pairs (272 assertions), including peers not expected to fit the budget.

- **Specific:** the producer and two worker symbols refer to RARE; 134 other workers
  refer to COMMON. Imports outside indexed named declarations and test references
  must not inflate the production referrer count. The target reference is a later
  occurrence in its source. Its consumer is first in its v3 source/group. Both are
  reached in round two and miss the baseline 180-result budget. The baseline groups
  contain 1,420 references / 196 sources and 908 consumers / 196 sources. The requested
  positive outcome is both exact saved assertions within the same three pages.
- **Symmetric:** all 136 workers refer to RARE. The producer connection no longer
  distinguishes those workers. Report full pair recall and explicitly retain the
  ambiguity; do not choose a new successful target or promise universal bounded recall.

Compare ordering on the SAME saved graph, with the same direct/reachable sets. Record
fixture/content digests, exact returned IDs, target group/source ordinals, predicates,
provenance/authority, source diversity, pair recall, truthful limits/continuation and
byte fingerprints of all evidence files. No hidden pruning, extra pages or new
extraction may create a comparison pass. Retain the prior 36-target retrieval and
unconfirmed two-target regressions, explicit library queries and shortest-first path
controls. A public pass does not close the private ticket.

The shared-reference chain is producer → shared symbol ← other indexed symbol.
It is a structural relevance signal, not forward invocation or runtime causality.
Native/legacy matching locations alone are not identity edges. Any legacy priority
must require the saved native symbol key and matching source revision/digest/extractor,
without adding a graph join or changing confidence/authority.
