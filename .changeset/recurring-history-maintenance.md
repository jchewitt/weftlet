---
"@weftlet/toolkit": minor
---

Run recurring snapshot cleanup with `cache retention maintain`, bound to a reviewed managed-root ID and history-policy digest. Each invocation recomputes eligible history under exclusive coordination while preserving current/previous/pinned evidence and reporting protected overages. One-time head retirement stays in reviewed prepare/apply; scheduling is external and no automatic install/hydration cleanup is enabled.
