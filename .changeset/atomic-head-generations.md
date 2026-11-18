---
"@weftlet/toolkit": minor
---

Track the current and previous distinct published snapshot together in one atomic head record. Repeating publication of the same snapshot preserves its rollback reference and head bytes. Legacy heads remain readable; inventory and retention reviews account for both generations, with additional manual rollback declarations and pins retained. Scoped library consumers can inspect `readHeadState` through `withSnapshotAccess`. This prepares safe history retention without enabling removal, changing graph identities or capping graph size; upgrade all writers before relying on managed-cache coordination.
