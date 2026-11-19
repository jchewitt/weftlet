---
"@weftlet/toolkit": minor
---

Set `WEFTLET_SNAPSHOT_FORMAT=brotli-v1` on a writer to store new snapshots in compressed blocks. Readers open mixed JSON and compact caches. Snapshot delivery exports the original JSON bytes, and retention counts the physical file size. Upgrade every reader before enabling compact writes.
