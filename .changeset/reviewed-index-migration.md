---
"@weftlet/toolkit": minor
---

Move verified legacy SCIP indexes into shared storage with `cache retention prepare-index-migration` and `apply-index-migration`. Each generation keeps its graph and gains a verified reference before its legacy index is removed. Recovery checks the replacement for an interrupted unlink.
