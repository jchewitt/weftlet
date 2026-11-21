# Remove reviewed local history

**Requires Weftlet 0.11.0 or later.** This manual workflow removes only
eligible snapshot/history files from an explicitly coordinated cache. Configurable
history targets and indefinite retention are available in the [history policy](CACHE-HISTORY.md); no 10 GiB build cap applies. After one-time migration, use
[recurring maintenance](CACHE-MAINTENANCE.md) when you want to authorize future snapshot
selection under the same reviewed policy.

## Prepare the cache and policy

Follow [managed-root activation](CACHE-COORDINATION.md) first: stop older clients,
upgrade all cache users, and activate a dedicated ordinary directory. The exact
managed root must be selected; parent scans, child roots and aliases are rejected.
Multiple separately managed roots require separate reviewed operations.

Use [retention declarations](CACHE-RETENTION.md) to name repository profiles, active
heads and additional pins. Current and tracked previous generations are protected.
Undeclared heads protect their references until explicitly retired at an exact ID.
Keep policy files and reports outside the cache. Declare pins for history required by
external reports/reproductions; a graph listing alone is not a permanent pin.

```sh
npx weftlet cache retention prepare --root /path/to/cache --policy ./retention.json --json > prepared.json
```

Preparation waits for active cooperating readers/builders, then holds admission
closed for the entire complete JSON/hash scan. Apply holds it through its repeated
scan and removal. Large caches can take minutes; schedule this manual maintenance
when clients can tolerate waiting or retrying an admission timeout. Existing
snapshots remain intact, but new cooperating queries do not run concurrently with
exclusive maintenance. `--wait-ms` (1–300000, default 10000) changes how long this
command waits for admission/draining; it is not a deadline for scanning or removal. It removes no evidence. Review `canApply`,
`issues`, per-object reasons/dependencies, logical byte totals and recovery notes.
Fix blocked or incomplete preparation rather than editing the generated report.
`--max-entries` and `--max-bytes` bound the preparation scan (bytes per inspected file);
they are not retention or graph-size settings. The plan binds those limits.

The older `plan/check` commands remain observational and produce `canApply: false`.
Their reports cannot be applied. Use `prepare` only after managed-root migration.

## Apply the exact reviewed plan

```sh
npx weftlet cache retention apply --root /path/to/cache --policy ./retention.json --plan ./prepared.json --expect-plan PLAN_ID_FROM_REPORT --json
```

**Removal is permanent.** Use an independently verified private backup when exact
historical evidence must be recoverable. Apply rereads the policy, obtains exclusive
coordination and recomputes the prepared decision. A stale plan removes nothing and
requires new preparation/review. Scan-limit overrides are rejected on apply; change
them during a new preparation. No model call, scope reduction or automatic archive
occurs. At most 10,000 eligible files are accepted per prepared batch.

Approved retired heads are removed first. Each selected snapshot is then removed, followed immediately by its verified companion index if enabled. The remaining head and pin protections apply at every retention target. Queries for a removed historical ID report absence.

### Reclaim companion SCIP indexes

In the retention policy JSON, add the top-level property `"retireCompanionIndexes": true`. Omitting it or setting it to `false` keeps existing index files. Upgrade the clients sharing the cache and generate a fresh prepared plan. For scheduled maintenance, review the changed policy digest and update `--expect-policy`.

A candidate index appears in `objects` with the reason `verified-scip-companion`, its SHA-256 and logical byte count, and its snapshot path in `removeBefore`. The full manifest must name that digest. The index must be an unshared regular file at the unique matching current or legacy path in the same declared profile. Index bytes count toward the target together with the snapshot, which can spare a newer generation. Two generations can have identical index bytes and still own separate files.

Indexes belonging to retained snapshots, unmatched or ambiguous files, digest mismatches and hard links stay in place. A snapshot without a usable index or manifest index digest follows the ordinary snapshot policy. Semantic extraction artifacts remain reusable. After upgrading, repeat preparation even for a previously saved exact plan.

The result lists deleted files, logical bytes, remaining candidates and `journalPath`.
A no-op returns `journalPath: null` and `operationId: null` without writing a journal.
Successful runs report `status: complete` (completion of reviewed actions, not a byte-target guarantee); cancellation or an ordinary I/O failure
reports `partial` and exits nonzero. Completed removals are not rolled back. Keep the
journal, inspect remaining files and reprepare. If a head was already retired, update
only that confirmed retirement declaration before preparing again. In legacy manual mode, a zero-deletion
failure can retry the unchanged plan if all evidence/policy inputs still match. Configured
history targets also account for persistent audit bytes, so a new failure journal requires
fresh preparation even when evidence was unchanged.

