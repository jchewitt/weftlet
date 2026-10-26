---
"@weftlet/toolkit": minor
---

Add `hydrate --plan` and `--json` to inspect committed semantic documents, source approval, cache reuse estimates and document/byte budgets without loading providers or repository adapters. Incomplete scope needs review; corrupt or unavailable artifacts are distinguished from cache misses. Expose the same planner through `planHydration`.

Share selection and cache identities with hydration, fix empty source lists selecting the entire repository, and resolve agent scope against the requested commit. New snapshots use graph-v6 while saved snapshots remain available and valid 0.2.1 semantic artifacts remain reusable. Recursive document traversal and operational-configuration cache reuse remain separate work.
