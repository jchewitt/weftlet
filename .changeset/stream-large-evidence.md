---
"@weftlet/core": patch
"@weftlet/toolkit": patch
---

Remove graph-sized string allocations from canonical hashing and snapshot persistence/reload. Preserve canonical digest semantics, snapshot identities, semantic-cache keys, immutable bytes and atomic publication.

Validate complete RDF subject partitions with the unchanged strict SHACL constraints and global class memberships, stream N-Quads exports, and retain all facts beyond the former 100,000-record query-projection limit. Correct stale README labels for features shipped in 0.7.0.
