---
"@weftlet/toolkit": patch
---

Accept `semantic.timeoutMs: 600000` for approved ten-minute extraction attempts. Raise the configuration ceiling from five to ten minutes while keeping the two-minute default, finite positive integer validation, cancellation and retry limits unchanged. Compatible Codex artifacts remain reusable after this operational change; the snapshot configuration identity still changes.
