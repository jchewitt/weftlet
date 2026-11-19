---
"@weftlet/toolkit": minor
---

Add explicit `cache retention prepare` and `apply --expect-plan` for upgraded managed cache roots. Preparation and apply use exclusive coordination and the same head/pin rules; apply refuses stale policies/evidence, retires approved heads before dependent snapshots, and syncs per-file removal intents and outcomes. Current/previous/pinned evidence, semantic artifacts, indexes and unknown data remain protected. Old observational reports cannot authorize deletion. Partial failures stop further removal; pending journals/interrupted owners remain blockers for future explicit recovery. No automatic retention target, graph-size cap or provider call is introduced.
