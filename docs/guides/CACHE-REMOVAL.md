# Remove reviewed local history

**Candidate after 0.10.0; not yet published.** This manual workflow removes only
eligible snapshot/history files from an explicitly coordinated cache. Configurable
history targets and indefinite retention are planned next; no 10 GiB build cap applies.

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

Approved retired heads are removed first, then eligible snapshots. Semantic artifacts,
indexes, receipts, unknown files, shared files and protected snapshots remain. This
increment therefore reclaims eligible full graph history, not every cache data class.
A necessary current graph may exceed your eventual retention target and stays protected.
Queries for a removed historical ID report absence; they do not substitute current data.

The result lists deleted files, logical bytes, remaining candidates and `journalPath`.
Successful runs report `status: complete`; cancellation or an ordinary I/O failure
reports `partial` and exits nonzero. Completed removals are not rolled back. Keep the
journal, inspect remaining files and reprepare. If a head was already retired, update
only that confirmed retirement declaration before preparing again. A zero-deletion
failure can retry the unchanged plan if all evidence/policy inputs still match.

## Interrupted operations

Journals live under `.weftlet-coordination/removals`; they contain IDs/checksums and
paths, not model prompts or graph payloads. Each unlink is preceded by a synced intent.
An uncertain journal write leaves a `.pending` marker; process death can also leave a
gate/activity marker. Further maintenance is blocked rather than guessing completion.

Preserve these records and quiesce cache users for investigation. Explicit reviewed
recovery is the next R3b3b slice; this candidate has no force-unlock or journal replay
command. Do not remove markers merely because their PID is absent or their date is old.
The supported boundary is a cooperating local filesystem with upgraded clients;
shared/distributed filesystem and power-loss recovery are not qualified here.

For accounting and larger retained history, see [inspection](CACHE-INSPECTION.md) and
the [configurable retention direction](../CACHE-RETENTION-PLAN.md#outcome-and-evidence).
