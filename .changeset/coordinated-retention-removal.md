---
"@weftlet/toolkit": minor
---

Add explicit `cache retention prepare` and `apply --expect-plan` for upgraded managed cache roots. Preparation and apply use exclusive coordination and the same head/pin rules; apply refuses stale policies/evidence, retires approved heads before dependent snapshots, and syncs per-file removal intents and outcomes. Current, previous and pinned snapshots stay protected. Existing policies retain SCIP indexes. After a partial failure, use the explicit recovery workflow for pending journals or interrupted owners.
