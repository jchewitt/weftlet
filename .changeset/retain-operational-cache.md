---
"@weftlet/toolkit": minor
---

Reuse built-in Codex semantic artifacts across timeout, retry, concurrency and document/byte-limit changes in user storage. Keep snapshot profiles and full configuration digests distinct, preserve existing workspace behavior and conservative custom-provider identities, and validate every reused artifact.

Read the exact compatible legacy profile without scanning other caches; hydration can retain a validated copy atomically. Add no-model `cache adopt --from-config <previous.json>` with a read-only `--dry-run` to recover completed artifacts after operational settings were already changed. Corrupt or conflicting artifacts remain intact and are reported rather than overwritten. Existing 0.2.1/0.3.0 artifact keys and source provenance are preserved.
