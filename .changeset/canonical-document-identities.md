---
"@weftlet/toolkit": patch
---

Fix cross-document semantic extraction assigning both Component and Document to the same repository document. Normalize physical document references consistently with deterministic links, preserving assertions, citations and review authority. Version the extraction cache and snapshot assembly so incompatible old artifacts are not reused; old saved snapshots remain available. The first refresh re-extracts semantic sources, and subsequent unchanged refreshes reuse the corrected artifacts.
