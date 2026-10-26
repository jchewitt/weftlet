---
"@weftlet/toolkit": minor
---

Report semantic hydration failures with opaque source IDs, safe failure categories, elapsed time, timeout scope, final completed/remaining counts and recovery guidance. Preserve the initiating failure during concurrent cancellation, retain completed artifacts and published snapshots, and keep private provider messages out of reports.

Map source IDs locally through hydration preview; use `hydrate --json --quiet` for semantic failure JSON on stderr. Distinguish missing provider infrastructure from unknown provider errors, and keep extraction/cache identities and timeout defaults unchanged.
