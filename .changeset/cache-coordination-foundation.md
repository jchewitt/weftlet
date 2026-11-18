---
"@weftlet/toolkit": patch
---

Add an internal, cross-process cache coordination foundation and operation-scoped
snapshot access, with interrupted-owner and immutable-byte regressions. Retention
inspection recognizes its activity markers. Production lifecycle adoption,
coordinated removal and retention-policy application remain separate work; this change does
not enable pruning or alter existing application access.
