---
"@weftlet/toolkit": patch
---

Accelerate full SHACL validation by indexing all assertion triples in a temporary union graph. Preserve the unchanged constraints, failure diagnostics, named-graph queries and provenance; no validation result is skipped or reused. Add negative parity regressions and a bounded public scaling benchmark.
