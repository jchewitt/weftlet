---
"@weftlet/toolkit": minor
---

Add opt-in managed-cache coordination across hydration, saved queries, independent comparisons, transfers and viewer operations. Activate a dedicated cache root after quiescing older clients with `cache coordination enable --root <directory> --acknowledge-quiescence`; unmarked caches retain existing behavior. Custom integrations can declare complete operation roots through `withManagedCacheAccess` and consume snapshot files through `withSnapshotAccess`. Started extractor, invariant and guarded storage work finishes before protection is released, including on failure. Retention requires separate operator authorization.
