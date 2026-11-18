# Measure local graph storage

Included in the **0.10.0 release scope**; see [release status](../RELEASES.md).
Use these commands before choosing
retention or a new snapshot representation. Both commands read saved files and
emit reports; they work without a model, Docker, Git checkout or loaded adapter.
They leave snapshots, semantic artifacts and heads unchanged.

## Inventory the cache

```sh
# The user-wide ~/.cache/context-graph tree, including old profiles.
npx weftlet cache usage

# Include this project's configured workspace and semantic stores as well.
npx weftlet cache usage --config context-graph.config.json --json

# Inspect specific roots (repeat --root); overlapping roots are counted once.
npx weftlet cache usage --root /path/to/cache --root /path/to/other-cache --json

# Read complete recognized JSON files and hash snapshot/artifact/SCIP bytes.
npx weftlet cache usage --root /path/to/cache --verify --json > cache-usage.json
```

Without `--config`, the command inventories the standard user cache; it does not
search every checkout on disk. `--config` adds its resolved storage roots to that
user cache. Explicit `--root` values replace that selection and cannot be combined
with `--config`. Missing roots are reported without being created.

The JSON report includes per-object size, class, profile, inspection state, head
references and protection notes. Classes cover snapshots, heads, semantic
artifacts, mapping proposals, SCIP indexes, comparison receipts, lease markers,
temporary files and unknown objects. Repository totals use the repository identity
recorded in snapshot manifests within each profile; this is profile attribution,
not proof that every file belongs to that repository. Mixed profiles are ambiguous;
unbound shared artifacts remain unattributed.

Three size columns answer different questions:

- **Logical bytes:** file lengths, including each hard-link name. Directory lengths
  are excluded; a symbolic link contributes its own stored length, never its target.
- **Unique logical bytes:** count each observed device/inode identity once. This
  uses exact integer identities. It does not detect reflinks or shared extents.
- **Known allocated bytes:** filesystem block accounting, deduplicated by observed
  identity. Windows allocation is reported as unknown. Compression, reflinks and
  filesystem metadata mean this is not a promise of reclaimable free space.

A default snapshot read stops after its manifest and reports `metadata-only`.
A valid prefix can coexist with a corrupt tail. `--verify` parses the complete
recognized JSON document and computes SHA-256 for snapshots/artifacts; SCIP gets
byte hashing. Small head/receipt/lease metadata is fully parsed even without that
flag. These checks do not rerun SHACL, validate semantic reuse or recompute the
producer's logical graph digest. Byte-identical groups require full byte hashes;
they are information for later policy work, not deletion candidates.

Head references are visible, but an old head is not automatically an active scope
or permanent pin. Lease-marker presence indicates possible activity, not proof of
a live process or abandoned work. Pins, archive state and active registrations are
`not-evaluated` by inventory. Use the separate
[retention review](CACHE-RETENTION.md) to evaluate a declared policy. Unknown and unreadable objects remain
explicit. No file age authorizes cleanup.

The default bound is 100,000 entries (up to 1,000,000 with `--max-entries`) and
8 GiB per fully inspected file (`--max-bytes`). Manifest previews have a separate
16 MiB record/read bound. Limits and read failures are reported, not hidden. An
incomplete scan, malformed inspected object or dangling head gives exit status 1.
A scan is observational, not a globally frozen transaction; rerun after concurrent
writers finish if it reports changed files. SIGINT/SIGTERM cancels cooperatively.

Reports include local paths, repository identities and snapshot metadata. Keep
consumer reports private unless reviewed; source text, raw prompts and artifact
contents are not included in the report.

## Profile one saved snapshot

```sh
npx weftlet cache profile --snapshot SNAPSHOT_ID --config context-graph.config.json --json
npx weftlet cache profile --file /path/to/snapshot.json --json > snapshot-profile.json
```

`--snapshot` resolves exactly that saved ID; absent evidence fails without hydration
or substitution. `--file` needs no project configuration. The profiler streams the
whole JSON and retains a manifest or one record at a time, plus bounded repetition
maps. It reports:

- physical file bytes and SHA-256;
- compact UTF-8 JSON bytes by evidence section and top-level fact field;
- repeated complete node payloads, provenance, strings and diagnostics;
- recorded document/index coverage, where available, separately from graph bytes.

Field value bytes exclude the field name; `compactKeyAndValueBytes` adds its encoded
key and colon. Section arrays include brackets and commas. Physical-minus-compact
bytes can include formatting and unknown fields, so that difference is not labeled
as whitespace. Unknown root fields are listed rather than silently attributed.
Full-payload repetition distinguishes records with the same ID but different labels
or provenance. Categories overlap: do not add them together as predicted savings.
No values from repeated strings or source records are printed.

Defaults are 8 GiB total, 16 MiB per record/token, and 100,000 distinct fingerprints
per repetition category. Use `--max-bytes`, `--max-record-bytes` and `--max-distinct`
to adjust them explicitly (distinct maximum 1,000,000). When distinct tracking fills,
`complete: false` and untracked occurrences describe that category; every record
still contributes to byte totals. Oversized records, malformed JSON, excessive
nesting or a file changing during a read fail clearly. A completed profile proves
JSON/basic snapshot structure and byte accounting, not strict graph validation.

Older manifests do not record source-document byte totals. That value is `null`,
not estimated from artifact count. A small Markdown selection can accompany a
large indexed code graph.

## Use the measurements

The [public corpus study](../assessments/storage-profile-r2.md) profiles real SCIP
output with deterministic public prose extraction. Run `pnpm benchmark:storage`
in the source repository to reproduce it without external model calls.

R2 provides measurements. R1 stops accumulating successful comparison copies;
R3a adds [declared retention reviews](CACHE-RETENTION.md). R3b will add coordinated
leases, active-scope registration and reviewed removal. R4 will add configurable
history-retention targets and indefinite retention, and R5 will qualify compact
storage using these measurements. The proposed retention target will not cap a
necessary graph or build. R2 itself adds no eviction policy or prune command. Keep current evidence and semantic artifacts until a
reviewed retention plan can identify safe recovery and deletion boundaries.