## Interrupted operations

Journals live under `.weftlet-coordination/removals`; they contain IDs/checksums and
paths, not model prompts or graph payloads. Each unlink is preceded by a synced intent.
An uncertain journal write leaves a `.pending` marker; process death can also leave a
gate/activity marker. Further maintenance is blocked rather than guessing completion.

Preserve these records and quiesce cache users. Follow [explicit recovery](CACHE-RECOVERY.md)
to inspect and clear supported exact-state blockers. Unknown/damaged records remain blocked;
recovery never replays deletion. If removal stopped after the snapshot unlink, a surviving index has lost its manifest binding. Recovery reports its matching bytes and leaves it on disk. A subsequent prepare treats it as unattributed. Do not remove markers merely because their PID is absent
or their date is old.
The supported boundary is a cooperating local filesystem with upgraded clients;
shared/distributed filesystem and power-loss recovery are not qualified here.

For accounting and larger retained history, see [inspection](CACHE-INSPECTION.md) and
the [configurable retention direction](../CACHE-RETENTION-PLAN.md#outcome-and-evidence).

### Persistent openCAESAR scratch locks on Windows

Starting with 0.11.1, run the same coordinated `cache retention prepare` with the existing policy on a local NTFS volume. Stop older clients and external Gradle or Docker builds before migration. Weftlet drains cooperating clients, then uses Windows PowerShell to open each recognized existing scratch file read-only with exclusive sharing and close it. A missing shell, access failure or incompatible open handle leaves the lock blocking. Prepare and apply each perform the check. The result is a point-in-time check under the cooperative maintenance gate.

The check covers the checksums, execution history, file hashes and build-output cleanup locks of Gradle 8.10.2 under a compiler-created `work/ontology-<UUID>` workspace. It requires an ordinary unshared file in a profile whose repository can be identified from its declaration or verified snapshots. Conflicting repository identities leave the lock unresolved. Inspect `verifiedIdleGradleLocks`, the retained objects marked `verified-idle-gradle-scratch`, and any remaining `activity-requires-coordination` issues. Other platforms, unknown lock layouts and uncoordinated reviews retain the conservative lock check. Leave the scratch files in place. For consumer acceptance, stop after preparing the preview and review eligible bytes and protected overage.

### Diagnose historical compiler workspaces

The successor to 0.11.1 also recognizes the two historical compiler names, `work/ontology-<snapshotId>` and `work/ontology-<snapshotId>-<operation UUIDv4>`. The parent must match a unique fully inspected snapshot in the same profile with a consistent repository and commit. A commit prefix by itself is insufficient. The existing four Gradle locations, coordinated admission, local NTFS exclusive read, file revisions, and link checks apply. Keep the existing policy for the migration preview.

Read the `objects[].reasons` at the path of each `activity-requires-coordination` issue in prepared JSON. An unknown layout, absent historical snapshot, ambiguous profile or overlapping snapshot names remains blocked. `lock-held` means Windows returned a sharing or lock violation on the exclusive open. `exclusive-probe-inconclusive` covers permissions, volume and other probe failures. A changed or inaccessible revision stays blocked. Resolve reported ownership or activity before preparing again. Keep the original lock files and snapshots available for review.

If an old snapshot is already absent, or the plan selects the last snapshot that proves a workspace’s ownership, an operator can preserve that knowledge in the external retention policy. Verify the compiler run and its repository using independent build records. Copy the exact `rootId` and workspace directory’s `revision` from the prepared plan. The optional `historicalCompilerWorkspaces` array accepts entries of this form:

```json
{
  "profile": "api",
  "directory": "ontology-a1b2c3d4-profile",
  "rootId": "43cd2f60-2134-477a-9def-3d90c36aaf81",
  "physicalIdentity": "12:345",
  "owner": "build-team",
  "reason": "Compiler run verified against the archived build record"
}
```

Use actual identifiers and a declared profile. Keep this record if retiring the last matching snapshot. Prepare again after any reviewed policy change. The declaration is specific to one directory on one managed root. A replacement directory or conflicting snapshot ownership stays blocked. The exclusive read runs on every coordinated prepare and apply. Leave workspaces with unknown origins undeclared.
